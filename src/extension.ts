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
    // Use VSCode's native word detection to find the identifier at the cursor position
    const identifierRange = editor.document.getWordRangeAtPosition(position);

    if (!identifierRange) {
        // Clear highlighted if we moved away from a variable
        if (lastHighlightedWord !== undefined) {
            outputChannel.appendLine('Clearing highlighted array (no word at cursor)');
            arrayInspectorProvider.clearHighlighted();
            lastHighlightedWord = undefined;
        }
        return;
    }

    const identifier = editor.document.getText(identifierRange);
    outputChannel.appendLine(`Identifier at cursor: "${identifier}"`);

    // Get the full attribute chain (if any) using the attribute chain regex
    const attributeChainPattern = /[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*/;
    const fullChainRange = editor.document.getWordRangeAtPosition(position, attributeChainPattern);

    let word: string;

    if (!fullChainRange) {
        // No attribute chain, just use the identifier
        word = identifier;
    } else {
        // We have a full chain, cut it at the highlighted identifier's end position
        const fullChain = editor.document.getText(fullChainRange);
        outputChannel.appendLine(`Full chain: "${fullChain}"`);

        // Calculate where to cut the chain based on the highlighted identifier's end position
        const cutOffset = identifierRange.end.character - fullChainRange.start.character;
        word = fullChain.substring(0, cutOffset);
    }

    outputChannel.appendLine(`Final word: "${word}"`);

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

export function deactivate(): void {
    if (hoverTimeout) {
        clearTimeout(hoverTimeout);
    }
}
