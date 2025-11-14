/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 */

import * as vscode from 'vscode';
import { ArrayInspectorProvider, ArrayInfoItem } from './arrayInspector';

let arrayInspectorProvider: ArrayInspectorProvider;
let hoverTimeout: NodeJS.Timeout | undefined;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel('Array Inspector');
    outputChannel.appendLine('Array Inspector extension is now active');
    context.subscriptions.push(outputChannel);

    // Create and register the tree view provider
    arrayInspectorProvider = new ArrayInspectorProvider(outputChannel);
    const treeView = vscode.window.createTreeView('arrayInspectorView', {
        treeDataProvider: arrayInspectorProvider,
        showCollapseAll: true
    });

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
        vscode.commands.registerCommand('arrayInspector.refresh', () => {
            arrayInspectorProvider.refresh();
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
}

function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    // Only process during active debug sessions
    if (!vscode.debug.activeDebugSession) {
        outputChannel.appendLine('Selection changed but no active debug session');
        return;
    }

    const editor = event.textEditor;
    const selection = event.selections[0];

    // Check if it's a Python file
    if (editor.document.languageId !== 'python') {
        outputChannel.appendLine(`Selection changed in non-Python file: ${editor.document.languageId}`);
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
    // Get the word at the cursor position
    const wordRange = editor.document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);

    if (!wordRange) {
        outputChannel.appendLine('No word found at cursor position');
        return;
    }

    const word = editor.document.getText(wordRange);
    outputChannel.appendLine(`Detected word: "${word}"`);

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
        return;
    }

    outputChannel.appendLine(`Handling hover for: "${word}"`);
    // Handle the hover
    arrayInspectorProvider.handleHover(word);
}

export function deactivate(): void {
    if (hoverTimeout) {
        clearTimeout(hoverTimeout);
    }
}
