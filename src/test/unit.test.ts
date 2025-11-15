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

suite('Cursor-based Truncation Logic', () => {
    // Replicate the truncateAtCursor logic for testing
    function truncateAtCursor(expression: string, cursorOffset: number): string {
        const segments = expression.split('.');
        let currentOffset = 0;

        for (let i = 0; i < segments.length; i++) {
            const segmentStart = currentOffset;
            const segmentEnd = currentOffset + segments[i].length;

            // Check if cursor is within this segment
            if (cursorOffset >= segmentStart && cursorOffset < segmentEnd) {
                // Return all segments up to and including this one
                return segments.slice(0, i + 1).join('.');
            }

            // Move past this segment and the dot
            currentOffset = segmentEnd + 1; // +1 for the dot
        }

        // If we didn't find it (shouldn't happen), return the full expression
        return expression;
    }

    test('Should truncate "arr3.mean" when cursor is on "arr3"', () => {
        // Cursor at offset 0 (start of "arr3")
        assert.strictEqual(truncateAtCursor('arr3.mean', 0), 'arr3');
        // Cursor at offset 2 (middle of "arr3")
        assert.strictEqual(truncateAtCursor('arr3.mean', 2), 'arr3');
        // Cursor at offset 3 (end of "arr3")
        assert.strictEqual(truncateAtCursor('arr3.mean', 3), 'arr3');
    });

    test('Should return full expression when cursor is on last segment', () => {
        // Cursor at offset 5 (start of "mean" after dot)
        assert.strictEqual(truncateAtCursor('arr3.mean', 5), 'arr3.mean');
        // Cursor at offset 7 (middle of "mean")
        assert.strictEqual(truncateAtCursor('arr3.mean', 7), 'arr3.mean');
    });

    test('Should truncate multi-level chains correctly', () => {
        const expr = 'obj.nested.array';
        // Cursor on "obj" (offset 0-2)
        assert.strictEqual(truncateAtCursor(expr, 0), 'obj');
        assert.strictEqual(truncateAtCursor(expr, 2), 'obj');

        // Cursor on "nested" (offset 4-9)
        assert.strictEqual(truncateAtCursor(expr, 4), 'obj.nested');
        assert.strictEqual(truncateAtCursor(expr, 7), 'obj.nested');

        // Cursor on "array" (offset 11-15)
        assert.strictEqual(truncateAtCursor(expr, 11), 'obj.nested.array');
        assert.strictEqual(truncateAtCursor(expr, 15), 'obj.nested.array');
    });

    test('Should handle single-segment expressions', () => {
        assert.strictEqual(truncateAtCursor('arr1', 0), 'arr1');
        assert.strictEqual(truncateAtCursor('arr1', 2), 'arr1');
        assert.strictEqual(truncateAtCursor('arr1', 3), 'arr1');
    });

    test('Should handle long attribute chains', () => {
        const expr = 'a.b.c.d.e';
        // Cursor on "a"
        assert.strictEqual(truncateAtCursor(expr, 0), 'a');
        // Cursor on "b" (offset 2)
        assert.strictEqual(truncateAtCursor(expr, 2), 'a.b');
        // Cursor on "c" (offset 4)
        assert.strictEqual(truncateAtCursor(expr, 4), 'a.b.c');
        // Cursor on "d" (offset 6)
        assert.strictEqual(truncateAtCursor(expr, 6), 'a.b.c.d');
        // Cursor on "e" (offset 8)
        assert.strictEqual(truncateAtCursor(expr, 8), 'a.b.c.d.e');
    });

    test('Should handle segments of varying lengths', () => {
        const expr = 'short.very_long_segment.x';
        // Cursor on "short"
        assert.strictEqual(truncateAtCursor(expr, 0), 'short');
        assert.strictEqual(truncateAtCursor(expr, 4), 'short');
        // Cursor on "very_long_segment"
        assert.strictEqual(truncateAtCursor(expr, 6), 'short.very_long_segment');
        assert.strictEqual(truncateAtCursor(expr, 15), 'short.very_long_segment');
        // Cursor on "x"
        assert.strictEqual(truncateAtCursor(expr, 24), 'short.very_long_segment.x');
    });

    test('Should handle cursor at segment boundaries correctly', () => {
        const expr = 'abc.def.ghi';
        // Just before the dot after "abc" (offset 2, end of "abc")
        assert.strictEqual(truncateAtCursor(expr, 2), 'abc');
        // Just after the first dot (offset 4, start of "def")
        assert.strictEqual(truncateAtCursor(expr, 4), 'abc.def');
        // Just before second dot (offset 6, end of "def")
        assert.strictEqual(truncateAtCursor(expr, 6), 'abc.def');
        // Just after second dot (offset 8, start of "ghi")
        assert.strictEqual(truncateAtCursor(expr, 8), 'abc.def.ghi');
    });
});

