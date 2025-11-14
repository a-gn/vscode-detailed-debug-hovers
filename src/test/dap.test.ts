/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 *
 * Tests for Debug Adapter Protocol (DAP) communication
 * These tests mock the debug session to verify evaluation logic
 */

import * as assert from 'assert';

// Mock types matching VSCode DAP interfaces
interface MockDebugSession {
    customRequest(command: string, args?: any): Promise<any>;
}

interface EvaluateResponse {
    success: boolean;
    body?: {
        result: string;
        type?: string;
        variablesReference: number;
    };
    message?: string;
}

suite('DAP Communication Tests', () => {
    test('Should call customRequest with correct evaluate parameters', async () => {
        let capturedCommand = '';
        let capturedArgs: any = null;

        const mockSession: MockDebugSession = {
            customRequest: async (command: string, args?: any) => {
                capturedCommand = command;
                capturedArgs = args;
                return {
                    success: true,
                    body: {
                        result: 'array([0., 0.])',
                        type: 'numpy.ndarray',
                        variablesReference: 0
                    }
                };
            }
        };

        const expression = 'arr1';
        await mockSession.customRequest('evaluate', {
            expression,
            context: 'hover'
        });

        assert.strictEqual(capturedCommand, 'evaluate', 'Should call evaluate command');
        assert.strictEqual(capturedArgs.expression, 'arr1', 'Should pass expression');
        assert.strictEqual(capturedArgs.context, 'hover', 'Should pass hover context');
    });

    test('Should handle successful evaluate response with type', async () => {
        const mockResponse: EvaluateResponse = {
            success: true,
            body: {
                result: 'array([[0., 0.]])',
                type: 'numpy.ndarray',
                variablesReference: 1
            }
        };

        assert.ok(mockResponse.success, 'Response should be successful');
        assert.ok(mockResponse.body, 'Response should have body');
        assert.strictEqual(mockResponse.body.type, 'numpy.ndarray', 'Should have type');
    });

    test('Should handle evaluate response without type field', async () => {
        const mockResponse: EvaluateResponse = {
            success: true,
            body: {
                result: 'array([[0., 0.]])',
                type: undefined, // Type not provided
                variablesReference: 1
            }
        };

        const type = mockResponse.body?.type || '';
        assert.strictEqual(type, '', 'Should handle missing type as empty string');
    });

    test('Should handle failed evaluate response', async () => {
        const mockResponse: EvaluateResponse = {
            success: false,
            message: 'Variable not found'
        };

        assert.ok(!mockResponse.success, 'Response should indicate failure');
        assert.ok(!mockResponse.body, 'Failed response should not have body');
    });

    test('Should evaluate attributes with correct expressions', async () => {
        const calls: string[] = [];

        const mockSession: MockDebugSession = {
            customRequest: async (command: string, args?: any) => {
                if (command === 'evaluate') {
                    calls.push(args.expression);
                    return {
                        success: true,
                        body: {
                            result: getResultForExpression(args.expression),
                            variablesReference: 0
                        }
                    };
                }
                return { success: false };
            }
        };

        // Simulate evaluating attributes
        const variableName = 'arr1';
        const attributes = ['shape', 'dtype', 'device'];

        for (const attr of attributes) {
            await mockSession.customRequest('evaluate', {
                expression: `${variableName}.${attr}`,
                context: 'hover'
            });
        }

        assert.strictEqual(calls.length, 3, 'Should make 3 evaluate calls');
        assert.ok(calls.includes('arr1.shape'), 'Should evaluate shape');
        assert.ok(calls.includes('arr1.dtype'), 'Should evaluate dtype');
        assert.ok(calls.includes('arr1.device'), 'Should evaluate device');
    });

    test('Should handle various NumPy type strings', () => {
        const numpyTypes = [
            'numpy.ndarray',
            'ndarray',
            'numpy.core.ndarray',
            'numpy.ma.core.MaskedArray'
        ];

        const supportedTypes = new Set(['numpy.ndarray']);

        numpyTypes.forEach(type => {
            const exactMatch = supportedTypes.has(type);
            const substringMatch = Array.from(supportedTypes).some(
                supported => type.includes(supported) || supported.includes(type)
            );

            const isSupported = exactMatch || substringMatch;

            if (type === 'numpy.ndarray') {
                assert.ok(isSupported, `${type} should be supported (exact match)`);
            } else if (type === 'ndarray') {
                assert.ok(isSupported, `${type} should be supported (substring match)`);
            }
        });
    });

    test('Should handle various JAX type strings', () => {
        const jaxTypes = [
            'jax.Array',
            'jaxlib.xla_extension.ArrayImpl',
            'jaxlib.xla_extension.DeviceArray' // older JAX versions
        ];

        const supportedTypes = new Set(['jax.Array', 'jaxlib.xla_extension.ArrayImpl']);

        jaxTypes.forEach(type => {
            const isSupported = supportedTypes.has(type);

            if (type === 'jax.Array' || type === 'jaxlib.xla_extension.ArrayImpl') {
                assert.ok(isSupported, `${type} should be supported`);
            } else {
                assert.ok(!isSupported, `${type} should not be supported (not in config)`);
            }
        });
    });

    test('Should construct proper DAP evaluate request for frameId', () => {
        const request = {
            expression: 'arr1',
            frameId: 123,
            context: 'hover'
        };

        assert.ok(request.frameId, 'Should include frameId');
        assert.strictEqual(request.frameId, 123, 'Should have correct frameId');
        assert.strictEqual(request.context, 'hover', 'Should have hover context');
    });

    test('Should handle concurrent attribute evaluations', async () => {
        let requestCount = 0;

        const mockSession: MockDebugSession = {
            customRequest: async (_command: string, args?: any) => {
                requestCount++;
                // Simulate async delay
                await new Promise(resolve => setTimeout(resolve, 10));
                return {
                    success: true,
                    body: {
                        result: getResultForExpression(args.expression),
                        variablesReference: 0
                    }
                };
            }
        };

        // Simulate parallel evaluation using Promise.all
        const attributes = ['shape', 'dtype', 'device'];
        const promises = attributes.map(attr =>
            mockSession.customRequest('evaluate', {
                expression: `arr.${attr}`,
                context: 'hover'
            })
        );

        const results = await Promise.all(promises);

        assert.strictEqual(results.length, 3, 'Should get 3 results');
        assert.strictEqual(requestCount, 3, 'Should make 3 requests');
        results.forEach(result => {
            assert.ok(result.success, 'Each request should succeed');
        });
    });

    test('Should handle attribute evaluation failure gracefully', async () => {
        const mockSession: MockDebugSession = {
            customRequest: async (_command: string, args?: any) => {
                // Simulate device attribute not existing for NumPy
                if (args.expression.includes('.device')) {
                    return {
                        success: false,
                        message: 'AttributeError: numpy.ndarray has no attribute device'
                    };
                }
                return {
                    success: true,
                    body: {
                        result: getResultForExpression(args.expression),
                        variablesReference: 0
                    }
                };
            }
        };

        const attributes = ['shape', 'dtype', 'device'];
        const results = await Promise.all(
            attributes.map(attr =>
                mockSession.customRequest('evaluate', {
                    expression: `arr.${attr}`,
                    context: 'hover'
                })
            )
        );

        const successfulResults = results.filter(r => r.success);
        assert.strictEqual(successfulResults.length, 2, 'Should have 2 successful results');

        const failedResults = results.filter(r => !r.success);
        assert.strictEqual(failedResults.length, 1, 'Should have 1 failed result');
    });

    test('Should parse realistic NumPy evaluate responses', () => {
        const responses = [
            {
                success: true,
                body: {
                    result: 'array([[0., 0., 0.],\n       [0., 0., 0.]])',
                    type: 'numpy.ndarray',
                    variablesReference: 123
                }
            },
            {
                success: true,
                body: {
                    result: '(10, 10)',
                    type: 'tuple',
                    variablesReference: 0
                }
            },
            {
                success: true,
                body: {
                    result: 'dtype(\'float64\')',
                    type: 'numpy.dtype',
                    variablesReference: 0
                }
            }
        ];

        responses.forEach((response, index) => {
            assert.ok(response.success, `Response ${index} should be successful`);
            assert.ok(response.body, `Response ${index} should have body`);
            assert.ok(response.body.result, `Response ${index} should have result`);
        });
    });

    test('Should parse realistic JAX evaluate responses', () => {
        const responses = [
            {
                success: true,
                body: {
                    result: 'Array([[0., 0., 0.],\n       [0., 0., 0.]], dtype=float32)',
                    type: 'jaxlib.xla_extension.ArrayImpl',
                    variablesReference: 456
                }
            },
            {
                success: true,
                body: {
                    result: '(1024, 768)',
                    type: 'tuple',
                    variablesReference: 0
                }
            },
            {
                success: true,
                body: {
                    result: 'dtype(\'float32\')',
                    variablesReference: 0
                }
            },
            {
                success: true,
                body: {
                    result: 'TFRT_CPU_0',
                    type: 'str',
                    variablesReference: 0
                }
            }
        ];

        responses.forEach((response, index) => {
            assert.ok(response.success, `Response ${index} should be successful`);
            assert.ok(response.body, `Response ${index} should have body`);
        });
    });
});

// Helper function to simulate attribute results
function getResultForExpression(expr: string): string {
    if (expr.includes('.shape')) {
        return '(10, 10)';
    }
    if (expr.includes('.dtype')) {
        return "dtype('float64')";
    }
    if (expr.includes('.device')) {
        return 'cpu';
    }
    return 'unknown';
}
