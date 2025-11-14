# Array Inspector VSCode Extension - Design Document

## Project Overview

**Purpose**: A VSCode extension that shows detailed array information (shape, dtype, device) in a sidebar panel during Python debugging sessions. Users can hover/click on array variables to see their properties, and pin arrays to keep them visible across stack frames.

**Target Arrays**: JAX arrays (`jax.Array`, `jaxlib.xla_extension.ArrayImpl`) and NumPy arrays (`numpy.ndarray`)

**Current Status**: Extension is functional. Arrays now appear correctly when clicking on variables during debugging. Fixed by adding `frameId` parameter to DAP evaluate requests.

## Architecture

### High-Level Flow

```
User clicks on array variable in code
    ↓
handleSelectionChange() detects cursor change
    ↓
detectHoveredVariable() extracts variable name
    ↓
ArrayInspectorProvider.handleHover() called
    ↓
evaluateArray() sends customRequest('evaluate') to debug adapter
    ↓
Debug Adapter (debugpy) returns type and value
    ↓
If type matches config, evaluate attributes (.shape, .dtype, .device)
    ↓
Update TreeView and display in sidebar panel
```

### Key Components

#### 1. `src/extension.ts` - Main Extension Entry Point

**Responsibilities**:
- Activate extension and register providers
- Listen to `onDidChangeTextEditorSelection` events (when cursor moves)
- Detect variable names at cursor position
- Filter out Python keywords
- Delegate to ArrayInspectorProvider

**Key Functions**:
- `activate()`: Sets up extension, creates output channel for logging
- `handleSelectionChange()`: Fires when user clicks/moves cursor
- `detectHoveredVariable()`: Extracts word at cursor position

**Important Detail**: Uses `onDidChangeTextEditorSelection`, NOT true hover events. User must **click** or use **arrow keys** to move cursor onto variable.

#### 2. `src/arrayInspector.ts` - Tree View Provider

**Responsibilities**:
- Maintain list of pinned arrays
- Track currently hovered array
- Evaluate expressions via Debug Adapter Protocol (DAP)
- Display results in tree view

**Key Functions**:
- `handleHover(expression)`: Entry point from extension.ts
- `evaluateArray(expression, name, isPinned)`: Main evaluation logic - gets frameId from current stack frame
- `evaluateAttribute(expression, attribute, frameId)`: Evaluate individual attributes like `.shape`
- `isSupportedType(type)`: Check if type matches configuration

**Critical Dependencies**:
- `vscode.debug.activeDebugSession`: Must be non-null
- `session.customRequest('threads', {})`: Gets active threads
- `session.customRequest('stackTrace', {...})`: Gets current stack frame
- `session.customRequest('evaluate', {...})`: DAP protocol call with frameId

#### 3. `src/types.ts` - TypeScript Interfaces

Defines data structures for array information and debug responses.

### Debug Adapter Protocol (DAP) Integration

The extension relies on DAP to evaluate expressions:

```typescript
// First, get the current frame context
const threads = await session.customRequest('threads', {});
const threadId = threads.body.threads[0].id;
const stackTrace = await session.customRequest('stackTrace', {
    threadId: threadId,
    startFrame: 0,
    levels: 1
});
const frameId = stackTrace.body.stackFrames[0].id;

// Request format (with frameId for proper context)
await session.customRequest('evaluate', {
    expression: 'arr1',        // Variable name
    context: 'hover',          // Context hint
    frameId: frameId           // CRITICAL: Stack frame context
})

// Expected response
{
    success: true,
    body: {
        result: "array([[0., 0., ...]])",  // String representation
        type: "numpy.ndarray",              // Type name (if supported)
        variablesReference: 123             // For expansion
    }
}
```

**Critical Requirements**:
- The debug adapter must support returning type information. Python's `debugpy` should support this with the `supportsVariableType` capability.
- **The frameId parameter is essential** - without it, the debugger doesn't know which stack frame's scope to evaluate the expression in, causing evaluations to fail silently or return incorrect results.

## Recent Fix: Added frameId to DAP Requests

**Problem**: Arrays were not appearing in the panel when clicked during debugging sessions.

**Root Cause**: The DAP `evaluate` requests were missing the `frameId` parameter. Without the frame context, the debug adapter didn't know which stack frame's scope to evaluate expressions in, causing silent failures or incorrect evaluations.

**Solution**: Modified `evaluateArray()` and `evaluateAttribute()` in [src/arrayInspector.ts](src/arrayInspector.ts) to:
1. Query the debug adapter for active threads using `customRequest('threads', {})`
2. Get the current stack trace using `customRequest('stackTrace', {...})`
3. Extract the frameId from the top stack frame
4. Include frameId in all evaluate requests
5. Added comprehensive logging to track the entire evaluation flow

