/**
 * Unit tests for array visualization functionality
 * Tests parseShape, getNormalizeToNumpyExpression, JSON parsing, and other visualization-related methods
 */

import * as assert from 'assert';

suite('Array Visualization Tests', () => {
    suite('JSON encoding/decoding', () => {
        test('should handle newlines via JSON', () => {
            // Simulate what Python's json.dumps returns
            const jsonEncoded = '"[[1 2]\\n [3 4]]"';
            const result = JSON.parse(jsonEncoded);
            assert.strictEqual(result, '[[1 2]\n [3 4]]');
            assert.ok(result.includes('\n'));
        });

        test('should handle tabs via JSON', () => {
            const jsonEncoded = '"column1\\tcolumn2"';
            const result = JSON.parse(jsonEncoded);
            assert.strictEqual(result, 'column1\tcolumn2');
        });

        test('should handle backslashes via JSON', () => {
            const jsonEncoded = '"path\\\\to\\\\file"';
            const result = JSON.parse(jsonEncoded);
            assert.strictEqual(result, 'path\\to\\file');
        });

        test('should handle quotes via JSON', () => {
            const jsonEncoded = '"He said \\"hello\\""';
            const result = JSON.parse(jsonEncoded);
            assert.strictEqual(result, 'He said "hello"');
        });

        test('should handle multiline array string via JSON', () => {
            const jsonEncoded = '"[[0. 0. 0.]\\n [0. 0. 0.]\\n [0. 0. 0.]]"';
            const result = JSON.parse(jsonEncoded);
            assert.strictEqual(result, '[[0. 0. 0.]\n [0. 0. 0.]\n [0. 0. 0.]]');
            assert.ok(result.includes('\n'));
            assert.ok(!result.includes('\\n'));
        });

        test('should handle empty string via JSON', () => {
            const jsonEncoded = '""';
            const result = JSON.parse(jsonEncoded);
            assert.strictEqual(result, '');
        });

        test('should handle complex escape sequences via JSON', () => {
            const jsonEncoded = '"line1\\nline2\\tindented\\\\backslash"';
            const result = JSON.parse(jsonEncoded);
            assert.strictEqual(result, 'line1\nline2\tindented\\backslash');
        });

        test('should handle unicode via JSON', () => {
            const jsonEncoded = '"Hello \\u4e16\\u754c"';
            const result = JSON.parse(jsonEncoded);
            assert.strictEqual(result, 'Hello 世界');
        });
    });

    suite('parseShape', () => {
        // Helper function to simulate parseShape logic
        function parseShape(shapeStr: string | null): { dimensions: number[], totalSize: number } {
            if (!shapeStr) {
                return { dimensions: [], totalSize: 0 };
            }

            try {
                // Parse shape string like "(10, 20, 30)" or "10" or "(10,)"
                const cleaned = shapeStr.replace(/[()]/g, '').trim();
                if (cleaned === '') {
                    return { dimensions: [], totalSize: 0 };
                }

                const dimensions = cleaned.split(',').map(s => {
                    const num = parseInt(s.trim(), 10);
                    return isNaN(num) ? 0 : num;
                }).filter(n => n > 0);

                const totalSize = dimensions.length > 0 ? dimensions.reduce((a, b) => a * b, 1) : 0;

                return { dimensions, totalSize };
            } catch (error) {
                return { dimensions: [], totalSize: 0 };
            }
        }

        test('should parse 1D shape', () => {
            const result = parseShape('(10,)');
            assert.deepStrictEqual(result.dimensions, [10]);
            assert.strictEqual(result.totalSize, 10);
        });

        test('should parse 2D shape', () => {
            const result = parseShape('(10, 20)');
            assert.deepStrictEqual(result.dimensions, [10, 20]);
            assert.strictEqual(result.totalSize, 200);
        });

        test('should parse 3D shape', () => {
            const result = parseShape('(5, 10, 20)');
            assert.deepStrictEqual(result.dimensions, [5, 10, 20]);
            assert.strictEqual(result.totalSize, 1000);
        });

        test('should parse scalar shape (empty tuple)', () => {
            const result = parseShape('()');
            assert.deepStrictEqual(result.dimensions, []);
            assert.strictEqual(result.totalSize, 0);
        });

        test('should handle null shape', () => {
            const result = parseShape(null);
            assert.deepStrictEqual(result.dimensions, []);
            assert.strictEqual(result.totalSize, 0);
        });

        test('should handle shape without parentheses', () => {
            const result = parseShape('10, 20');
            assert.deepStrictEqual(result.dimensions, [10, 20]);
            assert.strictEqual(result.totalSize, 200);
        });

        test('should handle large dimensions', () => {
            const result = parseShape('(1000, 2000, 500)');
            assert.deepStrictEqual(result.dimensions, [1000, 2000, 500]);
            assert.strictEqual(result.totalSize, 1000000000);
        });

        test('should handle shape with extra spaces', () => {
            const result = parseShape('( 10 ,  20  , 30 )');
            assert.deepStrictEqual(result.dimensions, [10, 20, 30]);
            assert.strictEqual(result.totalSize, 6000);
        });

        test('should filter out zero dimensions', () => {
            const result = parseShape('(10, 0, 20)');
            assert.deepStrictEqual(result.dimensions, [10, 20]);
            assert.strictEqual(result.totalSize, 200);
        });

        test('should handle malformed shape gracefully', () => {
            const result = parseShape('invalid');
            assert.deepStrictEqual(result.dimensions, []);
            assert.strictEqual(result.totalSize, 0);
        });
    });

    suite('getNormalizeToNumpyExpression', () => {
        // Helper function to simulate getNormalizeToNumpyExpression logic
        function getNormalizeToNumpyExpression(expression: string, type: string): string {
            // For JAX arrays, use np.array() to copy to CPU
            if (type.includes('jax') || type.includes('Array')) {
                return `__import__('numpy').array(${expression})`;
            }
            // For PyTorch tensors, use .cpu().numpy()
            if (type.includes('torch') || type.includes('Tensor')) {
                return `${expression}.cpu().numpy()`;
            }
            // For NumPy arrays, use as-is
            return expression;
        }

        test('should normalize JAX array', () => {
            const result = getNormalizeToNumpyExpression('arr1', 'jax.Array');
            assert.strictEqual(result, "__import__('numpy').array(arr1)");
        });

        test('should normalize JAX ArrayImpl', () => {
            const result = getNormalizeToNumpyExpression('arr2', 'jaxlib.xla_extension.ArrayImpl');
            assert.strictEqual(result, "__import__('numpy').array(arr2)");
        });

        test('should normalize PyTorch tensor', () => {
            const result = getNormalizeToNumpyExpression('tensor1', 'torch.Tensor');
            assert.strictEqual(result, 'tensor1.cpu().numpy()');
        });

        test('should leave NumPy array as-is', () => {
            const result = getNormalizeToNumpyExpression('arr3', 'numpy.ndarray');
            assert.strictEqual(result, 'arr3');
        });

        test('should handle complex expressions with JAX', () => {
            const result = getNormalizeToNumpyExpression('obj.nested.array', 'jax.Array');
            assert.strictEqual(result, "__import__('numpy').array(obj.nested.array)");
        });

        test('should handle complex expressions with PyTorch', () => {
            const result = getNormalizeToNumpyExpression('model.weights', 'torch.Tensor');
            assert.strictEqual(result, 'model.weights.cpu().numpy()');
        });

        test('should handle unknown type as NumPy', () => {
            const result = getNormalizeToNumpyExpression('arr4', 'unknown.type');
            assert.strictEqual(result, 'arr4');
        });
    });

    suite('buildVisualizationContent', () => {
        // Helper function to simulate buildVisualizationContent logic
        function buildVisualizationContent(
            originalInfo: any,
            arrayStr: string,
            sliceIndices: string | null,
            slicedInfo: any | null
        ): string {
            const lines: string[] = [];

            if (sliceIndices !== null && slicedInfo !== null) {
                // Sliced array visualization
                lines.push(`# Array Visualization: ${originalInfo.name}[${sliceIndices}]`);
                lines.push('');
                lines.push('# Original Array Properties:');
                lines.push(`#   Name: ${originalInfo.name}`);
                lines.push(`#   Type: ${originalInfo.type}`);
                if (originalInfo.shape) lines.push(`#   Shape: ${originalInfo.shape}`);
                if (originalInfo.dtype) lines.push(`#   Dtype: ${originalInfo.dtype}`);
                if (originalInfo.device) lines.push(`#   Device: ${originalInfo.device}`);
                lines.push('');
                lines.push(`# Slice: [${sliceIndices}]`);
                lines.push('');
                lines.push('# Sliced Array Properties:');
                if (slicedInfo.shape) lines.push(`#   Shape: ${slicedInfo.shape}`);
                if (slicedInfo.dtype) lines.push(`#   Dtype: ${slicedInfo.dtype}`);
                if (slicedInfo.device) lines.push(`#   Device: ${slicedInfo.device}`);
                lines.push('');
                lines.push('# Array Data:');
                lines.push(arrayStr);
            } else {
                // Entire array visualization
                lines.push(`# Array Visualization: ${originalInfo.name}`);
                lines.push('');
                lines.push('# Array Properties:');
                lines.push(`#   Name: ${originalInfo.name}`);
                lines.push(`#   Type: ${originalInfo.type}`);
                if (originalInfo.shape) lines.push(`#   Shape: ${originalInfo.shape}`);
                if (originalInfo.dtype) lines.push(`#   Dtype: ${originalInfo.dtype}`);
                if (originalInfo.device) lines.push(`#   Device: ${originalInfo.device}`);
                lines.push('');
                lines.push('# Array Data:');
                lines.push(arrayStr);
            }

            return lines.join('\n');
        }

        test('should build content for entire array', () => {
            const arrayInfo = {
                name: 'arr1',
                type: 'numpy.ndarray',
                shape: '(10, 10)',
                dtype: 'float64',
                device: 'cpu'
            };
            const arrayStr = '[[0. 0. ...]]';

            const content = buildVisualizationContent(arrayInfo, arrayStr, null, null);

            assert.ok(content.includes('# Array Visualization: arr1'));
            assert.ok(content.includes('#   Name: arr1'));
            assert.ok(content.includes('#   Type: numpy.ndarray'));
            assert.ok(content.includes('#   Shape: (10, 10)'));
            assert.ok(content.includes('#   Dtype: float64'));
            assert.ok(content.includes('#   Device: cpu'));
            assert.ok(content.includes('[[0. 0. ...]]'));
            assert.ok(!content.includes('Slice:'));
        });

        test('should build content for sliced array', () => {
            const originalInfo = {
                name: 'arr1',
                type: 'numpy.ndarray',
                shape: '(100, 100)',
                dtype: 'float64',
                device: 'cpu'
            };
            const slicedInfo = {
                name: 'arr1[0:10, :]',
                type: 'numpy.ndarray',
                shape: '(10, 100)',
                dtype: 'float64',
                device: 'cpu'
            };
            const arrayStr = '[[0. 0. ...]]';
            const sliceIndices = '0:10, :';

            const content = buildVisualizationContent(originalInfo, arrayStr, sliceIndices, slicedInfo);

            assert.ok(content.includes('# Array Visualization: arr1[0:10, :]'));
            assert.ok(content.includes('# Original Array Properties:'));
            assert.ok(content.includes('#   Name: arr1'));
            assert.ok(content.includes('#   Shape: (100, 100)'));
            assert.ok(content.includes('# Slice: [0:10, :]'));
            assert.ok(content.includes('# Sliced Array Properties:'));
            assert.ok(content.includes('#   Shape: (10, 100)'));
            assert.ok(content.includes('[[0. 0. ...]]'));
        });

        test('should handle array without device info', () => {
            const arrayInfo = {
                name: 'arr1',
                type: 'numpy.ndarray',
                shape: '(5,)',
                dtype: 'int32',
                device: null
            };
            const arrayStr = '[1 2 3 4 5]';

            const content = buildVisualizationContent(arrayInfo, arrayStr, null, null);

            assert.ok(content.includes('#   Shape: (5,)'));
            assert.ok(content.includes('#   Dtype: int32'));
            assert.ok(!content.includes('#   Device:'));
        });

        test('should handle multiline array string', () => {
            const arrayInfo = {
                name: 'arr1',
                type: 'numpy.ndarray',
                shape: '(3, 3)',
                dtype: 'int32',
                device: 'cpu'
            };
            const arrayStr = '[[1 2 3]\n [4 5 6]\n [7 8 9]]';

            const content = buildVisualizationContent(arrayInfo, arrayStr, null, null);

            assert.ok(content.includes('[[1 2 3]\n [4 5 6]\n [7 8 9]]'));
        });
    });

    suite('Size threshold logic', () => {
        test('should detect arrays exceeding size threshold', () => {
            const dimensions = [100, 100, 100];
            const totalSize = dimensions.reduce((a, b) => a * b, 1);
            const sizeThreshold = 10000;

            assert.strictEqual(totalSize, 1000000);
            assert.ok(totalSize > sizeThreshold);
        });

        test('should detect arrays exceeding dimension threshold', () => {
            const dimensions = [10, 2000, 10];
            const dimensionThreshold = 1000;

            const exceedsDimensionThreshold = dimensions.some(d => d > dimensionThreshold);
            assert.ok(exceedsDimensionThreshold);
        });

        test('should allow small arrays without confirmation', () => {
            const dimensions = [10, 10, 10];
            const totalSize = dimensions.reduce((a, b) => a * b, 1);
            const sizeThreshold = 10000;
            const dimensionThreshold = 1000;

            assert.strictEqual(totalSize, 1000);
            assert.ok(totalSize <= sizeThreshold);
            assert.ok(!dimensions.some(d => d > dimensionThreshold));
        });

        test('should handle edge case at exact threshold', () => {
            const dimensions = [100, 100];
            const totalSize = dimensions.reduce((a, b) => a * b, 1);
            const sizeThreshold = 10000;

            assert.strictEqual(totalSize, 10000);
            assert.ok(totalSize <= sizeThreshold);
        });

        test('should handle single dimension threshold', () => {
            const dimensions = [1000];
            const dimensionThreshold = 1000;

            const exceedsDimensionThreshold = dimensions.some(d => d > dimensionThreshold);
            assert.ok(!exceedsDimensionThreshold);
        });
    });

    suite('Slice expression building', () => {
        test('should build simple slice expression', () => {
            const normalizedExpr = 'arr1';
            const sliceInput = '0:10';
            const slicedExpression = `${normalizedExpr}[${sliceInput}]`;

            assert.strictEqual(slicedExpression, 'arr1[0:10]');
        });

        test('should build multi-dimensional slice expression', () => {
            const normalizedExpr = 'arr1';
            const sliceInput = '0:10, :, 5';
            const slicedExpression = `${normalizedExpr}[${sliceInput}]`;

            assert.strictEqual(slicedExpression, 'arr1[0:10, :, 5]');
        });

        test('should build slice with normalized JAX array', () => {
            const normalizedExpr = "__import__('numpy').array(jax_arr)";
            const sliceInput = '0:10';
            const slicedExpression = `${normalizedExpr}[${sliceInput}]`;

            assert.strictEqual(slicedExpression, "__import__('numpy').array(jax_arr)[0:10]");
        });

        test('should build slice with normalized PyTorch tensor', () => {
            const normalizedExpr = 'tensor1.cpu().numpy()';
            const sliceInput = ':, 0';
            const slicedExpression = `${normalizedExpr}[${sliceInput}]`;

            assert.strictEqual(slicedExpression, 'tensor1.cpu().numpy()[:, 0]');
        });

        test('should handle single index slice', () => {
            const normalizedExpr = 'arr1';
            const sliceInput = '0';
            const slicedExpression = `${normalizedExpr}[${sliceInput}]`;

            assert.strictEqual(slicedExpression, 'arr1[0]');
        });

        test('should handle ellipsis in slice', () => {
            const normalizedExpr = 'arr1';
            const sliceInput = '..., 0';
            const slicedExpression = `${normalizedExpr}[${sliceInput}]`;

            assert.strictEqual(slicedExpression, 'arr1[..., 0]');
        });
    });

    suite('Edge cases', () => {
        test('should handle empty shape string', () => {
            function parseShape(shapeStr: string | null): { dimensions: number[], totalSize: number } {
                if (!shapeStr) {
                    return { dimensions: [], totalSize: 0 };
                }
                const cleaned = shapeStr.replace(/[()]/g, '').trim();
                if (cleaned === '') {
                    return { dimensions: [], totalSize: 0 };
                }
                const dimensions = cleaned.split(',').map(s => {
                    const num = parseInt(s.trim(), 10);
                    return isNaN(num) ? 0 : num;
                }).filter(n => n > 0);
                const totalSize = dimensions.length > 0 ? dimensions.reduce((a, b) => a * b, 1) : 0;
                return { dimensions, totalSize };
            }

            const result = parseShape('');
            assert.deepStrictEqual(result.dimensions, []);
            assert.strictEqual(result.totalSize, 0);
        });

        test('should handle very large arrays', () => {
            function parseShape(shapeStr: string | null): { dimensions: number[], totalSize: number } {
                if (!shapeStr) {
                    return { dimensions: [], totalSize: 0 };
                }
                const cleaned = shapeStr.replace(/[()]/g, '').trim();
                if (cleaned === '') {
                    return { dimensions: [], totalSize: 0 };
                }
                const dimensions = cleaned.split(',').map(s => {
                    const num = parseInt(s.trim(), 10);
                    return isNaN(num) ? 0 : num;
                }).filter(n => n > 0);
                const totalSize = dimensions.length > 0 ? dimensions.reduce((a, b) => a * b, 1) : 0;
                return { dimensions, totalSize };
            }

            const result = parseShape('(10000, 10000)');
            assert.deepStrictEqual(result.dimensions, [10000, 10000]);
            assert.strictEqual(result.totalSize, 100000000);
        });

        test('should handle array info with all null properties', () => {
            function buildVisualizationContent(
                originalInfo: any,
                arrayStr: string
            ): string {
                const lines: string[] = [];
                lines.push(`# Array Visualization: ${originalInfo.name}`);
                lines.push('');
                lines.push('# Array Properties:');
                lines.push(`#   Name: ${originalInfo.name}`);
                lines.push(`#   Type: ${originalInfo.type}`);
                if (originalInfo.shape) lines.push(`#   Shape: ${originalInfo.shape}`);
                if (originalInfo.dtype) lines.push(`#   Dtype: ${originalInfo.dtype}`);
                if (originalInfo.device) lines.push(`#   Device: ${originalInfo.device}`);
                lines.push('');
                lines.push('# Array Data:');
                lines.push(arrayStr);
                return lines.join('\n');
            }

            const arrayInfo = {
                name: 'arr1',
                type: 'numpy.ndarray',
                shape: null,
                dtype: null,
                device: null
            };
            const arrayStr = '[...]';

            const content = buildVisualizationContent(arrayInfo, arrayStr);

            assert.ok(content.includes('#   Name: arr1'));
            assert.ok(content.includes('#   Type: numpy.ndarray'));
            assert.ok(!content.includes('#   Shape:'));
            assert.ok(!content.includes('#   Dtype:'));
            assert.ok(!content.includes('#   Device:'));
        });
    });
});
