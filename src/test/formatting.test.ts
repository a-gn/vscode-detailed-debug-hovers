/**
 * Unit tests for formatting and conversion functions
 * Tests the formatting logic without requiring VSCode environment
 */

import * as assert from 'assert';

suite('Shape Formatting Tests', () => {
    // Simulating the formatShape method from ArrayInspectorProvider
    function formatShape(shape: string, type: string): string {
        // Convert torch.Size([2, 2]) to (2, 2)
        if (type.includes('torch.Tensor') || type.includes('Tensor')) {
            const sizeMatch = shape.match(/torch\.Size\(\[([^\]]*)\]\)/);
            if (sizeMatch) {
                return `(${sizeMatch[1]})`;
            }
        }
        // Return as-is if no pattern matched
        return shape;
    }

    test('Should format torch.Size to tuple format', () => {
        const input = 'torch.Size([2, 3])';
        const result = formatShape(input, 'torch.Tensor');
        assert.strictEqual(result, '(2, 3)');
    });

    test('Should format torch.Size with multiple dimensions', () => {
        const input = 'torch.Size([10, 20, 30, 40])';
        const result = formatShape(input, 'torch.Tensor');
        assert.strictEqual(result, '(10, 20, 30, 40)');
    });

    test('Should handle single dimension torch.Size', () => {
        const input = 'torch.Size([100])';
        const result = formatShape(input, 'torch.Tensor');
        assert.strictEqual(result, '(100)');
    });

    test('Should handle zero-dimensional torch.Size', () => {
        const input = 'torch.Size([])';
        const result = formatShape(input, 'torch.Tensor');
        assert.strictEqual(result, '()');
    });

    test('Should leave NumPy shapes unchanged', () => {
        const input = '(10, 20)';
        const result = formatShape(input, 'numpy.ndarray');
        assert.strictEqual(result, '(10, 20)');
    });

    test('Should leave JAX shapes unchanged', () => {
        const input = '(5, 5)';
        const result = formatShape(input, 'jax.Array');
        assert.strictEqual(result, '(5, 5)');
    });

    test('Should handle malformed torch.Size gracefully', () => {
        const input = 'torch.Size(invalid)';
        const result = formatShape(input, 'torch.Tensor');
        assert.strictEqual(result, 'torch.Size(invalid)');
    });

    test('Should handle non-torch types with torch.Size string', () => {
        const input = 'torch.Size([2, 2])';
        const result = formatShape(input, 'numpy.ndarray');
        assert.strictEqual(result, 'torch.Size([2, 2])');
    });
});

