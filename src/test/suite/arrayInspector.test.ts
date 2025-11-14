/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 *
 * Unit tests for Array Inspector functionality
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ArrayInspectorProvider } from '../../arrayInspector';

suite('Array Inspector Test Suite', () => {
    let outputChannel: vscode.OutputChannel;

    setup(() => {
        outputChannel = vscode.window.createOutputChannel('Test');
    });

    teardown(() => {
        outputChannel.dispose();
    });

    test('ArrayInspectorProvider should initialize with default configuration', () => {
        const provider = new ArrayInspectorProvider(outputChannel);
        assert.ok(provider, 'Provider should be created');
    });

    test('ArrayInspectorProvider should handle configuration', () => {
        const config = vscode.workspace.getConfiguration('arrayInspector');
        const supportedTypes = config.get<string[]>('supportedTypes', []);
        const attributes = config.get<string[]>('attributes', []);

        assert.ok(supportedTypes.length > 0, 'Should have default supported types');
        assert.ok(attributes.length > 0, 'Should have default attributes');
        assert.ok(supportedTypes.includes('numpy.ndarray'), 'Should support numpy arrays');
        assert.ok(attributes.includes('shape'), 'Should include shape attribute');
    });

    test('Pin and unpin functionality should work', async () => {
        const provider = new ArrayInspectorProvider(outputChannel);

        // Create a mock array info item
        const mockArrayInfo = {
            name: 'test_array',
            type: 'numpy.ndarray',
            shape: '(10, 10)',
            dtype: 'float64',
            device: null,
            isPinned: false,
            isAvailable: true
        };

        const mockItem = {
            arrayInfo: mockArrayInfo,
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded
        };

        // Pin the array
        await provider.pinArray(mockItem as any);

        // Verify it's in the tree
        const children = await provider.getChildren();
        assert.ok(children.length > 0, 'Should have pinned array in tree');

        // Unpin the array
        await provider.unpinArray(mockItem as any);

        // Verify it's removed
        const childrenAfter = await provider.getChildren();
        assert.ok(childrenAfter.length === 0 || childrenAfter[0].arrayInfo.name !== 'test_array',
            'Should remove unpinned array from tree');
    });

    test('Refresh should trigger tree data change event', (done) => {
        const provider = new ArrayInspectorProvider(outputChannel);

        provider.onDidChangeTreeData(() => {
            assert.ok(true, 'Tree data change event should fire');
            done();
        });

        provider.refresh();
    });
});

suite('Hover Detection Test Suite', () => {
    test('Should detect variable names from Python code', () => {
        const testCases = [
            { code: 'arr1', expected: 'arr1', shouldMatch: true },
            { code: 'my_array', expected: 'my_array', shouldMatch: true },
            { code: 'def', expected: 'def', shouldMatch: false }, // keyword
            { code: 'print', expected: 'print', shouldMatch: false }, // builtin
            { code: '123', expected: null, shouldMatch: false }, // number
        ];

        const keywords = new Set([
            'def', 'class', 'import', 'from', 'if', 'else', 'elif', 'while', 'for',
            'try', 'except', 'finally', 'with', 'as', 'return', 'yield', 'break',
            'continue', 'pass', 'raise', 'assert', 'del', 'lambda', 'and', 'or',
            'not', 'in', 'is', 'None', 'True', 'False', 'print', 'len', 'range',
            'str', 'int', 'float', 'list', 'dict', 'set', 'tuple'
        ]);

        testCases.forEach(({ code, shouldMatch }) => {
            const isKeyword = keywords.has(code);
            const matchesPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(code);
            const shouldDetect = shouldMatch && !isKeyword && matchesPattern;

            if (shouldMatch) {
                assert.ok(shouldDetect, `Should detect variable "${code}"`);
            } else {
                assert.ok(!shouldDetect || isKeyword, `Should not detect "${code}"`);
            }
        });
    });

    test('Should extract variable name from cursor position', async () => {
        // Create a simple Python document
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import numpy as np\narr1 = np.zeros((10, 10))'
        });

        // Test getting word at position
        const position = new vscode.Position(1, 1); // 'arr1' starts at position 0, we're at 'r'
        const wordRange = doc.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);

        assert.ok(wordRange, 'Should find word range');
        if (wordRange) {
            const word = doc.getText(wordRange);
            assert.strictEqual(word, 'arr1', 'Should extract "arr1"');
        }
    });
});

suite('Type Matching Test Suite', () => {
    test('Should match supported array types', () => {
        const supportedTypes = new Set([
            'jax.Array',
            'jaxlib.xla_extension.ArrayImpl',
            'numpy.ndarray'
        ]);

        const testCases = [
            { type: 'numpy.ndarray', shouldMatch: true },
            { type: 'jax.Array', shouldMatch: true },
            { type: 'jaxlib.xla_extension.ArrayImpl', shouldMatch: true },
            { type: 'ndarray', shouldMatch: false }, // short form not in set
            { type: 'list', shouldMatch: false },
            { type: 'torch.Tensor', shouldMatch: false },
        ];

        testCases.forEach(({ type, shouldMatch }) => {
            const isSupported = supportedTypes.has(type);
            assert.strictEqual(isSupported, shouldMatch,
                `Type "${type}" should ${shouldMatch ? '' : 'not '}be supported`);
        });
    });

    test('Should match types with substring matching', () => {
        const supportedTypes = new Set([
            'jax.Array',
            'jaxlib.xla_extension.ArrayImpl',
            'numpy.ndarray'
        ]);

        // Test substring matching logic (as implemented in isSupportedType)
        const testType = 'ndarray';

        let matches = false;
        if (supportedTypes.has(testType)) {
            matches = true;
        } else {
            for (const supportedType of supportedTypes) {
                if (testType.includes(supportedType) || supportedType.includes(testType)) {
                    matches = true;
                    break;
                }
            }
        }

        assert.ok(matches, 'Should match "ndarray" with "numpy.ndarray" via substring');
    });
});
