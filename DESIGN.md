# Array Inspector VSCode Extension - Design Document

This document is written and maintained by AI agents. It's meant to help them get up to speed quickly in new sessions.

## Project Overview

**Purpose**: A VSCode extension that shows detailed array information (shape, dtype, device) in a sidebar panel during Python debugging sessions. Users can hover/click on array variables to see their properties, and pin arrays to keep them visible across stack frames.

**Target Arrays**: JAX arrays (`jax.Array`, `jaxlib.xla_extension.ArrayImpl`), NumPy arrays (`numpy.ndarray`), and PyTorch tensors (`torch.Tensor`)

**Current Status**: Fully functional with automatic scope scanning and configurable display modes. The panel shows a highlighted array (currently selected), pinned arrays (user-pinned), and all arrays in scope. Arrays automatically update when changing stack frames or when variables go out of scope. Dtypes are formatted cleanly without wrapper syntax. Users can toggle between three display modes: compact one-line, two-line, or expanded (one property per line).

## Architecture

### High-Level Flow

```
Debugging starts → Extension activates
    ↓
Stack frame becomes active → scanScopeForArrays() triggered
    ↓
For each scope in frame:
   - Get all variables via DAP 'scopes' and 'variables' requests
   - Filter for supported array types
   - Evaluate each array to get full info
   - Store in scopeArrays map
    ↓
User clicks on array variable → handleHover() called
    ↓
Set as currentHoveredArray (highlighted)
    ↓
Panel displays (format depends on display mode):
   1. Highlighted: Currently selected array (format varies by mode)
   2. Pinned: Section with user-pinned arrays (persist across frames)
   3. In Scope: Section with all arrays in current frame (no filtering)
    ↓
User moves cursor away → Highlighted array is cleared
    ↓
Stack frame changes → Clear scope, rescan, highlighted remains if still in scope
    ↓
Arrays out of scope → Removed from panel automatically
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
- `detectHoveredVariable()`: Extracts word at cursor position, clears highlighted when moving away

**Important Detail**: Uses `onDidChangeTextEditorSelection`, NOT true hover events. User must **click** or use **arrow keys** to move cursor onto variable.

#### 2. `src/arrayInspector.ts` - Tree View Provider

**Responsibilities**:
- Maintain list of pinned arrays
- Track currently hovered array
- Evaluate expressions via Debug Adapter Protocol (DAP)
- Display results in tree view

**Key Functions**:
- `handleHover(expression)`: Entry point from extension.ts - sets highlighted array
- `clearHighlighted()`: Clears the highlighted array when cursor moves away
- `toggleDisplayMode()`: Cycles through display modes (OneLine → TwoLine → Expanded)
- `getDisplayMode()`: Returns current display mode
- `toggleInlineOnHighlighted()`: Toggles inline display on highlighted array
- `getShowInlineOnHighlighted()`: Returns inline display state
- `getTreeItem(element)`: Returns tree item for display
- `getParent(element)`: Returns parent item (required for reveal functionality)
- `getChildren(element)`: Returns tree structure - highlighted item + sections at root
- `getSectionChildren(sectionType)`: Returns arrays for each section (pinned/scope)
- `getCollapsibleStateForMode()`: Determines if items should be collapsible based on display mode
- `getArrayChildrenForMode(info, isHighlighted)`: Returns child items based on display mode
- `scanScopeForArrays()`: Automatically scans current frame for all array variables
- `getCurrentFrameId()`: Gets current stack frame ID
- `evaluateArray(expression, name, isPinned)`: Main evaluation logic - gets frameId from current stack frame
- `evaluateAttribute(expression, attribute, frameId)`: Evaluate individual attributes like `.shape`
- `formatDtype(dtype)`: Format dtype cleanly (removes `dtype('int32')` wrapper, extracts torch dtype names)
- `isSupportedType(type)`: Check if type matches configuration

**Data Structures**:
- `currentHoveredArray`: Currently selected/highlighted array (format varies by mode)
- `pinnedArrays`: Map of pinned arrays (shown in "Pinned" section)
- `scopeArrays`: Map of all arrays in current scope (shown in "In Scope" section, no filtering)
- `lastFrameId`: Track frame changes to detect when scope needs refreshing
- `displayMode`: Current display mode (OneLine, TwoLine, or Expanded)
- `showInlineOnHighlighted`: Whether to show compact inline info on highlighted array (default: true)

**Critical Dependencies**:
- `vscode.debug.activeDebugSession`: Must be non-null
- `vscode.debug.onDidChangeActiveStackItem`: Listen to stack frame changes for auto-refresh
- `vscode.debug.onDidChangeActiveDebugSession`: Listen to debug session changes
- `session.customRequest('threads', {})`: Gets active threads
- `session.customRequest('stackTrace', {...})`: Gets current stack frame
- `session.customRequest('scopes', {frameId})`: Gets all scopes in frame
- `session.customRequest('variables', {variablesReference})`: Gets all variables in scope
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

## Display Modes

The extension supports three display modes that affect how array information is presented:

### 1. OneLine Mode (Compact)
- **Format**: `name shape dtype device`
- **Example**: `arr1 (10, 10) float64 cpu`
- **Behavior**: All information on a single line, no labels, not expandable
- **Use case**: Maximum information density, quick scanning

### 2. TwoLine Mode
- **Format**:
  - Line 1: `name`
  - Line 2 (child): `shape dtype device`
- **Example**:
  - `arr1` ▼
    - `(10, 10) float64 cpu`
- **Behavior**: Collapsible with compact info on second line
- **Use case**: Balance between compactness and readability

### 3. Expanded Mode (One Property Per Line)
- **Format**:
  - Line 1: `name`
  - Children: `shape: value`, `dtype: value`, `device: value`
- **Example**:
  - `arr1` ▼
    - `shape: (10, 10)`
    - `dtype: float64`
    - `device: cpu`
- **Behavior**: Collapsible with one property per line
- **Use case**: Maximum clarity, easy property identification

### Toggling Display Mode

**Button**: Click the layout icon (☷) in the Array Inspector panel toolbar
**Command**: Use `arrayInspector.toggleDisplayMode` from the command palette
**Behavior**: Cycles through OneLine → TwoLine → Expanded → OneLine

The display mode is global and applies to:
- Pinned arrays
- Arrays in scope

### Inline Display on Highlighted Array

There is a separate toggle for the highlighted (currently selected) array that controls whether it shows compact inline information on its line.

**Button**: Click the ellipsis icon (⋯) in the Array Inspector panel toolbar
**Command**: Use `arrayInspector.toggleInlineOnHighlighted` from the command palette
**Behavior**: Toggles between showing inline compact info and following the global display mode
**Default**: Enabled (shows inline compact info)

When enabled, the highlighted array always shows compact information (`name shape dtype device`) on a single line, regardless of the global display mode. This provides quick at-a-glance information for the currently selected variable.

When disabled, the highlighted array follows the global display mode setting.

## Configuration

Located in `package.json` under `contributes.configuration`:

```json
"arrayInspector.supportedTypes": [
    "jax.Array",
    "jaxlib.xla_extension.ArrayImpl",
    "numpy.ndarray",
    "torch.Tensor"
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
- Array Inspector panel should update immediately
- Show highlighted array with format based on current display mode
- "Pinned" section shows any pinned arrays (collapsibility depends on display mode)
- "In Scope" section shows all arrays in the current frame (collapsibility depends on display mode)
- Moving cursor away from arr1 clears the highlighted item
- Dtypes shown cleanly (e.g., "int32" not "dtype('int32')")
- Toggle button cycles through display modes

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

The panel shows:

1. **Highlighted** (if an array is selected):
   - Format depends on current display mode
   - **OneLine**: `name shape dtype device` (compact, not expandable)
   - **TwoLine**: `name` with collapsible child showing compact properties
   - **Expanded**: `name` with collapsible children showing one property per line
   - Updates when you click on different array variables
   - **Clears automatically** when cursor moves away from the variable

2. **Pinned** (section):
   - Arrays you've manually pinned (click pin icon)
   - Persist across stack frame changes
   - Re-evaluated each time frame changes
   - Shown as "N/A" if no longer in scope
   - Collapsibility depends on display mode

3. **In Scope** (section):
   - **All arrays** found in the current stack frame (automatic scanning!)
   - **No filtering** - shows all arrays including pinned ones
   - Collapsibility depends on display mode
   - Automatically cleared and rescanned when stack frame changes

**Behavior**:
- Arrays shown with their type in tooltips
- Dtypes formatted cleanly (e.g., "float32" not "dtype('float32')")
- Display format controlled by global toggle button (layout icon)
- Arrays disappear automatically when they go out of scope (frame change, variable deleted)
- Stack frame changes trigger automatic rescan of all arrays

## Testing

The extension includes comprehensive unit tests that verify core functionality without requiring the full VSCode environment.

### Running Tests

```bash
# Run all unit tests (172 tests - no VSCode needed)
npm run compile && npx mocha 'out/test/*.test.js'

# Or run specific test files
npx mocha out/test/unit.test.js  # Core logic tests
npx mocha out/test/dap.test.js  # DAP communication tests
npx mocha out/test/edge-cases.test.js  # Edge case tests
npx mocha out/test/formatting.test.js  # Formatting function tests
npx mocha out/test/display-mode.test.js  # Display mode logic tests
npx mocha out/test/array-info-item.test.js  # ArrayInfoItem class tests

# Run full integration tests (requires VSCode installation)
npm test
```

### Test Coverage

**All tests pass** ✓ **172 passing** (149ms)

**1. Core Logic Tests** (`src/test/unit.test.ts` - 9 tests):
- Variable name detection logic
- Python keyword filtering
- Type matching (exact and substring matching)
- Attribute expression construction
- Collapse state detection logic

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

**4. Formatting Function Tests** (`src/test/formatting.test.ts` - 64 tests):
- Shape formatting (torch.Size to tuple conversion)
- Dtype formatting for NumPy, PyTorch, and JAX
- Custom prefix handling for dtypes
- Device formatting (cpu, gpu_0, cuda conversions)
- Dtype conversion to NumPy, JAX, and PyTorch formats
- Device conversion to JAX and PyTorch formats
- Edge cases for malformed inputs

**5. Display Mode Logic Tests** (`src/test/display-mode.test.ts` - 29 tests):
- Display mode cycling (OneLine → TwoLine → Expanded)
- Collapsible state determination for each mode
- Array children count for different modes
- Section collapse state detection
- OneLine and TwoLine compact formatting
- Attribute filtering based on configuration

**6. ArrayInfoItem Class Tests** (`src/test/array-info-item.test.ts` - 31 tests):
- Tooltip building for different array types
- Section item creation (highlighted, pinned, locals, globals)
- Array availability detection
- Context value determination
- Attribute item creation
- Parent section detection and prioritization

**7. Integration Tests** (`src/test/suite/arrayInspector.test.ts`):
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
- **Unit tests** (172 tests):
  - `src/test/unit.test.ts` - Core logic (9 tests)
  - `src/test/dap.test.ts` - DAP communication (12 tests)
  - `src/test/edge-cases.test.ts` - Edge cases and error handling (27 tests)
  - `src/test/formatting.test.ts` - Formatting functions (64 tests)
  - `src/test/display-mode.test.ts` - Display mode logic (29 tests)
  - `src/test/array-info-item.test.ts` - ArrayInfoItem class (31 tests)
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
