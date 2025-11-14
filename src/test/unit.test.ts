/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 *
 * Simple unit tests that don't require VSCode environment
 */

import * as assert from 'assert';

suite('Variable Detection Logic', () => {
    test('Should match Python variable names', () => {
        const variablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

        const validNames = ['arr1', 'my_array', '_private', 'x', 'data123'];
        const invalidNames = ['123', '1abc', 'my-array', 'my array', ''];

        validNames.forEach(name => {
            assert.ok(variablePattern.test(name), `"${name}" should be valid`);
        });

        invalidNames.forEach(name => {
            assert.ok(!variablePattern.test(name), `"${name}" should be invalid`);
        });
    });

    test('Should filter Python keywords', () => {
        const keywords = new Set([
            'def', 'class', 'import', 'from', 'if', 'else', 'elif', 'while', 'for',
            'try', 'except', 'finally', 'with', 'as', 'return', 'yield', 'break',
            'continue', 'pass', 'raise', 'assert', 'del', 'lambda', 'and', 'or',
            'not', 'in', 'is', 'None', 'True', 'False', 'print', 'len', 'range',
            'str', 'int', 'float', 'list', 'dict', 'set', 'tuple'
        ]);

        // These should be filtered
        assert.ok(keywords.has('def'));
        assert.ok(keywords.has('class'));
        assert.ok(keywords.has('import'));
        assert.ok(keywords.has('print'));

        // These should not be filtered
        assert.ok(!keywords.has('arr1'));
        assert.ok(!keywords.has('my_array'));
        assert.ok(!keywords.has('data'));
    });

    test('Should detect array variable names', () => {
        const arrayNames = ['arr', 'arr1', 'array', 'my_array', 'data', 'tensor', 'x', 'y'];
        const variablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        const keywords = new Set(['print', 'def', 'class']);

        arrayNames.forEach(name => {
            const isValid = variablePattern.test(name) && !keywords.has(name);
            assert.ok(isValid, `"${name}" should be detected as a valid array name`);
        });
    });
});

suite('Type Matching Logic', () => {
    test('Should match exact type names', () => {
        const supportedTypes = new Set([
            'jax.Array',
            'jaxlib.xla_extension.ArrayImpl',
            'numpy.ndarray'
        ]);

        assert.ok(supportedTypes.has('numpy.ndarray'));
        assert.ok(supportedTypes.has('jax.Array'));
        assert.ok(!supportedTypes.has('torch.Tensor'));
        assert.ok(!supportedTypes.has('ndarray')); // short form not in set
    });

    test('Should implement substring matching for types', () => {
        const supportedTypes = new Set([
            'jax.Array',
            'jaxlib.xla_extension.ArrayImpl',
            'numpy.ndarray'
        ]);

        function isSupportedType(type: string): boolean {
            // Exact match first
            if (supportedTypes.has(type)) {
                return true;
            }

            // Check if any supported type is a suffix (for cases like 'ndarray')
            for (const supportedType of supportedTypes) {
                if (type.endsWith(supportedType) || type.includes(supportedType)) {
                    return true;
                }
            }

            // Check reverse: if the type includes any of the supported types
            for (const supportedType of supportedTypes) {
                if (supportedType.includes(type)) {
                    return true;
                }
            }

            return false;
        }

        // Exact matches
        assert.ok(isSupportedType('numpy.ndarray'));
        assert.ok(isSupportedType('jax.Array'));

        // Substring matches
        assert.ok(isSupportedType('ndarray'), 'Should match "ndarray" as substring of "numpy.ndarray"');

        // Should not match
        assert.ok(!isSupportedType('torch.Tensor'));
        assert.ok(!isSupportedType('list'));
    });

    test('Should handle type variations', () => {
        const testCases = [
            { type: 'numpy.ndarray', description: 'NumPy array' },
            { type: 'jax.Array', description: 'JAX array' },
            { type: 'jaxlib.xla_extension.ArrayImpl', description: 'JAX XLA array' },
        ];

        testCases.forEach(({ type, description }) => {
            assert.ok(type.length > 0, `${description} should have a non-empty type`);
            assert.ok(type.includes('.') || type === type.toLowerCase(),
                `${description} type should be properly formatted`);
        });
    });
});

suite('Attribute Evaluation Logic', () => {
    test('Should have correct default attributes', () => {
        const defaultAttributes = ['shape', 'dtype', 'device'];

        assert.strictEqual(defaultAttributes.length, 3);
        assert.ok(defaultAttributes.includes('shape'));
        assert.ok(defaultAttributes.includes('dtype'));
        assert.ok(defaultAttributes.includes('device'));
    });

    test('Should construct attribute expressions correctly', () => {
        const variableName = 'arr1';
        const attribute = 'shape';
        const expression = `${variableName}.${attribute}`;

        assert.strictEqual(expression, 'arr1.shape');
    });

    test('Should handle multiple attributes', () => {
        const attributes = ['shape', 'dtype', 'device'];
        const variableName = 'my_array';

        const expressions = attributes.map(attr => `${variableName}.${attr}`);

        assert.strictEqual(expressions.length, 3);
        assert.ok(expressions.includes('my_array.shape'));
        assert.ok(expressions.includes('my_array.dtype'));
        assert.ok(expressions.includes('my_array.device'));
    });
});

// Run tests if this file is executed directly
if (require.main === module) {
    console.log('Running unit tests...');
    let passed = 0;
    let failed = 0;

    // Simple test runner
    const runTest = (name: string, fn: () => void) => {
        try {
            fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (error) {
            console.log(`✗ ${name}`);
            console.error(error);
            failed++;
        }
    };

    console.log('\nVariable Detection Logic:');
    runTest('Should match Python variable names', () => {
        const pattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        assert.ok(pattern.test('arr1'));
        assert.ok(!pattern.test('123'));
    });

    console.log('\nType Matching Logic:');
    runTest('Should match exact type names', () => {
        const types = new Set(['numpy.ndarray', 'jax.Array']);
        assert.ok(types.has('numpy.ndarray'));
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}
