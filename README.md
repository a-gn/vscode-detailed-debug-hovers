# Detailed Debug Hovers for VSCode

A VSCode extension that shows detailed array information (shape, dtype, device) in a sidebar panel during Python debugging sessions.

## Features

- **Automatic Array Detection**: Hover over JAX or NumPy arrays during debugging to see their information in the sidebar
- **Pin Arrays**: Pin important arrays to keep them visible across stack frames
- **Real-time Updates**: Array information updates automatically as you step through code
- **Configurable**: Choose which array types and attributes to display

## Usage

1. Start a Python debugging session
2. The Array Inspector panel will appear in the activity bar
3. Hover your cursor over array variables in your code
4. See detailed information (shape, dtype, device) appear in the panel
5. Click the pin icon to keep an array visible even when out of scope

### Pinned Arrays

Pinned arrays stay at the top of the Array Inspector and show:
- Current values when the variable is in scope
- "N/A" when the variable is not available in the current frame

## Supported Types

By default, the extension supports:
- JAX arrays (`jax.Array`, `jaxlib.xla_extension.ArrayImpl`)
- NumPy arrays (`numpy.ndarray`)

## Configuration

Configure which types and attributes to display:

```json
{
  "arrayInspector.supportedTypes": [
    "jax.Array",
    "jaxlib.xla_extension.ArrayImpl",
    "numpy.ndarray"
  ],
  "arrayInspector.attributes": [
    "shape",
    "dtype",
    "device"
  ]
}
```

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch
```

## Testing

1. Open this folder in VSCode
2. Press F5 to launch the Extension Development Host
3. Open a Python file with JAX/NumPy arrays
4. Set a breakpoint and start debugging
5. Hover over array variables to see them in the Array Inspector

## License

MIT