**Changes Made**:
- [src/arrayInspector.ts:167-251](src/arrayInspector.ts#L167-L251): Updated `evaluateArray()` to get and use frameId
- [src/arrayInspector.ts:253-279](src/arrayInspector.ts#L253-L279): Updated `evaluateAttribute()` to accept and use frameId parameter
- [src/extension.ts:62-77](src/extension.ts#L62-L77): Fixed log spam by silently ignoring non-Python file selection changes
- Added detailed logging at each step for easier debugging

### Debugging Strategy (if issues persist)

#### Step 1: Check Output Channel
Open Output panel (Ctrl+Shift+U) → Select "Array Inspector" from dropdown.

**What to look for**:
1. Does extension activate? Should see: "Array Inspector extension is now active"
2. Do selection changes fire? Should see: "Selection changed at line X, char Y"
3. Is word detected? Should see: "Detected word: 'arr1'"
4. Does evaluation happen? Should see: "Sending evaluate request for: 'arr1'"
5. What's the response? Should see: "Evaluate response: success=true, body={...}"

#### Step 2: Common Failure Points

**A. Debug session not active**
- Log: "Selection changed but no active debug session"
- **Fix**: Ensure you're paused at a breakpoint, not just debugging

**B. Type information missing**
- Log: "Type for 'arr1': ''" (empty string)
- **Fix**: Debug adapter might not be returning type info
- **Check**: Add `"showReturnValue": true` to launch.json
- **Check**: debugpy version (should be recent, 1.6.0+)

**C. Type not matching configuration**
- Log: "Type 'ndarray' is not in supported types"
- **Fix**: Type name might be short form ("ndarray") vs full form ("numpy.ndarray")
- **Solution**: Update `isSupportedType()` to do substring matching

**D. Evaluation request failing**
- Log: "Error evaluating 'arr1': ..."
- **Fix**: Check if variable is actually in scope at breakpoint
- **Fix**: Check if debug adapter accepts customRequest

**E. Expression not in scope**
- Log: "Evaluation failed for 'arr1'"
- **Fix**: Variable might not exist yet (breakpoint before assignment)

#### Step 3: Type Matching Investigation

The `isSupportedType()` method checks if the returned type matches configuration:

```typescript
private isSupportedType(type: string): boolean {
    // Check exact match first
    if (this.supportedTypes.has(type)) {
        return true;
    }

    // Check if any supported type is a suffix
    for (const supportedType of this.supportedTypes) {
        if (type.endsWith(supportedType) || type.includes(supportedType)) {
            return true;
        }
    }

    return false;
}
```

**Potential Issue**: debugpy might return short type names ("ndarray") instead of fully qualified ("numpy.ndarray").

**Test**: Add this log in `evaluateArray()` right after getting type:
```typescript
this.outputChannel.appendLine(`Checking type "${type}" against: ${Array.from(this.supportedTypes).join(', ')}`);
```

#### Step 4: Frame Context

DAP evaluate requests need proper context. The request uses `context: 'hover'` but might need a `frameId`.

**Potential Fix**: Get the current frame ID:
```typescript
const stackTrace = await session.customRequest('stackTrace', {
    threadId: session.configuration.__sessionId
});
const frameId = stackTrace.body.stackFrames[0].id;

// Then use in evaluate:
await session.customRequest('evaluate', {
    expression: 'arr1',
    frameId: frameId,  // Add this
    context: 'hover'
});
```

## Configuration

Located in `package.json` under `contributes.configuration`:

```json
"arrayInspector.supportedTypes": [
    "jax.Array",
    "jaxlib.xla_extension.ArrayImpl",
    "numpy.ndarray"
]

"arrayInspector.attributes": [
    "shape",
    "dtype",
    "device"
]
```

## Testing

### Test Setup
1. Compile: `npm run compile`
2. Press F5 in VSCode to launch Extension Development Host
3. In new window, open `test-examples/numpy_example.py`
4. Set breakpoint at line 17 (first line after `arr1` assignment)
5. Start debugging: F5, select "Python: NumPy Example"
6. When paused, **click** on the word `arr1`

### Expected Behavior
- Array Inspector panel should update
- Show "arr1 (numpy.ndarray)" as expandable item
- Expand to show shape, dtype
- Device might be null (NumPy doesn't have device concept)

### Minimal Reproduction
```python
import numpy as np

arr = np.zeros((10, 10))  # Set breakpoint here
print(arr.shape)           # Click on 'arr' when paused
```

## Known Limitations

1. **Not true hover**: Uses cursor position, not mouse hover
2. **Requires click**: User must click on variable or use arrow keys
3. **Python only**: Only works with Python debuggers (debugpy)
4. **Type detection**: Relies on debug adapter providing type info
5. **Scope limitations**: Variable must be in current frame scope

## Debug Adapter Protocol Resources

- **Official Spec**: https://microsoft.github.io/debug-adapter-protocol/
- **Evaluate Request**: https://microsoft.github.io/debug-adapter-protocol/specification#Requests_Evaluate
- **debugpy GitHub**: https://github.com/microsoft/debugpy

## How to Use the Extension

### Basic Usage
1. **Start debugging** a Python script with arrays (F5)
2. **Set a breakpoint AFTER the line where arrays are created** (e.g., if `arr1 = np.zeros(...)` is on line 17, set breakpoint on line 18)
3. **Wait for debugger to pause** at the breakpoint
4. **Click on an array variable name** in the code editor (e.g., click on `arr1` in the line above)
5. **Check the Array Inspector panel** in the sidebar (should update within 100ms)
6. **Expand the array item** to see shape, dtype, and device attributes
7. **Pin arrays** to keep them visible when navigating to different stack frames

**Important**: Variables must be **already defined** when the debugger pauses. If you set a breakpoint on the line where a variable is created, that variable won't exist yet!

### What to Expect
- Arrays will appear with their type (e.g., "arr1 (numpy.ndarray)")
- Expandable to show attributes: shape, dtype, device
- Pinned arrays persist across stack frame changes
- Unpinned arrays update when you click on different variables

## Testing

The extension includes comprehensive unit tests that verify core functionality without requiring the full VSCode environment.

### Running Tests

```bash
# Run all unit tests (48 tests - no VSCode needed)
npm run compile && npx mocha 'out/test/*.test.js'

# Or run just one test file
npm run test:unit  # Just unit.test.js
npx mocha out/test/dap.test.js  # Just DAP tests
npx mocha out/test/edge-cases.test.js  # Just edge cases

# Run full integration tests (requires VSCode installation)
npm test
```

### Test Coverage

**All tests pass** ✓ **48 passing** (130ms)

**1. Core Logic Tests** (`src/test/unit.test.ts` - 9 tests):
- Variable name detection logic
- Python keyword filtering
- Type matching (exact and substring matching)
- Attribute expression construction

**2. DAP Communication Tests** (`src/test/dap.test.ts` - 12 tests):
- customRequest parameter validation
- Evaluate response parsing (with/without type)
- Successful and failed responses
- Attribute evaluation with correct expressions
- NumPy and JAX type string handling
- frameId usage in requests
- Concurrent attribute evaluations
- Attribute evaluation failure handling
- Realistic response parsing for NumPy and JAX

**3. Edge Cases and Error Handling** (`src/test/edge-cases.test.ts` - 27 tests):
- Empty/malformed variable names
- Special characters and Unicode
- Very long variable names
- Type strings with whitespace
- Null/undefined handling
- Complex dtypes and device strings
- Error messages from debug adapter
- Timeout scenarios
- Rapid cursor movements
- Pinning/unpinning edge cases
- Session switching
- Configuration edge cases
- Async/Promise error handling
- Debugger pause/resume cycles

**4. Integration Tests** (`src/test/suite/arrayInspector.test.ts`):
Full VSCode environment required:
- ArrayInspectorProvider initialization
- Configuration handling
- Pin/unpin functionality
- Tree view updates
- Selection change events
- Cursor position detection

Run with: `npm test` (requires VSCode installation, not available in headless environment)

### Test Configuration

- `.mocharc.json`: Mocha test runner configuration (TDD interface)
- Test files must use `.test.ts` suffix
- Tests compile to `out/test/` directory

## File Locations

- **Extension code**: `src/extension.ts`, `src/arrayInspector.ts`, `src/types.ts`
- **Unit tests** (48 tests):
  - `src/test/unit.test.ts` - Core logic (9 tests)
  - `src/test/dap.test.ts` - DAP communication (12 tests)
  - `src/test/edge-cases.test.ts` - Edge cases (27 tests)
- **Integration tests**: `src/test/suite/arrayInspector.test.ts` (requires VSCode)
- **Test infrastructure**: `src/test/runTest.ts`, `src/test/suite/index.ts`
- **Configuration**: `package.json`, `.mocharc.json`, `tsconfig.json`
- **Test examples**: `test-examples/numpy_example.py`, `test-examples/jax_example.py`
- **Compiled output**: `out/*.js` (generated by `npm run compile`)

## Next Steps for Debugging

1. **Run the extension** with debugging enabled
2. **Open Output → Array Inspector** to see logs
3. **Set breakpoint** in test script
4. **Click on array variable** when paused
5. **Analyze logs** to see where the flow breaks
6. **Check evaluate response** to see what type is returned
7. **Try Fix 1 or Fix 2** based on findings

## Questions to Answer

When debugging, answer these:

1. ✓ Does the extension activate? (Check output logs)
2. ✓ Do selection changes fire? (Click on variable, check logs)
3. ✓ Is the word detected correctly? (Should see variable name)
4. ✓ Does the debug session exist? (Should not see "no active debug session")
5. ❓ What does the evaluate request return? (Check "Evaluate response" log)
6. ❓ What is the type value? (Check "Type for 'X'" log)
7. ❓ Does the type match? (Check "Type 'X' is supported" vs "not in supported types")
8. ❓ Are attributes evaluated? (Check "Attributes - shape: ..." log)

Focus debugging on questions 5-8, as that's likely where the issue lies.