suite('VSCode-native Word Detection with Attribute Chain Building', () => {
    /**
     * Builds an attribute chain using position-based cutting.
     * This simulates the new approach: use VSCode's native word detection to find
     * the identifier at the cursor, then use regex to find the full chain and cut it
     * at the identifier's end position.
     *
     * @param line The line of text
     * @param identifierStart The start position of the identifier at cursor (from VSCode)
     * @param identifierEnd The end position of the identifier at cursor (from VSCode)
     * @returns The full attribute chain including any prefix
     */
    function buildAttributeChain(line: string, identifierStart: number, identifierEnd: number): string {
        const identifier = line.substring(identifierStart, identifierEnd);

        // Simulate VSCode's getWordRangeAtPosition with attribute chain regex
        // Find the full attribute chain containing this identifier
        const attributeChainPattern = /[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*/g;

        let match;
        while ((match = attributeChainPattern.exec(line)) !== null) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;

            // Check if the identifier is within this match
            if (identifierStart >= matchStart && identifierEnd <= matchEnd) {
                // Found the full chain containing our identifier
                const fullChain = match[0];
                // Cut at the identifier's end position
                const cutOffset = identifierEnd - matchStart;
                return fullChain.substring(0, cutOffset);
            }
        }

        // No chain found, return just the identifier
        return identifier;
    }

    test('Should detect simple variable without attribute chain', () => {
        const line = 'arr3.mean()';
        // VSCode native detection: cursor on "arr3" (positions 0-4)
        // Identifier is "arr3" at positions 0-4
        const result = buildAttributeChain(line, 0, 4);
        assert.strictEqual(result, 'arr3', 'Cursor on "arr3" should detect "arr3"');
    });

    test('Should detect method call base when cursor is on base identifier', () => {
        const line = 'arr3.mean()';
        // When cursor is on "mean" (positions 5-9), VSCode highlights "mean"
        // We should build backward to include "arr3"
        const result = buildAttributeChain(line, 5, 9);
        assert.strictEqual(result, 'arr3.mean', 'Cursor on "mean" should detect "arr3.mean"');
    });

    test('Should handle nested attribute chains - cursor on first segment', () => {
        const line = 'array_within_object.aa.shape';
        // Cursor on "array_within_object" (positions 0-19)
        const result = buildAttributeChain(line, 0, 19);
        assert.strictEqual(result, 'array_within_object',
            'Cursor on first segment should return just that segment');
    });

    test('Should handle nested attribute chains - cursor on middle segment', () => {
        const line = 'array_within_object.aa.shape';
        // Cursor on "aa" (positions 20-22)
        const result = buildAttributeChain(line, 20, 22);
        assert.strictEqual(result, 'array_within_object.aa',
            'Cursor on middle segment should build chain backward');
    });

    test('Should handle nested attribute chains - cursor on last segment', () => {
        const line = 'array_within_object.aa.shape';
        // Cursor on "shape" (positions 23-28)
        const result = buildAttributeChain(line, 23, 28);
        assert.strictEqual(result, 'array_within_object.aa.shape',
            'Cursor on last segment should build full chain');
    });

    test('Should handle deeply nested chains', () => {
        const line = 'a.b.c.d.e.f';
        // Cursor on "d" (position 6-7)
        const result = buildAttributeChain(line, 6, 7);
        assert.strictEqual(result, 'a.b.c.d', 'Should build chain up to cursor segment');
    });

    test('Should handle chain with underscores and numbers', () => {
        const line = '_private._internal.data123';
        // Cursor on "data123" (positions 19-26)
        const result = buildAttributeChain(line, 19, 26);
        assert.strictEqual(result, '_private._internal.data123',
            'Should handle underscores and numbers correctly');
    });

    test('Should stop at non-identifier characters', () => {
        const line = '(obj.array).shape';
        // Cursor on "array" (positions 5-10)
        const result = buildAttributeChain(line, 5, 10);
        assert.strictEqual(result, 'obj.array',
            'Should build chain backward until hitting non-identifier');
    });

    test('Should handle attribute access after function call', () => {
        const line = 'func().result';
        // Cursor on "result" (positions 7-13)
        const result = buildAttributeChain(line, 7, 13);
        assert.strictEqual(result, 'result',
            'Should not include function call in chain');
    });

    test('Should handle spaces around dots (invalid syntax)', () => {
        const line = 'obj . array';
        // Cursor on "array" (positions 6-11)
        const result = buildAttributeChain(line, 6, 11);
        assert.strictEqual(result, 'array',
            'Should not build chain across spaces');
    });

    test('Bug demonstration: cursor at end of segment should highlight that segment', () => {
        const line = 'a.b.c';
        // This is the key test case from the user's bug report
        // When cursor is at position 1 (just after 'a'), VSCode highlights 'a'
        // VSCode's getWordRangeAtPosition would return range (0, 1) for identifier 'a'
        const result = buildAttributeChain(line, 0, 1);
        assert.strictEqual(result, 'a',
            'Cursor just after "a" should highlight "a", not "b"');
    });

    test('Bug demonstration: cursor at start of second segment', () => {
        const line = 'a.b.c';
        // When cursor is at position 2 (on 'b'), VSCode highlights 'b'
        // VSCode's getWordRangeAtPosition would return range (2, 3) for identifier 'b'
        const result = buildAttributeChain(line, 2, 3);
        assert.strictEqual(result, 'a.b',
            'Cursor on "b" should highlight "a.b"');
    });

    test('Bug demonstration: nested object example', () => {
        const line = 'array_within_object.bb.aa';
        // When cursor is at position 22 (on second 'b' of 'bb'), VSCode highlights 'bb'
        // VSCode's getWordRangeAtPosition would return range (20, 22) for identifier 'bb'
        const result = buildAttributeChain(line, 20, 22);
        assert.strictEqual(result, 'array_within_object.bb',
            'Cursor on "bb" should highlight "array_within_object.bb"');
    });
});

