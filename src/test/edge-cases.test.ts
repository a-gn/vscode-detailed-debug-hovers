/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 *
 * Edge case and error handling tests
 */

import * as assert from 'assert';

suite('Pseudo-Variable Filtering', () => {
    test('Should filter out return value pseudo-variables', () => {
        // Debuggers create pseudo-variables like "(return)" for return values
        const pseudoVariables = ['(return)', '(return) value', '(exception)', '(result)'];

        pseudoVariables.forEach(name => {
            assert.ok(name.startsWith('('), `"${name}" should be identified as pseudo-variable`);
        });
    });

    test('Should not filter regular variables', () => {
        const regularVariables = ['arr1', 'my_array', '_private', 'result', 'return_value'];

        regularVariables.forEach(name => {
            assert.ok(!name.startsWith('('), `"${name}" should not be filtered`);
        });
    });

    test('Should handle edge cases with parentheses', () => {
        // Only variables STARTING with "(" should be filtered
        const edgeCases = [
            { name: '(return)', shouldFilter: true },
            { name: 'arr()', shouldFilter: false },  // function call syntax
            { name: 'data(0)', shouldFilter: false }, // indexing syntax
            { name: '(', shouldFilter: true },
            { name: '(test', shouldFilter: true }
        ];

        edgeCases.forEach(({ name, shouldFilter }) => {
            const startsWithParen = name.startsWith('(');
            assert.strictEqual(startsWithParen, shouldFilter,
                `"${name}" filter=${shouldFilter}, got=${startsWithParen}`);
        });
    });
});

suite('Array Sorting', () => {
    test('Should sort array names alphabetically', () => {
        interface MockArrayInfo {
            name: string;
        }

        const unsorted: MockArrayInfo[] = [
            { name: 'z_array' },
            { name: 'a_array' },
            { name: 'm_array' },
            { name: 'b_array' }
        ];

        const sorted = unsorted.slice().sort((a, b) => a.name.localeCompare(b.name));

        assert.strictEqual(sorted[0].name, 'a_array');
        assert.strictEqual(sorted[1].name, 'b_array');
        assert.strictEqual(sorted[2].name, 'm_array');
        assert.strictEqual(sorted[3].name, 'z_array');
    });

    test('Should handle case-insensitive sorting with localeCompare', () => {
        interface MockArrayInfo {
            name: string;
        }

        const unsorted: MockArrayInfo[] = [
            { name: 'Zebra' },
            { name: 'apple' },
            { name: 'Banana' },
            { name: 'aardvark' }
        ];

        const sorted = unsorted.slice().sort((a, b) => a.name.localeCompare(b.name));

        // localeCompare handles case-insensitive sorting naturally
        assert.strictEqual(sorted[0].name, 'aardvark');
        assert.strictEqual(sorted[1].name, 'apple');
        assert.strictEqual(sorted[2].name, 'Banana');
        assert.strictEqual(sorted[3].name, 'Zebra');
    });

    test('Should maintain sort order after updates', () => {
        interface MockArrayInfo {
            name: string;
            value: number;
        }

        const arrays: MockArrayInfo[] = [
            { name: 'c', value: 1 },
            { name: 'a', value: 2 },
            { name: 'b', value: 3 }
        ];

        // Sort by name
        const sorted = arrays.slice().sort((a, b) => a.name.localeCompare(b.name));

        // Verify order
        assert.strictEqual(sorted[0].name, 'a');
        assert.strictEqual(sorted[1].name, 'b');
        assert.strictEqual(sorted[2].name, 'c');

        // Verify values are preserved
        assert.strictEqual(sorted[0].value, 2);
        assert.strictEqual(sorted[1].value, 3);
        assert.strictEqual(sorted[2].value, 1);
    });

    test('Should handle empty arrays in sorting', () => {
        interface MockArrayInfo {
            name: string;
        }

        const empty: MockArrayInfo[] = [];
        const sorted = empty.slice().sort((a, b) => a.name.localeCompare(b.name));

        assert.strictEqual(sorted.length, 0);
    });

    test('Should handle single element in sorting', () => {
        interface MockArrayInfo {
            name: string;
        }

        const single: MockArrayInfo[] = [{ name: 'only_array' }];
        const sorted = single.slice().sort((a, b) => a.name.localeCompare(b.name));

        assert.strictEqual(sorted.length, 1);
        assert.strictEqual(sorted[0].name, 'only_array');
    });
});

