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

suite('Attribute Chain Detection Logic', () => {
    // This regex matches attribute access chains: obj, obj.array, obj.nested.array
    const attributeChainPattern = /[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*/;

    test('Should match simple variable names', () => {
        const validSimpleNames = ['arr1', 'my_array', '_private', 'x', 'data123'];

        validSimpleNames.forEach(name => {
            const match = name.match(attributeChainPattern);
            assert.ok(match !== null, `"${name}" should match`);
            assert.strictEqual(match![0], name, `Should match entire name "${name}"`);
        });
    });

    test('Should match single-level attribute access', () => {
        const singleLevelAccess = [
            'obj.array',
            'data.tensor',
            'model.weights',
            '_private.field',
            'x123.y456'
        ];

        singleLevelAccess.forEach(expr => {
            const match = expr.match(attributeChainPattern);
            assert.ok(match !== null, `"${expr}" should match`);
            assert.strictEqual(match![0], expr, `Should match entire expression "${expr}"`);
        });
    });

    test('Should match multi-level attribute access', () => {
        const multiLevelAccess = [
            'obj.nested.array',
            'model.layer.weights',
            'data.stats.mean.value',
            'a.b.c.d.e'
        ];

        multiLevelAccess.forEach(expr => {
            const match = expr.match(attributeChainPattern);
            assert.ok(match !== null, `"${expr}" should match`);
            assert.strictEqual(match![0], expr, `Should match entire expression "${expr}"`);
        });
    });

    test('Should not match invalid expressions', () => {
        const invalidExpressions = [
            '123.array',        // starts with number
            'obj.',             // ends with dot
            '.array',           // starts with dot
            'obj..array',       // double dot
            'obj.123',          // attribute starts with number
            'obj. array',       // space after dot
            'obj .array'        // space before dot
        ];

        invalidExpressions.forEach(expr => {
            const match = expr.match(attributeChainPattern);
            const fullMatch = match && match[0] === expr;
            assert.ok(!fullMatch, `"${expr}" should not fully match (matched: ${match?.[0]})`);
        });
    });

    test('Should extract attribute chain from text', () => {
        // Simulate how VSCode would extract a word at cursor position
        const text = 'print(obj.nested.array)';
        const pattern = new RegExp(attributeChainPattern, 'g');
        const matches = text.match(pattern);

        assert.ok(matches !== null);
        assert.ok(matches.includes('print'));
        assert.ok(matches.includes('obj.nested.array'));
    });

    test('Should handle attribute chains with underscores and numbers', () => {
        const validChains = [
            '_obj.array',
            'obj._array',
            'obj123.array456',
            '_private._internal._data',
            'a1.b2.c3'
        ];

        validChains.forEach(expr => {
            const match = expr.match(attributeChainPattern);
            assert.ok(match !== null, `"${expr}" should match`);
            assert.strictEqual(match![0], expr, `Should match entire expression "${expr}"`);
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

    test('Should construct nested attribute expressions correctly', () => {
        const variableName = 'obj.array';
        const attribute = 'shape';
        const expression = `${variableName}.${attribute}`;

        assert.strictEqual(expression, 'obj.array.shape');
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

    test('Should handle multiple attributes for nested objects', () => {
        const attributes = ['shape', 'dtype', 'device'];
        const variableName = 'obj.nested.array';

        const expressions = attributes.map(attr => `${variableName}.${attr}`);

        assert.strictEqual(expressions.length, 3);
        assert.ok(expressions.includes('obj.nested.array.shape'));
        assert.ok(expressions.includes('obj.nested.array.dtype'));
        assert.ok(expressions.includes('obj.nested.array.device'));
    });
});

suite('Collapse State Detection Logic', () => {
    test('Should initialize with empty collapsed states', () => {
        const collapsedStates = new Map<string, boolean>();

        assert.strictEqual(collapsedStates.size, 0);
    });

    test('Should track section collapse state', () => {
        const collapsedStates = new Map<string, boolean>();

        // Simulate collapsing a section
        collapsedStates.set('highlighted', true);
        collapsedStates.set('pinned', true);
        collapsedStates.set('locals', false);

        assert.strictEqual(collapsedStates.get('highlighted'), true);
        assert.strictEqual(collapsedStates.get('pinned'), true);
        assert.strictEqual(collapsedStates.get('locals'), false);
    });

    test('Should detect when all sections are collapsed', () => {
        const collapsedStates = new Map<string, boolean>();
        const sections = ['highlighted', 'pinned', 'locals', 'globals'];

        // All collapsed
        sections.forEach(s => collapsedStates.set(s, true));

        const allCollapsed = sections.every(s => collapsedStates.get(s) === true);
        assert.strictEqual(allCollapsed, true);
    });

    test('Should detect when not all sections are collapsed', () => {
        const collapsedStates = new Map<string, boolean>();
        const sections = ['highlighted', 'pinned', 'locals'];

        // Some collapsed, some expanded
        collapsedStates.set('highlighted', true);
        collapsedStates.set('pinned', false);
        collapsedStates.set('locals', true);

        const allCollapsed = sections.every(s => collapsedStates.get(s) === true);
        assert.strictEqual(allCollapsed, false);
    });

    test('Should treat missing state as not collapsed', () => {
        const collapsedStates = new Map<string, boolean>();
        const sections = ['highlighted', 'pinned'];

        // Only set one section
        collapsedStates.set('highlighted', true);

        // Check if all are collapsed (missing state should be treated as not collapsed)
        const allCollapsed = sections.every(s => collapsedStates.get(s) === true);
        assert.strictEqual(allCollapsed, false);
    });

    test('Should handle empty section list', () => {
        const collapsedStates = new Map<string, boolean>();
        const sections: string[] = [];

        const allCollapsed = sections.every(s => collapsedStates.get(s) === true);
        assert.strictEqual(allCollapsed, true); // Vacuously true for empty array
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