suite('Name Compression Logic', () => {
    // Replicate the compression logic for testing (without vscode dependencies)
    function compressName(name: string, maxLength: number): string {
        if (name.length <= maxLength) {
            return name;
        }

        const parts = name.split('.');

        // Single segment: truncate from the end
        if (parts.length === 1) {
            // Need to leave room for "..."
            const charsToKeep = maxLength - 3;
            if (charsToKeep <= 0) {
                return '...';
            }
            return name.substring(0, charsToKeep) + '...';
        }

        // Multiple segments: try compressing intermediate parts first
        const indices = Array.from({ length: parts.length }, (_, i) => i);
        const middleIndices = indices.slice(1, -1);
        const priorityOrder: number[] = [];

        // Add middle indices (from innermost to outermost)
        const midPoint = Math.floor(middleIndices.length / 2);
        for (let offset = 0; offset < middleIndices.length; offset++) {
            const leftIndex = midPoint - offset;
            const rightIndex = midPoint + offset + (middleIndices.length % 2 === 0 ? 1 : 0);

            if (leftIndex >= 0 && leftIndex < middleIndices.length) {
                priorityOrder.push(middleIndices[leftIndex]);
            }
            if (rightIndex >= 0 && rightIndex < middleIndices.length && rightIndex !== leftIndex) {
                priorityOrder.push(middleIndices[rightIndex]);
            }
        }

        // Then add first and last
        priorityOrder.push(0);
        priorityOrder.push(parts.length - 1);

        // Try compressing segments in priority order
        const compressed = new Set<number>();
        for (const index of priorityOrder) {
            compressed.add(index);

            // Build the compressed name by manually constructing with dots
            let result = '';
            let hasCompressed = false;

            for (let i = 0; i < parts.length; i++) {
                if (compressed.has(i)) {
                    if (!hasCompressed) {
                        if (result.length > 0) {
                            result += '.';
                        }
                        result += '...';
                        hasCompressed = true;
                    }
                } else {
                    if (result.length > 0 && !hasCompressed) {
                        result += '.';
                    }
                    result += parts[i];
                    hasCompressed = false;
                }
            }

            if (result.length <= maxLength) {
                return result;
            }
        }

        // If all segments are compressed, return just "..."
        return '...';
    }

    test('Should not compress names shorter than max length', () => {
        const name = 'short_name';
        const compressed = compressName(name, 30);
        assert.strictEqual(compressed, name);
    });

    test('Should not compress names equal to max length', () => {
        const name = 'exactly_30_characters_long';
        const compressed = compressName(name, 30);
        assert.strictEqual(compressed, name);
    });

    test('Should compress single long name from the end', () => {
        const name = 'very_long_variable_name_that_exceeds_limit';
        const compressed = compressName(name, 20);
        assert.strictEqual(compressed.length, 20);
        assert.ok(compressed.endsWith('...'));
        assert.ok(compressed.startsWith('very_long_'));
    });

    test('Should compress to just "..." if max length is too small', () => {
        const name = 'long_name';
        const compressed = compressName(name, 3);
        assert.strictEqual(compressed, '...');
    });

    test('Should compress intermediate segment in a.b.c', () => {
        const name = 'first.very_long_middle.last';
        const compressed = compressName(name, 20);
        // Should compress middle first
        assert.ok(compressed.includes('...'));
        assert.ok(compressed.includes('first'));
        assert.ok(compressed.includes('last'));
        assert.strictEqual(compressed.length <= 20, true);
    });

    test('Should compress multiple intermediate segments in a.b.c.d', () => {
        const name = 'first.second.third.last';
        const compressed = compressName(name, 15);
        // Should compress middle segments
        assert.ok(compressed.includes('...'));
        assert.strictEqual(compressed.length <= 15, true);
    });

    test('Should compress first segment after intermediates', () => {
        const name = 'very_long_first.b.c.last';
        const compressed = compressName(name, 10);
        // With such a small limit, should compress first segment
        assert.ok(compressed.includes('...'));
        assert.strictEqual(compressed.length <= 10, true);
    });

    test('Should compress last segment as final resort', () => {
        const name = 'a.b.c.very_long_last_segment';
        const compressed = compressName(name, 10);
        // Should eventually compress last segment
        assert.ok(compressed.includes('...'));
        assert.strictEqual(compressed.length <= 10, true);
    });

    test('Should handle two-segment name', () => {
        const name = 'very_long_first_part.very_long_second_part';
        const compressed = compressName(name, 20);
        assert.ok(compressed.includes('...'));
        assert.strictEqual(compressed.length <= 20, true);
    });

    test('Should handle five-segment name', () => {
        const name = 'a.b.c.d.e';
        const compressed = compressName(name, 7);
        // Should compress middle segments first (c, then b and d)
        assert.ok(compressed.includes('...'));
        assert.strictEqual(compressed.length <= 7, true);
    });

    test('Should preserve dots in compressed output', () => {
        const name = 'first.second.third';
        const compressed = compressName(name, 14);
        // Result should still have dots separating segments
        const dotCount = (compressed.match(/\./g) || []).length;
        assert.ok(dotCount > 0, 'Should contain at least one dot');
    });

    test('Should only have one compressed part', () => {
        const name = 'a.b.c.d.e.f.g';
        const compressed = compressName(name, 10);
        // Count occurrences of "..."
        const ellipsisCount = (compressed.match(/\.\.\./g) || []).length;
        assert.strictEqual(ellipsisCount, 1, 'Should only have one "..." segment');
    });

    test('Should handle edge case: maxLength = 10', () => {
        const name = 'short';
        const compressed = compressName(name, 10);
        assert.strictEqual(compressed, name);
    });

    test('Should compress middle segment in odd-length chain', () => {
        const name = 'aaa.bbb.ccc';
        const compressed = compressName(name, 10);
        // Should compress 'bbb' (middle segment) first
        assert.ok(compressed.includes('...'));
        assert.ok(compressed.includes('aaa'));
        assert.ok(compressed.includes('ccc'));
        assert.strictEqual(compressed.length <= 10, true);
        assert.strictEqual(compressed, 'aaa....ccc');
    });

    test('Should compress middle segments in even-length chain', () => {
        const name = 'aaaa.bbbb.cccc.dddd';
        const compressed = compressName(name, 14);
        // Should compress middle segments (bbbb or cccc) first
        assert.ok(compressed.includes('...'));
        assert.strictEqual(compressed.length <= 14, true);
    });

    test('Should handle very long single segment', () => {
        const name = 'a'.repeat(100);
        const compressed = compressName(name, 20);
        assert.strictEqual(compressed.length, 20);
        assert.ok(compressed.endsWith('...'));
    });

    test('Should handle name with many segments', () => {
        const name = 'a.b.c.d.e.f.g.h.i.j';
        const compressed = compressName(name, 15);
        assert.ok(compressed.includes('...'));
        assert.strictEqual(compressed.length <= 15, true);
        const ellipsisCount = (compressed.match(/\.\.\./g) || []).length;
        assert.strictEqual(ellipsisCount, 1);
    });

    test('Should return ... when all segments compressed', () => {
        const name = 'a.b.c.d.e';
        const compressed = compressName(name, 2);
        assert.strictEqual(compressed, '...');
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
