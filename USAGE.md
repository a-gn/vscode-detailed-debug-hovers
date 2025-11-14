# Usage Guide: Array Inspector Extension

## Quick Start

### 1. Install Dependencies

The extension requires VSCode 1.85.0 or higher. The extension itself has no runtime dependencies - it's already compiled and ready to use.

### 2. Launch the Extension

#### Option A: Test in Development Mode

1. Open this folder in VSCode
2. Press `F5` to launch the Extension Development Host
3. A new VSCode window will open with the extension loaded

#### Option B: Package and Install

```bash
# Install vsce (VSCode Extension Manager)
npm install -g @vscode/vsce

# Package the extension
vsce package

# Install the .vsix file in VSCode
# Extensions -> ... -> Install from VSIX
```

### 3. Test with Example Scripts

In the Extension Development Host window:

1. Open the `test-examples` folder
2. Install required Python packages:
   ```bash
   pip install numpy
   # Or for JAX:
   pip install jax jaxlib  # or jax[cpu]
   ```

3. Open `test-examples/numpy_example.py` or `test-examples/jax_example.py`
4. Set a breakpoint (line 15 in numpy_example.py)
5. Press `F5` to start debugging
6. Select "Python: NumPy Example" or "Python: JAX Example"

## How to Use the Array Inspector

### Viewing Array Information

When debugging a Python program:

1. **Look for the Array Inspector panel** in the activity bar (left sidebar)
   - It has an array icon
   - Only visible during Python debug sessions

2. **Hover your cursor over array variables** in your code
   - The Array Inspector will automatically show information about that array
   - Works for JAX arrays and NumPy arrays

3. **View detailed information**:
   - **shape**: Dimensions of the array
   - **dtype**: Data type (float32, int64, etc.)
   - **device**: Device location (CPU, GPU, etc.)

### Pinning Arrays

**Why pin?** Keep important arrays visible even when you step to different stack frames.

1. **Pin an array**:
   - Hover over the array variable to make it appear in the panel
   - Click the pin icon (📌) next to the array name

2. **Pinned arrays stay at the top** of the panel:
   - Show current values when in scope
   - Show "N/A" when not available in the current frame
   - Persist across all debug sessions until unpinned

3. **Unpin an array**:
   - Click the pinned icon next to the array name

### Example Workflow

```python
import numpy as np

def process_data():
    # Set breakpoint here
    features = np.random.randn(1000, 128)  # Hover here
    labels = np.zeros(1000)                # Hover here

    # Pin 'features' to keep track of it

    normalized = features / features.std()

    # Step to next frame - 'features' still shows in panel if pinned!
    result = train_model(normalized, labels)

    return result
```

## Configuration

### Supported Array Types

By default, the extension recognizes:
- `jax.Array`
- `jaxlib.xla_extension.ArrayImpl`
- `numpy.ndarray`

**To add more types**, edit your VSCode settings:

```json
{
  "arrayInspector.supportedTypes": [
    "jax.Array",
    "jaxlib.xla_extension.ArrayImpl",
    "numpy.ndarray",
    "torch.Tensor",        // Add PyTorch
    "tensorflow.Tensor"    // Add TensorFlow
  ]
}
```

### Displayed Attributes

By default, the extension shows:
- `shape`
- `dtype`
- `device`

**To customize**, edit your VSCode settings:

```json
{
  "arrayInspector.attributes": [
    "shape",
    "dtype",
    "device",
    "size"  // Add total element count
  ]
}
```

**Note**: The extension will attempt to evaluate these as attributes (e.g., `array.shape`). If an attribute doesn't exist or fails to evaluate, it will be silently skipped.

## Troubleshooting

### Panel doesn't appear

- **Check**: Are you in a Python debug session?
- **Check**: Is the debug type `python` or `debugpy`?
- The panel only shows during Python debugging

### Arrays don't show up

- **Check**: Is the array type in `arrayInspector.supportedTypes`?
- **Check**: Are you hovering over the variable in the code?
- Try clicking directly on the variable name

### "N/A" for all attributes

- **Common causes**:
  - Variable is not in scope at current breakpoint
  - Array hasn't been created yet (breakpoint before initialization)
  - Array type doesn't have the requested attributes

- **Solutions**:
  - Step to a frame where the variable exists
  - Check that the array actually has the attributes (e.g., not all arrays have `device`)

### Extension not loading

- **Check**: VSCode version >= 1.85.0
- **Check**: Extension compiled successfully (`npm run compile`)
- **Check**: Look in Output -> Extension Host for errors

## Advanced Usage

### Watching Arrays Across Function Calls

Pin arrays before stepping into functions to track them:

```python
def main():
    data = np.zeros((1000, 100))  # Breakpoint here
    # Pin 'data' in Array Inspector

    result = process(data)  # Step into this function
    # 'data' shows "N/A" inside process() if not passed

    return result  # Step back out
    # 'data' shows values again!
```

### Comparing Array Shapes

Pin multiple arrays to compare their shapes side-by-side:

```python
input_data = jnp.zeros((128, 64))   # Pin this
weights = jnp.ones((64, 32))        # Pin this
output = jnp.dot(input_data, weights)  # Pin this

# Array Inspector shows:
# 📌 input_data - shape: (128, 64)
# 📌 weights - shape: (64, 32)
# 📌 output - shape: (128, 32)
```

### Debugging Shape Mismatches

When you get shape errors, pin the arrays involved to quickly see the mismatch:

```python
try:
    result = jnp.dot(a, b)  # Breakpoint on error
except ValueError as e:
    # Pin 'a' and 'b'
    # Array Inspector immediately shows incompatible shapes
    print(e)
```

## Tips & Best Practices

1. **Pin sparingly**: Too many pinned arrays can clutter the panel
2. **Unpin when done**: Clean up pinned arrays after debugging a feature
3. **Use with Variables view**: The Array Inspector complements (doesn't replace) the standard Variables view
4. **Hover intentionally**: The panel updates on hover, so hover on what you want to inspect
5. **Check device placement**: Especially useful for JAX/PyTorch to verify CPU vs GPU placement

## Keyboard Shortcuts

Currently, the extension works via mouse hover. Future versions may add:
- Keyboard shortcut to inspect word under cursor
- Command palette integration
- Quick pick for pinned arrays

## Limitations

1. **Hover detection**: Uses cursor position, not true "hover" events
2. **Evaluation overhead**: Each attribute requires a debug adapter evaluation request
3. **Python only**: Currently only works with Python debuggers (debugpy)
4. **Type detection**: Relies on debug adapter providing type information

## Contributing

Found a bug or have a feature request?
- File an issue on GitHub
- Check existing issues first
- Provide example code to reproduce

## Next Steps

After trying the extension:
1. Test with your own code
2. Configure supported types for your framework
3. Add custom attributes if needed
4. Share feedback!

Happy debugging! 🐍🔍