suite('Dtype Formatting Tests', () => {
    // Simulating the formatDtype method
    function formatDtype(dtype: string, type: string, config?: any): string {
        const defaultConfig = {
            pytorchPrefix: 'torch.',
            numpyPrefix: 'np.',
            jaxNumpyPrefix: 'jnp.'
        };
        const cfg = config || defaultConfig;

        let prefix = '';
        let dtypeName = dtype;

        if (type.includes('torch.Tensor') || type.includes('Tensor')) {
            prefix = cfg.pytorchPrefix || 'torch.';
            const torchMatch = dtype.match(/torch\.(\w+)/);
            if (torchMatch) {
                dtypeName = torchMatch[1];
            }
        } else if (type.includes('numpy.ndarray') || type.includes('ndarray')) {
            prefix = cfg.numpyPrefix || 'np.';
            if (dtype.startsWith('dtype(') && dtype.endsWith(')')) {
                dtypeName = dtype.slice(6, -1).replace(/['"]/g, '');
            } else {
                const match = dtype.match(/dtype\(['"]?([^'"]+)['"]?\)/);
                if (match) {
                    dtypeName = match[1];
                }
            }
        } else if (type.includes('jax.Array') || type.includes('ArrayImpl')) {
            prefix = cfg.jaxNumpyPrefix || 'jnp.';
            const match = dtype.match(/dtype\(['"]?([^'"]+)['"]?\)/);
            if (match) {
                dtypeName = match[1];
            }
        } else {
            const match = dtype.match(/dtype\(['"]?([^'"]+)['"]?\)/);
            if (match) {
                dtypeName = match[1];
            }
        }

        if (prefix && !prefix.endsWith('.')) {
            prefix += '.';
        }

        return `${prefix}${dtypeName}`;
    }

    test('Should format NumPy dtype with single quotes', () => {
        const result = formatDtype("dtype('float64')", 'numpy.ndarray');
        assert.strictEqual(result, 'np.float64');
    });

    test('Should format NumPy dtype with double quotes', () => {
        const result = formatDtype('dtype("int32")', 'numpy.ndarray');
        assert.strictEqual(result, 'np.int32');
    });

    test('Should format NumPy complex dtypes', () => {
        const result = formatDtype("dtype('complex128')", 'numpy.ndarray');
        assert.strictEqual(result, 'np.complex128');
    });

    test('Should format PyTorch dtypes', () => {
        const result = formatDtype('torch.float32', 'torch.Tensor');
        assert.strictEqual(result, 'torch.float32');
    });

    test('Should format PyTorch dtype - int64', () => {
        const result = formatDtype('torch.int64', 'torch.Tensor');
        assert.strictEqual(result, 'torch.int64');
    });

    test('Should format JAX dtypes', () => {
        const result = formatDtype("dtype('float32')", 'jax.Array');
        assert.strictEqual(result, 'jnp.float32');
    });

    test('Should handle custom NumPy prefix', () => {
        const config = { numpyPrefix: 'numpy.', pytorchPrefix: 'torch.', jaxNumpyPrefix: 'jnp.' };
        const result = formatDtype("dtype('float64')", 'numpy.ndarray', config);
        assert.strictEqual(result, 'numpy.float64');
    });

    test('Should handle custom PyTorch prefix', () => {
        const config = { pytorchPrefix: 't.', numpyPrefix: 'np.', jaxNumpyPrefix: 'jnp.' };
        const result = formatDtype('torch.float32', 'torch.Tensor', config);
        assert.strictEqual(result, 't.float32');
    });

    test('Should handle custom JAX prefix', () => {
        const config = { jaxNumpyPrefix: 'jax.numpy.', numpyPrefix: 'np.', pytorchPrefix: 'torch.' };
        const result = formatDtype("dtype('float32')", 'jax.Array', config);
        assert.strictEqual(result, 'jax.numpy.float32');
    });

    test('Should handle empty prefix for NumPy', () => {
        const config = { numpyPrefix: '', pytorchPrefix: 'torch.', jaxNumpyPrefix: 'jnp.' };
        const result = formatDtype("dtype('float64')", 'numpy.ndarray', config);
        // When prefix is empty string, it falls back to default 'np.'
        assert.strictEqual(result, 'np.float64');
    });

    test('Should handle prefix without trailing dot', () => {
        const config = { pytorchPrefix: 'torch', numpyPrefix: 'np', jaxNumpyPrefix: 'jnp' };
        const result = formatDtype('torch.float32', 'torch.Tensor', config);
        assert.strictEqual(result, 'torch.float32');
    });

    test('Should handle NumPy structured array dtype', () => {
        const result = formatDtype("dtype([('x', '<f4'), ('y', '<f4')])", 'numpy.ndarray');
        // Quotes are removed by .replace(/['"]/g, '')
        assert.strictEqual(result, "np.[(x, <f4), (y, <f4)]");
    });

    test('Should handle NumPy object dtype', () => {
        const result = formatDtype("dtype('O')", 'numpy.ndarray');
        assert.strictEqual(result, 'np.O');
    });

    test('Should handle NumPy unicode dtype', () => {
        const result = formatDtype("dtype('U10')", 'numpy.ndarray');
        assert.strictEqual(result, 'np.U10');
    });
});

suite('Device Formatting Tests', () => {
    // Simulating the formatDevice method
    function formatDevice(device: string, type: string): string {
        if (type.includes('torch.Tensor') || type.includes('Tensor')) {
            const cpuMatch = device.match(/device\(type=['"]cpu['"]\)/);
            if (cpuMatch) {
                return 'cpu';
            }

            const cudaMatch = device.match(/device\(type=['"]cuda['"],?\s*(?:index=(\d+))?\)/);
            if (cudaMatch) {
                const index = cudaMatch[1] || '0';
                return `gpu_${index}`;
            }

            if (device === 'cpu') {
                return 'cpu';
            }

            const cudaSimpleMatch = device.match(/cuda:(\d+)/);
            if (cudaSimpleMatch) {
                return `gpu_${cudaSimpleMatch[1]}`;
            }
        }

        return device;
    }

    test('Should format PyTorch CPU device', () => {
        const result = formatDevice("device(type='cpu')", 'torch.Tensor');
        assert.strictEqual(result, 'cpu');
    });

    test('Should format PyTorch CUDA device with index', () => {
        const result = formatDevice("device(type='cuda', index=0)", 'torch.Tensor');
        assert.strictEqual(result, 'gpu_0');
    });

    test('Should format PyTorch CUDA device without index', () => {
        const result = formatDevice("device(type='cuda')", 'torch.Tensor');
        assert.strictEqual(result, 'gpu_0');
    });

    test('Should format PyTorch cuda:0 format', () => {
        const result = formatDevice('cuda:0', 'torch.Tensor');
        assert.strictEqual(result, 'gpu_0');
    });

    test('Should format PyTorch cuda:1 format', () => {
        const result = formatDevice('cuda:1', 'torch.Tensor');
        assert.strictEqual(result, 'gpu_1');
    });

    test('Should handle simple cpu string', () => {
        const result = formatDevice('cpu', 'torch.Tensor');
        assert.strictEqual(result, 'cpu');
    });

    test('Should leave NumPy devices unchanged', () => {
        const result = formatDevice('cpu', 'numpy.ndarray');
        assert.strictEqual(result, 'cpu');
    });

    test('Should leave JAX devices unchanged', () => {
        const result = formatDevice('TFRT_CPU_0', 'jax.Array');
        assert.strictEqual(result, 'TFRT_CPU_0');
    });

    test('Should handle PyTorch CUDA device with high index', () => {
        const result = formatDevice("device(type='cuda', index=7)", 'torch.Tensor');
        assert.strictEqual(result, 'gpu_7');
    });

    test('Should handle cuda:X format with high index', () => {
        const result = formatDevice('cuda:15', 'torch.Tensor');
        assert.strictEqual(result, 'gpu_15');
    });
});

suite('Dtype Conversion Tests', () => {
    // Simulating conversion methods
    function convertDtypeGeneric(dtype: string): string {
        const lastDot = dtype.lastIndexOf('.');
        if (lastDot !== -1) {
            return dtype.substring(lastDot + 1);
        }
        return dtype;
    }

    test('Should extract NumPy dtype name from prefixed format', () => {
        const result = convertDtypeGeneric('np.float64');
        assert.strictEqual(result, 'float64');
    });

    test('Should extract PyTorch dtype name from prefixed format', () => {
        const result = convertDtypeGeneric('torch.int32');
        assert.strictEqual(result, 'int32');
    });

    test('Should extract JAX dtype name from prefixed format', () => {
        const result = convertDtypeGeneric('jnp.complex64');
        assert.strictEqual(result, 'complex64');
    });

    test('Should handle dtype without prefix', () => {
        const result = convertDtypeGeneric('float32');
        assert.strictEqual(result, 'float32');
    });

    test('Should handle multiple dots in dtype', () => {
        const result = convertDtypeGeneric('jax.numpy.float32');
        assert.strictEqual(result, 'float32');
    });

    test('Should handle empty string', () => {
        const result = convertDtypeGeneric('');
        assert.strictEqual(result, '');
    });
});

suite('Device Conversion to JAX Tests', () => {
    function convertDeviceToJax(device: string, prefix: string): string {
        const moduleRef = prefix.endsWith('.') && prefix !== '' ? prefix.slice(0, -1) : prefix;
        const separator = moduleRef === '' ? '' : '.';

        if (device === 'cpu') {
            return `${moduleRef}${separator}devices('cpu')[0]`;
        } else if (device.startsWith('gpu_')) {
            const gpuMatch = device.match(/gpu_(\d+)/);
            if (gpuMatch) {
                const deviceNum = gpuMatch[1];
                return `${moduleRef}${separator}devices('gpu')[${deviceNum}]`;
            }
            return `${moduleRef}${separator}devices('gpu')[0]`;
        } else if (device.toLowerCase().includes('gpu') || device.toLowerCase().includes('cuda')) {
            return `${moduleRef}${separator}devices('gpu')[0]`;
        }
        return `${moduleRef}${separator}devices()[0]`;
    }

    test('Should convert cpu to JAX format', () => {
        const result = convertDeviceToJax('cpu', 'jax.');
        assert.strictEqual(result, "jax.devices('cpu')[0]");
    });

    test('Should convert gpu_0 to JAX format', () => {
        const result = convertDeviceToJax('gpu_0', 'jax.');
        assert.strictEqual(result, "jax.devices('gpu')[0]");
    });

    test('Should convert gpu_1 to JAX format', () => {
        const result = convertDeviceToJax('gpu_1', 'jax.');
        assert.strictEqual(result, "jax.devices('gpu')[1]");
    });

    test('Should handle empty prefix', () => {
        const result = convertDeviceToJax('cpu', '');
        assert.strictEqual(result, "devices('cpu')[0]");
    });

    test('Should handle prefix without dot', () => {
        const result = convertDeviceToJax('cpu', 'jax');
        assert.strictEqual(result, "jax.devices('cpu')[0]");
    });

    test('Should convert cuda to JAX GPU format', () => {
        const result = convertDeviceToJax('cuda', 'jax.');
        assert.strictEqual(result, "jax.devices('gpu')[0]");
    });

    test('Should handle unknown device', () => {
        const result = convertDeviceToJax('unknown', 'jax.');
        assert.strictEqual(result, "jax.devices()[0]");
    });
});

suite('Device Conversion to PyTorch Tests', () => {
    function convertDeviceToPytorch(device: string, prefix: string): string {
        const moduleRef = prefix.endsWith('.') && prefix !== '' ? prefix.slice(0, -1) : prefix;
        const separator = moduleRef === '' ? '' : '.';

        if (device === 'cpu') {
            return `${moduleRef}${separator}device('cpu')`;
        } else if (device.startsWith('gpu_')) {
            const gpuMatch = device.match(/gpu_(\d+)/);
            if (gpuMatch) {
                const deviceNum = gpuMatch[1];
                return `${moduleRef}${separator}device('cuda:${deviceNum}')`;
            }
            return `${moduleRef}${separator}device('cuda')`;
        } else if (device.toLowerCase().includes('cuda')) {
            const match = device.match(/cuda:?(\d+)?/i);
            if (match) {
                const deviceNum = match[1] || '0';
                return `${moduleRef}${separator}device('cuda:${deviceNum}')`;
            }
            return `${moduleRef}${separator}device('cuda')`;
        }
        return `${moduleRef}${separator}device('${device}')`;
    }

    test('Should convert cpu to PyTorch format', () => {
        const result = convertDeviceToPytorch('cpu', 'torch.');
        assert.strictEqual(result, "torch.device('cpu')");
    });

    test('Should convert gpu_0 to PyTorch format', () => {
        const result = convertDeviceToPytorch('gpu_0', 'torch.');
        assert.strictEqual(result, "torch.device('cuda:0')");
    });

    test('Should convert gpu_3 to PyTorch format', () => {
        const result = convertDeviceToPytorch('gpu_3', 'torch.');
        assert.strictEqual(result, "torch.device('cuda:3')");
    });

    test('Should handle empty prefix', () => {
        const result = convertDeviceToPytorch('cpu', '');
        assert.strictEqual(result, "device('cpu')");
    });

    test('Should handle prefix without dot', () => {
        const result = convertDeviceToPytorch('cpu', 'torch');
        assert.strictEqual(result, "torch.device('cpu')");
    });

    test('Should convert cuda to PyTorch format', () => {
        const result = convertDeviceToPytorch('cuda', 'torch.');
        assert.strictEqual(result, "torch.device('cuda:0')");
    });

    test('Should convert cuda:2 to PyTorch format', () => {
        const result = convertDeviceToPytorch('cuda:2', 'torch.');
        assert.strictEqual(result, "torch.device('cuda:2')");
    });

    test('Should handle unknown device', () => {
        const result = convertDeviceToPytorch('tpu', 'torch.');
        assert.strictEqual(result, "torch.device('tpu')");
    });
});
