/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 */

import * as vscode from 'vscode';
import { ArrayInfo, PinnedArray } from './types';

export class ArrayInspectorProvider implements vscode.TreeDataProvider<ArrayInfoItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ArrayInfoItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private currentHoveredArray: ArrayInfo | null = null;
    private pinnedArrays: Map<string, PinnedArray> = new Map();
    private scopeArrays: Map<string, ArrayInfo> = new Map();
    private supportedTypes: Set<string>;
    private attributes: string[];
    private lastFrameId: number | undefined;

    constructor(private outputChannel: vscode.OutputChannel) {
        const config = vscode.workspace.getConfiguration('arrayInspector');
        this.supportedTypes = new Set(config.get<string[]>('supportedTypes', []));
        this.attributes = config.get<string[]>('attributes', ['shape', 'dtype', 'device']);

        this.outputChannel.appendLine(`Configured supported types: ${Array.from(this.supportedTypes).join(', ')}`);
        this.outputChannel.appendLine(`Configured attributes: ${this.attributes.join(', ')}`);

        // Listen to configuration changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('arrayInspector')) {
                this.updateConfiguration();
                this.refresh();
            }
        });

        // Listen to debug session changes
        vscode.debug.onDidChangeActiveDebugSession(() => {
            this.lastFrameId = undefined;
            this.scopeArrays.clear();
            this.updateAllArrays();
        });

        vscode.debug.onDidTerminateDebugSession(() => {
            this.currentHoveredArray = null;
            this.scopeArrays.clear();
            this.lastFrameId = undefined;
            this.refresh();
        });

        // Listen to active stack frame changes
        vscode.debug.onDidChangeActiveStackItem(() => {
            this.outputChannel.appendLine('Stack frame changed, updating arrays');
            this.updateAllArrays();
        });
    }

    private updateConfiguration(): void {
        const config = vscode.workspace.getConfiguration('arrayInspector');
        this.supportedTypes = new Set(config.get<string[]>('supportedTypes', []));
        this.attributes = config.get<string[]>('attributes', ['shape', 'dtype', 'device']);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ArrayInfoItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ArrayInfoItem): Promise<ArrayInfoItem[]> {
        if (!vscode.debug.activeDebugSession) {
            return [];
        }

        if (element) {
            // If it's a section header, return its children
            if (element.isSection) {
                return this.getSectionChildren(element.sectionType!);
            }
            // Otherwise return attribute children for an array
            return this.getArrayAttributes(element.arrayInfo);
        }

        // Root level: show sections
        const sections: ArrayInfoItem[] = [];

        // Section 1: Current (selected array)
        if (this.currentHoveredArray) {
            sections.push(ArrayInfoItem.createSection('current', 'Current'));
        }

        // Section 2: Pinned
        if (this.pinnedArrays.size > 0) {
            sections.push(ArrayInfoItem.createSection('pinned', 'Pinned'));
        }

        // Section 3: In Scope - scan for all arrays in current frame
        await this.scanScopeForArrays();
        if (this.scopeArrays.size > 0) {
            sections.push(ArrayInfoItem.createSection('scope', 'In Scope'));
        }

        return sections;
    }

    private async getSectionChildren(sectionType: string): Promise<ArrayInfoItem[]> {
        const items: ArrayInfoItem[] = [];

        if (sectionType === 'current' && this.currentHoveredArray) {
            items.push(new ArrayInfoItem(this.currentHoveredArray, vscode.TreeItemCollapsibleState.Expanded));
        } else if (sectionType === 'pinned') {
            for (const [name, pinned] of this.pinnedArrays) {
                const info = await this.evaluateArray(pinned.expression, name, true);
                if (info.isAvailable) {
                    items.push(new ArrayInfoItem(info, vscode.TreeItemCollapsibleState.Expanded));
                }
            }
        } else if (sectionType === 'scope') {
            // Show arrays from scope that aren't current or pinned
            for (const [name, info] of this.scopeArrays) {
                const isCurrentOrPinned =
                    (this.currentHoveredArray && this.currentHoveredArray.name === name) ||
                    this.pinnedArrays.has(name);

                if (!isCurrentOrPinned && info.isAvailable) {
                    items.push(new ArrayInfoItem(info, vscode.TreeItemCollapsibleState.Collapsed));
                }
            }
        }

        return items;
    }

    private getArrayAttributes(info: ArrayInfo): ArrayInfoItem[] {
        const items: ArrayInfoItem[] = [];

        if (!info.isAvailable) {
            items.push(new ArrayInfoItem(
                { ...info, name: 'N/A', type: '', shape: null, dtype: null, device: null, isPinned: false, isAvailable: false },
                vscode.TreeItemCollapsibleState.None,
                true
            ));
            return items;
        }

        if (this.attributes.includes('shape') && info.shape !== null) {
            items.push(this.createAttributeItem('shape', info.shape));
        }
        if (this.attributes.includes('dtype') && info.dtype !== null) {
            items.push(this.createAttributeItem('dtype', info.dtype));
        }
        if (this.attributes.includes('device') && info.device !== null) {
            items.push(this.createAttributeItem('device', info.device));
        }

        return items;
    }

    private createAttributeItem(name: string, value: string): ArrayInfoItem {
        const dummyInfo: ArrayInfo = {
            name: `${name}: ${value}`,
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned: false,
            isAvailable: true
        };
        return new ArrayInfoItem(dummyInfo, vscode.TreeItemCollapsibleState.None, true);
    }

    async handleHover(expression: string): Promise<void> {
        this.outputChannel.appendLine(`handleHover called for: "${expression}"`);

        if (!vscode.debug.activeDebugSession) {
            this.outputChannel.appendLine('No active debug session');
            return;
        }

        // Don't update if this is a pinned array
        if (this.pinnedArrays.has(expression)) {
            this.outputChannel.appendLine(`"${expression}" is already pinned, skipping`);
            return;
        }

        this.outputChannel.appendLine(`Evaluating array: "${expression}"`);
        const info = await this.evaluateArray(expression, expression, false);

        this.outputChannel.appendLine(`Evaluation result - isAvailable: ${info.isAvailable}, type: "${info.type}"`);

        if (info.isAvailable && this.isSupportedType(info.type)) {
            this.outputChannel.appendLine(`Type "${info.type}" is supported, updating panel`);
            this.currentHoveredArray = info;
            this.refresh();
        } else {
            this.outputChannel.appendLine(`Type "${info.type}" is not supported or array not available`);
        }
    }

    async pinArray(item: ArrayInfoItem): Promise<void> {
        const name = item.arrayInfo.name;
        this.pinnedArrays.set(name, { name, expression: name });
        this.refresh();
    }

    async unpinArray(item: ArrayInfoItem): Promise<void> {
        this.pinnedArrays.delete(item.arrayInfo.name);
        this.refresh();
    }

    private async updateAllArrays(): Promise<void> {
        // Scan scope and refresh view
        await this.scanScopeForArrays();
        this.refresh();
    }

    private async scanScopeForArrays(): Promise<void> {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            this.scopeArrays.clear();
            return;
        }

        try {
            // Get current frame
            const frameId = await this.getCurrentFrameId();
            if (frameId === undefined) {
                this.scopeArrays.clear();
                return;
            }

            // Check if frame changed - if so, clear scope arrays
            if (this.lastFrameId !== frameId) {
                this.outputChannel.appendLine(`Frame changed from ${this.lastFrameId} to ${frameId}, clearing scope`);
                this.scopeArrays.clear();
                this.lastFrameId = frameId;
            }

            // Get all variables in the current frame using the 'scopes' request
            const scopesResponse = await session.customRequest('scopes', { frameId });
            this.outputChannel.appendLine(`Scopes response: ${JSON.stringify(scopesResponse)}`);

            const scopes = scopesResponse.body?.scopes || scopesResponse.scopes || [];

            // For each scope, get variables
            for (const scope of scopes) {
                if (scope.variablesReference) {
                    const varsResponse = await session.customRequest('variables', {
                        variablesReference: scope.variablesReference
                    });
                    this.outputChannel.appendLine(`Variables in scope "${scope.name}": ${varsResponse.body?.variables?.length || 0}`);

                    const variables = varsResponse.body?.variables || varsResponse.variables || [];

                    // Check each variable to see if it's a supported array type
                    for (const variable of variables) {
                        const varType = variable.type || '';
                        if (this.isSupportedType(varType) && !this.scopeArrays.has(variable.name)) {
                            this.outputChannel.appendLine(`Found array in scope: ${variable.name} (${varType})`);

                            // Evaluate the array to get full info
                            const info = await this.evaluateArray(variable.name, variable.name, false);
                            if (info.isAvailable) {
                                this.scopeArrays.set(variable.name, info);
                            }
                        }
                    }
                }
            }

            this.outputChannel.appendLine(`Total arrays in scope: ${this.scopeArrays.size}`);
        } catch (error) {
            this.outputChannel.appendLine(`Error scanning scope: ${error}`);
        }
    }

    private async getCurrentFrameId(): Promise<number | undefined> {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            return undefined;
        }

        try {
            const threads = await session.customRequest('threads', {});
            const threadList = threads.body?.threads || threads.threads;
            if (threadList && threadList.length > 0) {
                const threadId = threadList[0].id;
                const stackTrace = await session.customRequest('stackTrace', {
                    threadId: threadId,
                    startFrame: 0,
                    levels: 1
                });

                const frames = stackTrace.body?.stackFrames || stackTrace.stackFrames;
                if (frames && frames.length > 0) {
                    return frames[0].id;
                }
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error getting current frame ID: ${error}`);
        }

        return undefined;
    }

    private async evaluateArray(expression: string, name: string, isPinned: boolean): Promise<ArrayInfo> {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            this.outputChannel.appendLine('No debug session available in evaluateArray');
            return this.createUnavailableInfo(name, isPinned);
        }

        try {
            // Get the current frame ID for proper context
            let frameId: number | undefined;
            try {
                const threads = await session.customRequest('threads', {});
                this.outputChannel.appendLine(`Threads response: ${JSON.stringify(threads)}`);

                // Try both response formats: threads.body.threads and threads.threads
                const threadList = threads.body?.threads || threads.threads;
                if (threadList && threadList.length > 0) {
                    const threadId = threadList[0].id;
                    this.outputChannel.appendLine(`Using thread ID: ${threadId}`);

                    const stackTrace = await session.customRequest('stackTrace', {
                        threadId: threadId,
                        startFrame: 0,
                        levels: 1
                    });
                    this.outputChannel.appendLine(`StackTrace response: ${JSON.stringify(stackTrace)}`);

                    // Try both response formats: stackTrace.body.stackFrames and stackTrace.stackFrames
                    const frames = stackTrace.body?.stackFrames || stackTrace.stackFrames;
                    if (frames && frames.length > 0) {
                        frameId = frames[0].id;
                        this.outputChannel.appendLine(`Using frame ID: ${frameId}`);
                    } else {
                        this.outputChannel.appendLine(`No stack frames found in response`);
                    }
                } else {
                    this.outputChannel.appendLine(`No threads found in response`);
                }
            } catch (error) {
                this.outputChannel.appendLine(`Warning: Could not get frameId: ${error}`);
            }

            this.outputChannel.appendLine(`Sending evaluate request for: "${expression}" with frameId: ${frameId}`);
            // First, evaluate the expression to get the type
            const evaluateParams: any = {
                expression,
                context: 'hover'
            };
            if (frameId !== undefined) {
                evaluateParams.frameId = frameId;
            }

            const result = await session.customRequest('evaluate', evaluateParams);

            this.outputChannel.appendLine(`Evaluate response (raw): ${JSON.stringify(result)}`);

            // DAP evaluate returns the body directly, not wrapped in {success, body}
            const responseBody = result.body || result;

            if (!responseBody || !responseBody.result) {
                this.outputChannel.appendLine(`Evaluation failed for "${expression}" - no result in response`);
                return this.createUnavailableInfo(name, isPinned);
            }

            this.outputChannel.appendLine(`Evaluate response body: ${JSON.stringify(responseBody)}`);

            const type = responseBody.type || '';
            this.outputChannel.appendLine(`Type for "${expression}": "${type}"`);

            if (!this.isSupportedType(type)) {
                this.outputChannel.appendLine(`Type "${type}" is not in supported types`);
                return this.createUnavailableInfo(name, isPinned);
            }

            // Evaluate attributes
            this.outputChannel.appendLine(`Evaluating attributes for "${expression}"`);
            const [shape, dtype, device] = await Promise.all([
                this.evaluateAttribute(expression, 'shape', frameId),
                this.evaluateAttribute(expression, 'dtype', frameId),
                this.evaluateAttribute(expression, 'device', frameId)
            ]);

            this.outputChannel.appendLine(`Attributes - shape: ${shape}, dtype: ${dtype}, device: ${device}`);

            return {
                name,
                type,
                shape,
                dtype,
                device,
                isPinned,
                isAvailable: true
            };
        } catch (error) {
            this.outputChannel.appendLine(`Error evaluating "${expression}": ${error}`);
            return this.createUnavailableInfo(name, isPinned);
        }
    }

    private async evaluateAttribute(expression: string, attribute: string, frameId?: number): Promise<string | null> {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            return null;
        }

        try {
            const attrExpression = `${expression}.${attribute}`;
            const evaluateParams: any = {
                expression: attrExpression,
                context: 'hover'
            };
            if (frameId !== undefined) {
                evaluateParams.frameId = frameId;
            }

            const result = await session.customRequest('evaluate', evaluateParams);

            // DAP evaluate returns the body directly
            const responseBody = result.body || result;
            if (responseBody && responseBody.result) {
                return responseBody.result;
            }
        } catch (error) {
            // Attribute not available
        }

        return null;
    }

    private isSupportedType(type: string): boolean {
        this.outputChannel.appendLine(`Checking if type "${type}" is supported`);

        // Check exact match first
        if (this.supportedTypes.has(type)) {
            this.outputChannel.appendLine(`Exact match found for "${type}"`);
            return true;
        }

        // Check for partial matches in both directions:
        // - Short type in config matches long type from debugger (e.g., "ArrayImpl" in "jaxlib.xla_extension.ArrayImpl")
        // - Long type in config matches short type from debugger (e.g., "numpy.ndarray" matches "ndarray")
        for (const supportedType of this.supportedTypes) {
            if (type.includes(supportedType) || supportedType.includes(type)) {
                this.outputChannel.appendLine(`Partial match: "${type}" matched with configured type "${supportedType}"`);
                return true;
            }
        }

        this.outputChannel.appendLine(`No match found for "${type}". Configured types: ${Array.from(this.supportedTypes).join(', ')}`);
        return false;
    }

    private createUnavailableInfo(name: string, isPinned: boolean): ArrayInfo {
        return {
            name,
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned,
            isAvailable: false
        };
    }
}

export class ArrayInfoItem extends vscode.TreeItem {
    public readonly isSection: boolean;
    public readonly sectionType?: string;

    constructor(
        public readonly arrayInfo: ArrayInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        isAttribute: boolean = false,
        isSection: boolean = false,
        sectionType?: string
    ) {
        super(arrayInfo.name, collapsibleState);

        this.isSection = isSection;
        this.sectionType = sectionType;

        if (isSection) {
            // Section header
            this.contextValue = 'section';
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (isAttribute) {
            this.contextValue = 'attribute';
            this.iconPath = new vscode.ThemeIcon('symbol-field');
        } else {
            this.contextValue = arrayInfo.isPinned ? 'pinned' : 'unpinned';
            this.iconPath = new vscode.ThemeIcon('symbol-array');

            if (!arrayInfo.isAvailable) {
                this.description = 'N/A';
                this.tooltip = `${arrayInfo.name} is not available in the current frame`;
            } else {
                this.description = arrayInfo.type;
                this.tooltip = this.buildTooltip(arrayInfo);
            }
        }
    }

    static createSection(sectionType: string, label: string): ArrayInfoItem {
        const dummyInfo: ArrayInfo = {
            name: label,
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned: false,
            isAvailable: true
        };
        return new ArrayInfoItem(
            dummyInfo,
            vscode.TreeItemCollapsibleState.Expanded,
            false,
            true,
            sectionType
        );
    }

    private buildTooltip(info: ArrayInfo): string {
        const parts: string[] = [`${info.name} (${info.type})`];

        if (info.shape !== null) {
            parts.push(`Shape: ${info.shape}`);
        }
        if (info.dtype !== null) {
            parts.push(`Dtype: ${info.dtype}`);
        }
        if (info.device !== null) {
            parts.push(`Device: ${info.device}`);
        }

        return parts.join('\n');
    }
}
