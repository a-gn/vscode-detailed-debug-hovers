/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 */

import * as vscode from 'vscode';
import { ArrayInspectorProvider, ArrayInfoItem } from './arrayInspector';

let arrayInspectorProvider: ArrayInspectorProvider;
let hoverTimeout: NodeJS.Timeout | undefined;
let outputChannel: vscode.OutputChannel;
let lastHighlightedWord: string | undefined;

export function activate(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel('Array Inspector');
    outputChannel.appendLine('Array Inspector extension is now active');
    context.subscriptions.push(outputChannel);

    // Create and register the tree view provider
    arrayInspectorProvider = new ArrayInspectorProvider(outputChannel);
    const treeView = vscode.window.createTreeView('arrayInspectorView', {
        treeDataProvider: arrayInspectorProvider
    });
    arrayInspectorProvider.setTreeView(treeView);

    context.subscriptions.push(treeView);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('arrayInspector.pinArray', async (item: ArrayInfoItem) => {
            await arrayInspectorProvider.pinArray(item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('arrayInspector.unpinArray', async (item: ArrayInfoItem) => {
            await arrayInspectorProvider.unpinArray(item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('arrayInspector.toggleDisplayMode', async () => {
            await arrayInspectorProvider.toggleDisplayMode();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('arrayInspector.copyNumpyCreationOptions', async (item: ArrayInfoItem) => {
            await arrayInspectorProvider.copyNumpyCreationOptions(item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('arrayInspector.copyJaxCreationOptions', async (item: ArrayInfoItem) => {
            await arrayInspectorProvider.copyJaxCreationOptions(item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('arrayInspector.copyPytorchCreationOptions', async (item: ArrayInfoItem) => {
            await arrayInspectorProvider.copyPytorchCreationOptions(item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('arrayInspector.toggleCollapseExpandAll', async () => {
            await arrayInspectorProvider.toggleCollapseExpandAll();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('arrayInspector.toggleNameCompression', async () => {
            await arrayInspectorProvider.toggleNameCompression();
        })
    );

    // Listen to mouse hover events
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(handleSelectionChange)
    );

    // Also listen to active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            // Clear hover timeout when switching editors
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = undefined;
            }
        })
    );

    // Automatically reveal the panel when a Python debug session starts
    context.subscriptions.push(
        vscode.debug.onDidStartDebugSession((session) => {
            if (session.type === 'python' || session.type === 'debugpy') {
                outputChannel.appendLine(`Python debug session started, revealing Array Inspector panel`);
                treeView.reveal(undefined as any, { select: false, focus: false, expand: false });
            }
        })
    );
}

function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    // Only process during active debug sessions
    if (!vscode.debug.activeDebugSession) {
        // Silently ignore - no need to log every selection change
        return;
    }

    const editor = event.textEditor;
    const selection = event.selections[0];

    // Check if it's a Python file (silently ignore other file types to avoid log spam)
    if (editor.document.languageId !== 'python') {
        return;
    }

    outputChannel.appendLine(`Selection changed at line ${selection.active.line}, char ${selection.active.character}`);

    // Debounce hover detection to avoid too many evaluations
    if (hoverTimeout) {
        clearTimeout(hoverTimeout);
    }

    hoverTimeout = setTimeout(() => {
        detectHoveredVariable(editor, selection.active);
    }, 100);
}

function detectHoveredVariable(editor: vscode.TextEditor, position: vscode.Position): void {
    // Get the word at the cursor position, including attribute chains like obj.array or obj.nested.array
    const wordRange = editor.document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*/);

    if (!wordRange) {
        outputChannel.appendLine('No word found at cursor position');
        // Clear highlighted if we moved away from a variable
        if (lastHighlightedWord !== undefined) {
            outputChannel.appendLine('Clearing highlighted array (no word at cursor)');
            arrayInspectorProvider.clearHighlighted();
            lastHighlightedWord = undefined;
        }
        return;
    }

    const fullWord = editor.document.getText(wordRange);
    outputChannel.appendLine(`Full match at cursor: "${fullWord}"`);

    // CRITICAL FIX: Truncate the expression to only include segments up to the cursor position
    // For example, if cursor is on "arr3" in "arr3.mean()", we should only get "arr3"
    const cursorOffsetInWord = position.character - wordRange.start.character;
    const word = truncateAtCursor(fullWord, cursorOffsetInWord);

    outputChannel.appendLine(`Truncated to cursor position: "${word}"`);

    // Ignore keywords and common built-ins
    const keywords = new Set([
        'def', 'class', 'import', 'from', 'if', 'else', 'elif', 'while', 'for',
        'try', 'except', 'finally', 'with', 'as', 'return', 'yield', 'break',
        'continue', 'pass', 'raise', 'assert', 'del', 'lambda', 'and', 'or',
        'not', 'in', 'is', 'None', 'True', 'False', 'print', 'len', 'range',
        'str', 'int', 'float', 'list', 'dict', 'set', 'tuple'
    ]);

    if (keywords.has(word)) {
        outputChannel.appendLine(`Ignoring keyword: "${word}"`);
        // Clear highlighted if we moved from a variable to a keyword
        if (lastHighlightedWord !== undefined) {
            outputChannel.appendLine('Clearing highlighted array (moved to keyword)');
            arrayInspectorProvider.clearHighlighted();
            lastHighlightedWord = undefined;
        }
        return;
    }

    // If we moved to a different word, clear the old highlight
    if (lastHighlightedWord !== undefined && lastHighlightedWord !== word) {
        outputChannel.appendLine(`Clearing previous highlight: "${lastHighlightedWord}"`);
        arrayInspectorProvider.clearHighlighted();
    }

    outputChannel.appendLine(`Handling hover for: "${word}"`);
    lastHighlightedWord = word;
    // Handle the hover
    arrayInspectorProvider.handleHover(word);
}

/**
 * Truncates an attribute chain expression to only include segments up to the cursor position.
 *
 * This fixes the bug where clicking on "arr3" in "arr3.mean()" would incorrectly highlight
 * the entire "arr3.mean" chain instead of just "arr3".
 *
 * Examples:
 * - "arr3.mean" with cursor at offset 2 (on "arr3") -> "arr3"
 * - "obj.nested.array" with cursor at offset 4 (on "nested") -> "obj.nested"
 * - "obj.nested.array" with cursor at offset 15 (on "array") -> "obj.nested.array"
 *
 * @param expression The full attribute chain expression
 * @param cursorOffset The character offset of the cursor within the expression
 * @returns The truncated expression up to and including the segment containing the cursor
 */
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

export function deactivate(): void {
    if (hoverTimeout) {
        clearTimeout(hoverTimeout);
    }
}
