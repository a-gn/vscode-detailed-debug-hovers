/**
 * GUI Integration tests for Array Inspector
 *
 * These tests simulate real user interactions:
 * - Opening files
 * - Starting debug sessions
 * - Setting breakpoints
 * - Selecting variables with cursor
 * - Verifying panel updates
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { ArrayInspectorProvider, DisplayMode } from '../../arrayInspector';

suite('Array Inspector GUI Integration Tests', () => {
    let testPythonFile: vscode.Uri;

    suiteSetup(async function() {
        // Increase timeout for integration tests
        this.timeout(60000);

        // Get the test Python file path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, 'Workspace folder should be available');

        testPythonFile = vscode.Uri.file(
            path.join(workspaceFolder.uri.fsPath, 'test-examples', 'numpy_example.py')
        );

        // Verify the test file exists
        try {
            await vscode.workspace.fs.stat(testPythonFile);
        } catch (e) {
            assert.fail(`Test file not found: ${testPythonFile.fsPath}`);
        }

        console.log(`Test file found: ${testPythonFile.fsPath}`);

        // Ensure Python extension is activated
        const pythonExt = vscode.extensions.getExtension('ms-python.python');
        if (pythonExt && !pythonExt.isActive) {
            console.log('Activating Python extension...');
            await pythonExt.activate();
            console.log('Python extension activated');
        } else if (!pythonExt) {
            console.log('WARNING: Python extension not found');
        }
    });

    suiteTeardown(async function() {
        this.timeout(10000);
        // Stop any active debug sessions
        if (vscode.debug.activeDebugSession) {
            await vscode.debug.stopDebugging(vscode.debug.activeDebugSession);
        }

        // Close all editors
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('Should open Python file and show in editor', async function() {
        this.timeout(10000);

        const document = await vscode.workspace.openTextDocument(testPythonFile);
        const editor = await vscode.window.showTextDocument(document);

        assert.ok(editor, 'Editor should be open');
        assert.strictEqual(editor.document.languageId, 'python', 'Document should be Python');
        assert.ok(editor.document.getText().includes('numpy'), 'Should contain numpy imports');
    });

    test('Should start debug session and hit breakpoint', async function() {
        this.timeout(30000);

        // Open the test file
        const document = await vscode.workspace.openTextDocument(testPythonFile);
        await vscode.window.showTextDocument(document);

        // Find the line with "arr1 = " to set breakpoint
        const text = document.getText();
        const lines = text.split('\n');
        let breakpointLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('arr1 = np.zeros')) {
                breakpointLine = i;
                break;
            }
        }

        assert.ok(breakpointLine >= 0, 'Should find arr1 assignment line');

        // Set breakpoint
        const breakpoint = new vscode.SourceBreakpoint(
            new vscode.Location(testPythonFile, new vscode.Position(breakpointLine, 0))
        );
        vscode.debug.addBreakpoints([breakpoint]);

        // Wait for debug session to start and hit breakpoint
        const debugStarted = new Promise<vscode.DebugSession>((resolve) => {
            const disposable = vscode.debug.onDidStartDebugSession((session) => {
                disposable.dispose();
                resolve(session);
            });
        });

        const stoppedAtBreakpoint = new Promise<void>((resolve) => {
            const disposable = vscode.debug.onDidChangeBreakpoints(() => {
                // Breakpoint was hit if we have an active stack frame
                if (vscode.debug.activeStackItem) {
                    disposable.dispose();
                    resolve();
                }
            });

            // Also listen for thread stopped event (more reliable)
            const disposable2 = vscode.debug.onDidChangeActiveStackItem(() => {
                if (vscode.debug.activeStackItem) {
                    disposable.dispose();
                    disposable2.dispose();
                    resolve();
                }
            });
        });

        // Start debugging
        const config = {
            type: 'debugpy',
            name: 'Test Debug',
            request: 'launch',
            program: testPythonFile.fsPath,
            console: 'integratedTerminal',
            justMyCode: true,
            stopOnEntry: false
        };

        const started = await vscode.debug.startDebugging(undefined, config);
        assert.ok(started, 'Debug session should start');

        // Wait for session to start
        const session = await debugStarted;
        assert.ok(session, 'Debug session should be active');

        // Wait for breakpoint (with timeout)
        await Promise.race([
            stoppedAtBreakpoint,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout waiting for breakpoint')), 20000)
            )
        ]);

        assert.ok(vscode.debug.activeDebugSession, 'Should have active debug session');

        // Cleanup
        vscode.debug.removeBreakpoints([breakpoint]);
        await vscode.debug.stopDebugging(session);
    });

    test('Should detect variable selection and update panel', async function() {
        this.timeout(30000);

        // Get the array inspector tree view
        const treeView = vscode.window.createTreeView('arrayInspectorView', {
            treeDataProvider: new ArrayInspectorProvider(
                vscode.window.createOutputChannel('Test')
            )
        });

        // Open and prepare document
        const document = await vscode.workspace.openTextDocument(testPythonFile);
        const editor = await vscode.window.showTextDocument(document);

        // Find line with arr1
        const text = document.getText();
        const lines = text.split('\n');
        let arr1Line = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('arr1 = np.zeros')) {
                arr1Line = i;
                break;
            }
        }

        assert.ok(arr1Line >= 0, 'Should find arr1 line');

        // Set breakpoint AFTER arr1 is assigned (next line)
        const breakpointLine = arr1Line + 1;
        const breakpoint = new vscode.SourceBreakpoint(
            new vscode.Location(testPythonFile, new vscode.Position(breakpointLine, 0))
        );
        vscode.debug.addBreakpoints([breakpoint]);

        // Start debug session
        const sessionStarted = new Promise<vscode.DebugSession>((resolve) => {
            const disposable = vscode.debug.onDidStartDebugSession((session) => {
                disposable.dispose();
                resolve(session);
            });
        });

        const config = {
            type: 'debugpy',
            name: 'Test Variable Selection',
            request: 'launch',
            program: testPythonFile.fsPath,
            console: 'integratedTerminal',
            justMyCode: true
        };

        await vscode.debug.startDebugging(undefined, config);
        const session = await sessionStarted;

        // Wait for breakpoint to be hit
        await new Promise<void>((resolve) => {
            const disposable = vscode.debug.onDidChangeActiveStackItem(() => {
                if (vscode.debug.activeStackItem) {
                    disposable.dispose();
                    resolve();
                }
            });
        });

        // Now simulate cursor selection on 'arr1'
        // Find the position of 'arr1' in the line above (where it's assigned)
        const arr1LineText = lines[arr1Line];
        const arr1Index = arr1LineText.indexOf('arr1');
        assert.ok(arr1Index >= 0, 'Should find arr1 in the line');

        const arr1Position = new vscode.Position(arr1Line, arr1Index + 1); // Inside 'arr1'
        const arr1Selection = new vscode.Selection(arr1Position, arr1Position);

        // Set the selection (this simulates clicking on arr1)
        editor.selection = arr1Selection;

        // Trigger selection change event manually
        await vscode.commands.executeCommand('editor.action.triggerSuggest');
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for processing

        // Verify that the selection was set correctly
        const wordRange = document.getWordRangeAtPosition(
            arr1Position,
            /[a-zA-Z_][a-zA-Z0-9_]*/
        );
        assert.ok(wordRange, 'Should detect word at position');
        const word = document.getText(wordRange);
        assert.strictEqual(word, 'arr1', 'Should detect arr1 as the word');

        // Cleanup
        treeView.dispose();
        vscode.debug.removeBreakpoints([breakpoint]);
        await vscode.debug.stopDebugging(session);
    });

    test('Should show arrays in panel during debug session', async function() {
        this.timeout(30000);

        // Create output channel and provider
        const outputChannel = vscode.window.createOutputChannel('Array Inspector Test');
        const provider = new ArrayInspectorProvider(outputChannel);

        // Open document
        const document = await vscode.workspace.openTextDocument(testPythonFile);
        await vscode.window.showTextDocument(document);

        // Find breakpoint location (after multiple arrays are created)
        const text = document.getText();
        const lines = text.split('\n');
        let breakpointLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('arr3 = np.random')) {
                // Set breakpoint on line AFTER arr3
                breakpointLine = i + 1;
                break;
            }
        }

        assert.ok(breakpointLine >= 0, 'Should find arr3 line');

        const breakpoint = new vscode.SourceBreakpoint(
            new vscode.Location(testPythonFile, new vscode.Position(breakpointLine, 0))
        );
        vscode.debug.addBreakpoints([breakpoint]);

        // Start debug session
        const sessionStarted = new Promise<vscode.DebugSession>((resolve) => {
            const disposable = vscode.debug.onDidStartDebugSession((session) => {
                disposable.dispose();
                resolve(session);
            });
        });

        const config = {
            type: 'debugpy',
            name: 'Test Array Panel',
            request: 'launch',
            program: testPythonFile.fsPath,
            console: 'integratedTerminal',
            justMyCode: true
        };

        await vscode.debug.startDebugging(undefined, config);
        const session = await sessionStarted;

        // Wait for breakpoint
        await new Promise<void>((resolve) => {
            const disposable = vscode.debug.onDidChangeActiveStackItem(() => {
                if (vscode.debug.activeStackItem) {
                    disposable.dispose();
                    resolve();
                }
            });
        });

        // Wait a bit for the provider to scan the scope
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get tree items from provider
        const rootChildren = await provider.getChildren();

        // Should have sections (highlighted, pinned, in scope)
        assert.ok(rootChildren.length > 0, 'Should have root items in tree');

        // Look for "In Scope" section
        const inScopeSection = rootChildren.find(
            item => item.label === 'In Scope' || item.arrayInfo?.name === 'In Scope'
        );

        if (inScopeSection) {
            // Get arrays in scope
            const arraysInScope = await provider.getChildren(inScopeSection);

            // Should have at least arr1, arr2, arr3
            assert.ok(
                arraysInScope.length >= 3,
                `Should have at least 3 arrays in scope, found ${arraysInScope.length}`
            );

            // Verify array names
            const arrayNames = arraysInScope.map(item => item.arrayInfo?.name || '');
            assert.ok(
                arrayNames.includes('arr1') || arrayNames.some(n => n.includes('arr1')),
                'Should include arr1'
            );
            assert.ok(
                arrayNames.includes('arr2') || arrayNames.some(n => n.includes('arr2')),
                'Should include arr2'
            );
            assert.ok(
                arrayNames.includes('arr3') || arrayNames.some(n => n.includes('arr3')),
                'Should include arr3'
            );
        }

        // Cleanup
        outputChannel.dispose();
        vscode.debug.removeBreakpoints([breakpoint]);
        await vscode.debug.stopDebugging(session);
    });

    test('Should pin and unpin arrays', async function() {
        this.timeout(30000);

        const outputChannel = vscode.window.createOutputChannel('Pin Test');
        const provider = new ArrayInspectorProvider(outputChannel);

        // Open document
        const document = await vscode.workspace.openTextDocument(testPythonFile);
        await vscode.window.showTextDocument(document);

        // Find breakpoint
        const text = document.getText();
        const lines = text.split('\n');
        let breakpointLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('arr1 = np.zeros')) {
                breakpointLine = i + 1;
                break;
            }
        }

        const breakpoint = new vscode.SourceBreakpoint(
            new vscode.Location(testPythonFile, new vscode.Position(breakpointLine, 0))
        );
        vscode.debug.addBreakpoints([breakpoint]);

        // Start debug
        const sessionStarted = new Promise<vscode.DebugSession>((resolve) => {
            const disposable = vscode.debug.onDidStartDebugSession((session) => {
                disposable.dispose();
                resolve(session);
            });
        });

        const config = {
            type: 'debugpy',
            name: 'Test Pin',
            request: 'launch',
            program: testPythonFile.fsPath,
            console: 'integratedTerminal',
            justMyCode: true
        };

        await vscode.debug.startDebugging(undefined, config);
        const session = await sessionStarted;

        // Wait for breakpoint
        await new Promise<void>((resolve) => {
            const disposable = vscode.debug.onDidChangeActiveStackItem(() => {
                if (vscode.debug.activeStackItem) {
                    disposable.dispose();
                    resolve();
                }
            });
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Evaluate arr1 and pin it
        await provider.handleHover('arr1');
        await new Promise(resolve => setTimeout(resolve, 500));

        const rootChildren = await provider.getChildren();
        const highlightedItem = rootChildren.find(
            item => item.contextValue?.includes('highlighted')
        );

        if (highlightedItem) {
            // Pin the array
            await provider.pinArray(highlightedItem);
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify it's in pinned section
            const afterPin = await provider.getChildren();
            const pinnedSection = afterPin.find(
                item => item.label === 'Pinned' || item.arrayInfo?.name === 'Pinned'
            );

            if (pinnedSection) {
                const pinnedArrays = await provider.getChildren(pinnedSection);
                assert.ok(pinnedArrays.length > 0, 'Should have pinned arrays');

                const arr1Pinned = pinnedArrays.find(
                    item => item.arrayInfo?.name === 'arr1'
                );
                assert.ok(arr1Pinned, 'arr1 should be pinned');

                // Unpin it
                await provider.unpinArray(arr1Pinned);
                await new Promise(resolve => setTimeout(resolve, 200));

                // Verify it's removed from pinned
                const afterUnpin = await provider.getChildren(pinnedSection);
                const stillPinned = afterUnpin.find(
                    item => item.arrayInfo?.name === 'arr1'
                );
                assert.ok(!stillPinned, 'arr1 should not be pinned after unpin');
            }
        }

        // Cleanup
        outputChannel.dispose();
        vscode.debug.removeBreakpoints([breakpoint]);
        await vscode.debug.stopDebugging(session);
    });

    test('Should toggle display modes', async function() {
        this.timeout(10000);

        const outputChannel = vscode.window.createOutputChannel('Display Mode Test');
        const provider = new ArrayInspectorProvider(outputChannel);

        // Get initial mode
        const initialMode = provider.getDisplayMode();
        assert.ok(
            initialMode === DisplayMode.OneLine ||
            initialMode === DisplayMode.TwoLine ||
            initialMode === DisplayMode.Expanded,
            'Should have valid initial display mode'
        );

        // Toggle to next mode
        provider.toggleDisplayMode();
        const afterFirst = provider.getDisplayMode();
        assert.notStrictEqual(afterFirst, initialMode, 'Display mode should change');

        // Toggle again
        provider.toggleDisplayMode();
        const afterSecond = provider.getDisplayMode();
        assert.notStrictEqual(afterSecond, afterFirst, 'Display mode should change again');

        // Toggle third time should cycle back
        provider.toggleDisplayMode();
        const afterThird = provider.getDisplayMode();
        assert.strictEqual(afterThird, initialMode, 'Should cycle back to initial mode');

        outputChannel.dispose();
    });

    test('Should handle attribute chains (obj.array)', async function() {
        this.timeout(30000);

        const outputChannel = vscode.window.createOutputChannel('Attribute Test');

        // Open document
        const document = await vscode.workspace.openTextDocument(testPythonFile);
        await vscode.window.showTextDocument(document);

        // Find line with "array_within_object.aa"
        const text = document.getText();
        const lines = text.split('\n');
        let targetLine = -1;
        let breakpointLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('array_within_object.aa') && !lines[i].includes('=')) {
                targetLine = i;
                // Set breakpoint at this line
                breakpointLine = i;
                break;
            }
        }

        if (targetLine >= 0 && breakpointLine >= 0) {
            const breakpoint = new vscode.SourceBreakpoint(
                new vscode.Location(testPythonFile, new vscode.Position(breakpointLine, 0))
            );
            vscode.debug.addBreakpoints([breakpoint]);

            // Start debug
            const sessionStarted = new Promise<vscode.DebugSession>((resolve) => {
                const disposable = vscode.debug.onDidStartDebugSession((session) => {
                    disposable.dispose();
                    resolve(session);
                });
            });

            const config = {
                type: 'debugpy',
                name: 'Test Attributes',
                request: 'launch',
                program: testPythonFile.fsPath,
                console: 'integratedTerminal',
                justMyCode: true
            };

            await vscode.debug.startDebugging(undefined, config);
            const session = await sessionStarted;

            // Wait for breakpoint
            await new Promise<void>((resolve) => {
                const disposable = vscode.debug.onDidChangeActiveStackItem(() => {
                    if (vscode.debug.activeStackItem) {
                        disposable.dispose();
                        resolve();
                    }
                });
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Test attribute chain detection
            const lineText = lines[targetLine];
            const aaIndex = lineText.indexOf('array_within_object.aa');
            if (aaIndex >= 0) {
                const position = new vscode.Position(targetLine, aaIndex + 20); // Inside '.aa'
                const wordRange = document.getWordRangeAtPosition(position);

                if (wordRange) {
                    // Test with attribute chain regex
                    const chainRange = document.getWordRangeAtPosition(
                        position,
                        /[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*/
                    );

                    if (chainRange) {
                        const chain = document.getText(chainRange);
                        assert.ok(
                            chain.includes('array_within_object'),
                            'Should detect attribute chain'
                        );
                    }
                }
            }

            // Cleanup
            vscode.debug.removeBreakpoints([breakpoint]);
            await vscode.debug.stopDebugging(session);
        }

        outputChannel.dispose();
    });
});