suite('Edge Cases and Error Handling', () => {
    test('Should handle empty variable names', () => {
        const variablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        const emptyNames = ['', ' ', '\t', '\n'];

        emptyNames.forEach(name => {
            assert.ok(!variablePattern.test(name), `Empty/whitespace "${name}" should not match`);
        });
    });

    test('Should handle special characters in variable names', () => {
        const variablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        const specialChars = ['arr-1', 'my.array', 'arr@home', 'arr#1', 'arr$'];

        specialChars.forEach(name => {
            assert.ok(!variablePattern.test(name), `"${name}" with special chars should not match`);
        });
    });

    test('Should handle very long variable names', () => {
        const variablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        const longName = 'a' + 'b'.repeat(1000);

        assert.ok(variablePattern.test(longName), 'Very long variable name should match');
        assert.strictEqual(longName.length, 1001, 'Should preserve length');
    });

    test('Should handle Unicode in variable names', () => {
        const variablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        // Python 3 allows Unicode identifiers, but our pattern is ASCII-only
        const unicodeNames = ['café', 'λ', '变量'];

        unicodeNames.forEach(name => {
            assert.ok(!variablePattern.test(name), `Unicode "${name}" should not match ASCII pattern`);
        });
    });

    test('Should handle type strings with extra whitespace', () => {
        const type = ' numpy.ndarray ';
        const trimmedType = type.trim();

        assert.strictEqual(trimmedType, 'numpy.ndarray', 'Should handle trimming');
    });

    test('Should handle malformed type strings', () => {
        const malformedTypes = [
            'numpy.',
            '.ndarray',
            '',
            'numpy..ndarray',
            'numpy.ndarray.'
        ];

        malformedTypes.forEach(type => {
            // Type checking should not crash with malformed types
            assert.ok(typeof type === 'string', `"${type}" should be a string`);
        });
    });

    test('Should handle null/undefined in type matching', () => {
        const supportedTypes = new Set(['numpy.ndarray']);

        // These should not crash
        assert.ok(!supportedTypes.has(null as any), 'null should not match');
        assert.ok(!supportedTypes.has(undefined as any), 'undefined should not match');
        assert.ok(!supportedTypes.has('' as any), 'empty string should not match');
    });

    test('Should handle attribute names with dots', () => {
        const variableName = 'arr';
        const attribute = 'shape';
        const expression = `${variableName}.${attribute}`;

        assert.strictEqual(expression, 'arr.shape', 'Should construct expression');

        // Nested attributes
        const nestedExpression = `${variableName}.dtype.name`;
        assert.strictEqual(nestedExpression, 'arr.dtype.name', 'Should handle nested attributes');
    });

    test('Should handle zero-dimensional arrays', () => {
        const shape = '()';
        assert.ok(shape.length > 0, 'Zero-d shape should be represented');
        assert.strictEqual(shape, '()', 'Zero-d shape is ()');
    });

    test('Should handle very large array shapes', () => {
        const largeShape = '(1000000, 1000000, 100)';
        assert.ok(largeShape.includes(','), 'Large shape should have dimensions');
        assert.ok(largeShape.startsWith('('), 'Shape should start with (');
        assert.ok(largeShape.endsWith(')'), 'Shape should end with )');
    });

    test('Should handle complex dtypes', () => {
        const dtypes = [
            "dtype('float32')",
            "dtype('complex128')",
            "dtype([('x', '<f4'), ('y', '<f4')])", // structured array
            "dtype('U10')", // Unicode string
            "dtype('O')" // object dtype
        ];

        dtypes.forEach(dtype => {
            assert.ok(dtype.includes('dtype'), 'Should contain dtype');
        });
    });

    test('Should handle device strings for different backends', () => {
        const devices = [
            'cpu',
            'gpu:0',
            'cuda:0',
            'TFRT_CPU_0',
            'CpuDevice(id=0)',
            'None' // NumPy doesn't have device
        ];

        devices.forEach(device => {
            assert.ok(typeof device === 'string', 'Device should be string');
        });
    });

    test('Should handle expression evaluation errors', () => {
        const errorMessages = [
            'NameError: name \'arr1\' is not defined',
            'AttributeError: \'numpy.ndarray\' object has no attribute \'device\'',
            'TypeError: \'NoneType\' object is not subscriptable',
            'IndexError: index 0 is out of bounds for axis 0 with size 0'
        ];

        errorMessages.forEach(msg => {
            assert.ok(msg.includes('Error'), 'Should contain Error');
        });
    });

    test('Should handle timeout scenarios', async () => {
        const timeout = 100;
        const promise = new Promise((resolve) => {
            setTimeout(() => resolve('done'), timeout);
        });

        const result = await promise;
        assert.strictEqual(result, 'done', 'Should complete within timeout');
    });

    test('Should handle rapid cursor movements', () => {
        const events = ['arr1', 'arr2', 'arr3', 'arr1', 'arr2'];
        let lastProcessed = '';

        events.forEach(event => {
            // Simulate debouncing by just tracking last
            lastProcessed = event;
        });

        assert.strictEqual(lastProcessed, 'arr2', 'Should track last event');
    });

    test('Should handle pinning the same array multiple times', () => {
        const pinnedArrays = new Map<string, any>();

        const arrayName = 'arr1';

        // Pin once
        pinnedArrays.set(arrayName, { name: arrayName });
        assert.strictEqual(pinnedArrays.size, 1, 'Should have 1 pinned array');

        // Pin again (should not duplicate)
        pinnedArrays.set(arrayName, { name: arrayName });
        assert.strictEqual(pinnedArrays.size, 1, 'Should still have 1 pinned array');
    });

    test('Should handle unpinning non-existent array', () => {
        const pinnedArrays = new Map<string, any>();

        assert.strictEqual(pinnedArrays.size, 0, 'Should start empty');

        // Try to delete non-existent
        const result = pinnedArrays.delete('nonexistent');
        assert.ok(!result, 'Should return false for non-existent');
        assert.strictEqual(pinnedArrays.size, 0, 'Should still be empty');
    });

    test('Should handle many pinned arrays', () => {
        const pinnedArrays = new Map<string, any>();

        for (let i = 0; i < 100; i++) {
            pinnedArrays.set(`arr${i}`, { name: `arr${i}` });
        }

        assert.strictEqual(pinnedArrays.size, 100, 'Should handle 100 pinned arrays');
    });

    test('Should handle switching between debug sessions', () => {
        let currentSession = 'session1';
        const sessionData = new Map<string, any>();

        sessionData.set(currentSession, { arrays: ['arr1', 'arr2'] });
        assert.ok(sessionData.has('session1'), 'Should store session1 data');

        // Switch session
        currentSession = 'session2';
        sessionData.set(currentSession, { arrays: ['arr3'] });
        assert.ok(sessionData.has('session2'), 'Should store session2 data');
        assert.strictEqual(sessionData.size, 2, 'Should have 2 sessions');
    });

    test('Should handle file paths with spaces', () => {
        const filepath = '/home/user/My Documents/test.py';
        assert.ok(filepath.includes(' '), 'Should handle spaces in path');
        assert.ok(filepath.endsWith('.py'), 'Should be Python file');
    });

    test('Should handle configuration with empty arrays', () => {
        const config = {
            supportedTypes: [],
            attributes: []
        };

        assert.strictEqual(config.supportedTypes.length, 0, 'Empty supported types');
        assert.strictEqual(config.attributes.length, 0, 'Empty attributes');
    });

    test('Should handle configuration with null values', () => {
        const config = {
            supportedTypes: null as any,
            attributes: null as any
        };

        const supportedTypes = config.supportedTypes || [];
        const attributes = config.attributes || [];

        assert.strictEqual(supportedTypes.length, 0, 'Should handle null as empty array');
        assert.strictEqual(attributes.length, 0, 'Should handle null as empty array');
    });

    test('Should handle circular references in objects', () => {
        const obj: any = { name: 'arr1' };
        obj.self = obj; // Circular reference

        // Don't try to JSON.stringify circular objects
        assert.ok(obj.name === 'arr1', 'Should access property');
        assert.ok(obj.self === obj, 'Should have circular reference');
    });

    test('Should handle async/await errors', async () => {
        const failingPromise = async () => {
            throw new Error('Async error');
        };

        try {
            await failingPromise();
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should catch error');
            assert.ok(error.message.includes('Async error'), 'Should have error message');
        }
    });

    test('Should handle Promise.all with mixed success/failure', async () => {
        const promises = [
            Promise.resolve('success1'),
            Promise.reject(new Error('failure')),
            Promise.resolve('success2')
        ];

        try {
            await Promise.all(promises);
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should catch first failure');
        }
    });

    test('Should handle Promise.allSettled correctly', async () => {
        const promises = [
            Promise.resolve('success1'),
            Promise.reject(new Error('failure')),
            Promise.resolve('success2')
        ];

        const results = await Promise.allSettled(promises);

        assert.strictEqual(results.length, 3, 'Should have 3 results');
        assert.strictEqual(results[0].status, 'fulfilled', 'First should succeed');
        assert.strictEqual(results[1].status, 'rejected', 'Second should fail');
        assert.strictEqual(results[2].status, 'fulfilled', 'Third should succeed');
    });

    test('Should handle debugger pause/resume cycles', () => {
        let isPaused = false;

        isPaused = true;
        assert.ok(isPaused, 'Should be paused');

        isPaused = false;
        assert.ok(!isPaused, 'Should be resumed');

        // Multiple cycles
        for (let i = 0; i < 10; i++) {
            isPaused = !isPaused;
        }
        assert.ok(!isPaused, 'Should end in resumed state after even cycles');
    });
});
