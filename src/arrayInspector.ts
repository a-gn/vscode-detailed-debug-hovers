/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 */

import * as vscode from 'vscode';
import { ArrayInfo, PinnedArray } from './types';

export enum DisplayMode {
    OneLine = 'oneLine',
    TwoLine = 'twoLine',
    Expanded = 'expanded'
}

export class ArrayInspectorProvider implements vscode.TreeDataProvider<ArrayInfoItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ArrayInfoItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private currentHoveredArray: ArrayInfo | null = null;
    private pinnedArrays: Map<string, PinnedArray> = new Map();
    private localsArrays: Map<string, ArrayInfo> = new Map();
    private globalsArrays: Map<string, ArrayInfo> = new Map();
    private supportedTypes: Set<string>;
    private attributes: string[];
    private lastFrameId: number | undefined;
    private displayMode: DisplayMode = DisplayMode.OneLine;
    private showInlineOnHighlighted: boolean = true;
    private treeView: vscode.TreeView<ArrayInfoItem> | undefined;

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
        vscode.debug.onDidChangeActiveDebugSession((session) => {
            this.outputChannel.appendLine(`Debug session changed: ${session?.name || 'none'}`);
            this.lastFrameId = undefined;
            this.localsArrays.clear();
            this.globalsArrays.clear();
            this.updateAllArrays();
        });

        vscode.debug.onDidTerminateDebugSession(() => {
            this.outputChannel.appendLine('Debug session terminated');
            this.currentHoveredArray = null;
            this.localsArrays.clear();
            this.globalsArrays.clear();
            this.lastFrameId = undefined;
            this.refresh();
        });

        // Listen to active stack frame changes
        vscode.debug.onDidChangeActiveStackItem(() => {
            this.outputChannel.appendLine('Stack item changed');
            this.updateAllArrays();
        });
    }

    setTreeView(treeView: vscode.TreeView<ArrayInfoItem>): void {
        this.treeView = treeView;
    }

    private updateConfiguration(): void {
        const config = vscode.workspace.getConfiguration('arrayInspector');
        this.supportedTypes = new Set(config.get<string[]>('supportedTypes', []));
        this.attributes = config.get<string[]>('attributes', ['shape', 'dtype', 'device']);
    }

    async refresh(): Promise<void> {
        // Re-scan scope arrays when manually refreshing
        await this.scanScopeForArrays();
        this._onDidChangeTreeData.fire();
    }

    async toggleDisplayMode(): Promise<void> {
        const previousMode = this.displayMode;

        // Cycle through modes: OneLine -> TwoLine -> Expanded -> OneLine
        switch (this.displayMode) {
            case DisplayMode.OneLine:
                this.displayMode = DisplayMode.TwoLine;
                break;
            case DisplayMode.TwoLine:
                this.displayMode = DisplayMode.Expanded;
                break;
            case DisplayMode.Expanded:
                this.displayMode = DisplayMode.OneLine;
                break;
        }
        this.outputChannel.appendLine(`Display mode changed to: ${this.displayMode}`);

        // Refresh the tree to update collapsible states
        await this.refresh();

        // If switching to TwoLine or Expanded mode, expand all visible items
        if (this.treeView && previousMode === DisplayMode.OneLine &&
            (this.displayMode === DisplayMode.TwoLine || this.displayMode === DisplayMode.Expanded)) {
            // Get root items and expand them
            const rootItems = await this.getChildren();
            for (const section of rootItems) {
                if (section.isSection) {
                    // Expand the section to reveal its children
                    await this.treeView.reveal(section, { expand: true });

                    // Get and expand the section's children
                    const children = await this.getSectionChildren(section.sectionType!);
                    for (const child of children) {
                        if (child.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
                            await this.treeView.reveal(child, { expand: true });
                        }
                    }
                }
            }
        }
    }

    getDisplayMode(): DisplayMode {
        return this.displayMode;
    }

    toggleInlineOnHighlighted(): void {
        this.showInlineOnHighlighted = !this.showInlineOnHighlighted;
        this.outputChannel.appendLine(`Inline on highlighted: ${this.showInlineOnHighlighted}`);
        this.refresh();
    }

    getShowInlineOnHighlighted(): boolean {
        return this.showInlineOnHighlighted;
    }

    getTreeItem(element: ArrayInfoItem): vscode.TreeItem {
        return element;
    }

    getParent(element: ArrayInfoItem): ArrayInfoItem | undefined {
        // If element is a section, it has no parent (it's at root level)
        if (element.isSection) {
            return undefined;
        }

        // If element is highlighted, its parent is the "Highlighted Array" section
        if (element.isHighlighted) {
            return ArrayInfoItem.createSection('highlighted', 'Highlighted Array');
        }

        // For other elements, we need to determine which section they belong to
        // Check if it's in pinned arrays
        if (element.arrayInfo.isPinned) {
            return ArrayInfoItem.createSection('pinned', 'Pinned');
        }

        // Check if it's in locals or globals
        if (this.localsArrays.has(element.arrayInfo.name)) {
            return ArrayInfoItem.createSection('locals', 'Locals');
        }

        if (this.globalsArrays.has(element.arrayInfo.name)) {
            return ArrayInfoItem.createSection('globals', 'Globals');
        }

        // Default: no parent
        return undefined;
    }

    async getChildren(element?: ArrayInfoItem): Promise<ArrayInfoItem[]> {
        if (!vscode.debug.activeDebugSession) {
            return [];
        }

        if (element) {
            // Highlighted items have children based on display mode
            if (element.isHighlighted) {
                return this.getArrayChildrenForMode(element.arrayInfo, true);
            }
            // If it's a section header, return its children
            if (element.isSection) {
                return this.getSectionChildren(element.sectionType!);
            }
            // Otherwise return attribute children for an array
            return this.getArrayChildrenForMode(element.arrayInfo, false);
        }

        // Root level: show items
        const items: ArrayInfoItem[] = [];

        // Section 1: Highlighted (always show, even when empty)
        items.push(ArrayInfoItem.createSection('highlighted', 'Highlighted Array'));

        // Section 2: Pinned
        if (this.pinnedArrays.size > 0) {
            items.push(ArrayInfoItem.createSection('pinned', 'Pinned'));
        }

        // Section 3 & 4: Locals and Globals - scan for all arrays in current frame
        await this.scanScopeForArrays();
        if (this.localsArrays.size > 0) {
            items.push(ArrayInfoItem.createSection('locals', 'Locals'));
        }
        if (this.globalsArrays.size > 0) {
            items.push(ArrayInfoItem.createSection('globals', 'Globals'));
        }

        return items;
    }

    private async getSectionChildren(sectionType: string): Promise<ArrayInfoItem[]> {
        const items: ArrayInfoItem[] = [];

        if (sectionType === 'highlighted') {
            if (this.currentHoveredArray) {
                items.push(ArrayInfoItem.createHighlighted(this.currentHoveredArray, this.displayMode, this.showInlineOnHighlighted));
            } else {
                // Show "No highlighted array" message
                const noArrayInfo: ArrayInfo = {
                    name: 'No highlighted array',
                    type: '',
                    shape: null,
                    dtype: null,
                    device: null,
                    isPinned: false,
                    isAvailable: false
                };
                items.push(new ArrayInfoItem(noArrayInfo, vscode.TreeItemCollapsibleState.None, this.displayMode, true, false, undefined, false));
            }
        } else if (sectionType === 'pinned') {
            for (const [name, pinned] of this.pinnedArrays) {
                const info = await this.evaluateArray(pinned.expression, name, true);
                if (info.isAvailable) {
                    const collapsibleState = this.getCollapsibleStateForMode();
                    items.push(new ArrayInfoItem(info, collapsibleState, this.displayMode));
                }
            }
        } else if (sectionType === 'locals') {
            for (const [, info] of this.localsArrays) {
                if (info.isAvailable) {
                    const collapsibleState = this.getCollapsibleStateForMode();
                    items.push(new ArrayInfoItem(info, collapsibleState, this.displayMode));
                }
            }
        } else if (sectionType === 'globals') {
            for (const [, info] of this.globalsArrays) {
                if (info.isAvailable) {
                    const collapsibleState = this.getCollapsibleStateForMode();
                    items.push(new ArrayInfoItem(info, collapsibleState, this.displayMode));
                }
            }
        }

        return items;
    }

    private getCollapsibleStateForMode(): vscode.TreeItemCollapsibleState {
        // In OneLine mode, no children (all info on one line)
        // In TwoLine mode, show one child with compact info (auto-expanded)
        // In Expanded mode, show children (one per attribute, auto-expanded)
        switch (this.displayMode) {
            case DisplayMode.OneLine:
                return vscode.TreeItemCollapsibleState.None;
            case DisplayMode.TwoLine:
                return vscode.TreeItemCollapsibleState.Expanded;
            case DisplayMode.Expanded:
                return vscode.TreeItemCollapsibleState.Expanded;
        }
    }

    private getArrayChildrenForMode(info: ArrayInfo, _isHighlighted: boolean): ArrayInfoItem[] {
        if (!info.isAvailable) {
            const dummyInfo: ArrayInfo = { ...info, name: 'N/A', type: '', shape: null, dtype: null, device: null, isPinned: false, isAvailable: false };
            return [new ArrayInfoItem(
                dummyInfo,
                vscode.TreeItemCollapsibleState.None,
                this.displayMode,
                true,
                false,
                undefined,
                false
            )];
        }

        // In OneLine mode, no children
        if (this.displayMode === DisplayMode.OneLine) {
            return [];
        }

        // In TwoLine mode, show a single compact info line
        if (this.displayMode === DisplayMode.TwoLine) {
            const parts: string[] = [];
            if (this.attributes.includes('shape') && info.shape !== null) {
                parts.push(info.shape);
            }
            if (this.attributes.includes('dtype') && info.dtype !== null) {
                // Dtype is already formatted in evaluateArray
                parts.push(info.dtype);
            }
            if (this.attributes.includes('device') && info.device !== null) {
                parts.push(info.device);
            }

            if (parts.length > 0) {
                return [this.createAttributeItem('', parts.join(' '))];
            }
            return [];
        }

        // In Expanded mode, show one line per attribute
        return this.getArrayAttributes(info);
    }

    private getArrayAttributes(info: ArrayInfo): ArrayInfoItem[] {
        const items: ArrayInfoItem[] = [];

        if (!info.isAvailable) {
            const dummyInfo: ArrayInfo = { ...info, name: 'N/A', type: '', shape: null, dtype: null, device: null, isPinned: false, isAvailable: false };
            items.push(new ArrayInfoItem(
                dummyInfo,
                vscode.TreeItemCollapsibleState.None,
                this.displayMode,
                true,
                false,
                undefined,
                false
            ));
            return items;
        }

        if (this.attributes.includes('shape') && info.shape !== null) {
            items.push(this.createAttributeItem('shape', info.shape));
        }
        if (this.attributes.includes('dtype') && info.dtype !== null) {
            // Dtype is already formatted in evaluateArray
            items.push(this.createAttributeItem('dtype', info.dtype));
        }
        if (this.attributes.includes('device') && info.device !== null) {
            items.push(this.createAttributeItem('device', info.device));
        }

        return items;
    }

    private formatDtype(dtype: string): string {
        // Remove dtype() wrapper for numpy: dtype('int32') -> int32
        if (dtype.startsWith('dtype(') && dtype.endsWith(')')) {
            return dtype.slice(6, -1).replace(/['"]/g, '');
        }

        // For JAX, dtypes are like dtype('float32') - extract the type name
        const match = dtype.match(/dtype\(['"]?([^'"]+)['"]?\)/);
        if (match) {
            return match[1];
        }

        // For torch, dtypes are like torch.float32 - keep as is
        // Or they might be like dtype=torch.float32, extract after =
        if (dtype.includes('torch.')) {
            const torchMatch = dtype.match(/torch\.(\w+)/);
            if (torchMatch) {
                return torchMatch[1];
            }
        }

        // Return as-is if no pattern matched
        return dtype;
    }

    private createAttributeItem(name: string, value: string): ArrayInfoItem {
        const dummyInfo: ArrayInfo = {
            name: name ? `${name}: ${value}` : value,
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned: false,
            isAvailable: true
        };
        return new ArrayInfoItem(dummyInfo, vscode.TreeItemCollapsibleState.None, this.displayMode, true, false, undefined, false);
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

    clearHighlighted(): void {
        if (this.currentHoveredArray !== null) {
            this.outputChannel.appendLine('Clearing highlighted array');
            this.currentHoveredArray = null;
            this.refresh();
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
            this.localsArrays.clear();
            this.globalsArrays.clear();
            return;
        }

        // Get current frame
        const frameId = await this.getCurrentFrameId();

        // Check if frame changed - if so, clear scope arrays
        if (this.lastFrameId !== frameId) {
            this.outputChannel.appendLine(`Frame changed from ${this.lastFrameId} to ${frameId}, clearing scope`);
            this.localsArrays.clear();
            this.globalsArrays.clear();
            this.lastFrameId = frameId;
        }

        // Get all variables in the current frame using the 'scopes' request
        const scopesResponse = await session.customRequest('scopes', { frameId });
        this.outputChannel.appendLine(`Scopes response: ${JSON.stringify(scopesResponse)}`);

        const scopes = scopesResponse.body?.scopes || scopesResponse.scopes;
        if (!scopes) {
            throw new Error('Scopes response missing scopes array');
        }

        // For each scope, get variables
        for (const scope of scopes) {
            if (!scope.variablesReference) {
                continue;
            }

            const varsResponse = await session.customRequest('variables', {
                variablesReference: scope.variablesReference
            });
            const variables = varsResponse.body?.variables || varsResponse.variables;
            if (!variables) {
                throw new Error(`Variables response missing variables array for scope ${scope.name}`);
            }

            this.outputChannel.appendLine(`Scope "${scope.name}" has ${variables.length} variables`);

            // Determine which map to use based on scope name
            const targetMap = scope.name === 'Locals' ? this.localsArrays : this.globalsArrays;

            // Check each variable to see if it's a supported array type
            for (const variable of variables) {
                const varType = variable.type || '';
                const varName = variable.name || '<unnamed>';

                // Log each variable we're examining
                this.outputChannel.appendLine(`  Variable in "${scope.name}": name="${varName}", type="${varType}"`);

                if (this.isSupportedType(varType) && !targetMap.has(variable.name)) {
                    this.outputChannel.appendLine(`  → Matched! Getting attributes for: ${variable.name}`);

                    // Get attributes directly without evaluating the whole variable
                    const [shape, dtype, device] = await Promise.all([
                        this.evaluateAttribute(variable.name, 'shape', frameId),
                        this.evaluateAttribute(variable.name, 'dtype', frameId),
                        this.evaluateAttribute(variable.name, 'device', frameId)
                    ]);

                    const formattedDtype = dtype ? this.formatDtype(dtype) : null;

                    const info: ArrayInfo = {
                        name: variable.name,
                        type: varType,
                        shape,
                        dtype: formattedDtype,
                        device,
                        isPinned: false,
                        isAvailable: true
                    };

                    targetMap.set(variable.name, info);
                }
            }
        }

        this.outputChannel.appendLine(`Total arrays - Locals: ${this.localsArrays.size}, Globals: ${this.globalsArrays.size}`);
    }

    private async getCurrentFrameId(): Promise<number> {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            throw new Error('No active debug session');
        }

        const activeStackItem = vscode.debug.activeStackItem;
        if (!activeStackItem) {
            throw new Error('No active stack item');
        }

        const itemAsAny = activeStackItem as any;
        this.outputChannel.appendLine(`Active stack item: ${itemAsAny.constructor?.name || 'unknown'}`);
        this.outputChannel.appendLine(`Active stack item properties: ${JSON.stringify(Object.keys(itemAsAny))}`);

        // VSCode's DebugStackFrame has a threadId and frameId property
        if (!('threadId' in itemAsAny)) {
            throw new Error(`activeStackItem missing threadId property. Type: ${itemAsAny.constructor?.name || 'unknown'}`);
        }
        if (!('frameId' in itemAsAny)) {
            throw new Error(`activeStackItem missing frameId property. Type: ${itemAsAny.constructor?.name || 'unknown'}`);
        }

        const frameId = itemAsAny.frameId;
        if (typeof frameId !== 'number') {
            throw new Error(`frameId is not a number: ${typeof frameId}, value: ${frameId}`);
        }

        this.outputChannel.appendLine(`Using stack frame ID: ${frameId}`);
        return frameId;
    }

    private async evaluateArray(expression: string, name: string, isPinned: boolean): Promise<ArrayInfo> {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            throw new Error('No active debug session');
        }

        const frameId = await this.getCurrentFrameId();

        this.outputChannel.appendLine(`Evaluating "${expression}" with frameId: ${frameId}`);

        const result = await session.customRequest('evaluate', {
            expression,
            context: 'hover',
            frameId
        });

        this.outputChannel.appendLine(`Evaluate response: ${JSON.stringify(result)}`);

        const responseBody = result.body || result;
        if (!responseBody || !responseBody.result) {
            throw new Error(`Evaluation failed for "${expression}" - no result in response`);
        }

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

        // Format dtype for display
        const formattedDtype = dtype ? this.formatDtype(dtype) : null;

        return {
            name,
            type,
            shape,
            dtype: formattedDtype,
            device,
            isPinned,
            isAvailable: true
        };
    }

    private async evaluateAttribute(expression: string, attribute: string, frameId: number): Promise<string | null> {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            throw new Error('No active debug session');
        }

        try {
            const attrExpression = `${expression}.${attribute}`;
            const result = await session.customRequest('evaluate', {
                expression: attrExpression,
                context: 'hover',
                frameId
            });

            const responseBody = result.body || result;
            if (!responseBody || !responseBody.result) {
                return null;
            }

            return responseBody.result;
        } catch (error) {
            // Attribute not available (e.g., torch.Tensor doesn't have .device on CPU)
            return null;
        }
    }

    private isSupportedType(type: string): boolean {
        // Reject empty or whitespace-only types
        if (!type || type.trim().length === 0) {
            return false;
        }

        // Check exact match first
        if (this.supportedTypes.has(type)) {
            return true;
        }

        // Check for partial matches in both directions:
        // - Short type in config matches long type from debugger (e.g., "ArrayImpl" in "jaxlib.xla_extension.ArrayImpl")
        // - Long type in config matches short type from debugger (e.g., "numpy.ndarray" matches "ndarray")
        // Both strings must be non-empty for partial matching
        for (const supportedType of this.supportedTypes) {
            if (supportedType.length > 0 && type.length > 0 &&
                (type.includes(supportedType) || supportedType.includes(type))) {
                return true;
            }
        }

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
    public readonly isHighlighted: boolean;

    constructor(
        public readonly arrayInfo: ArrayInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly displayMode: DisplayMode = DisplayMode.OneLine,
        isAttribute: boolean = false,
        isSection: boolean = false,
        sectionType?: string,
        isHighlighted: boolean = false,
        showInline: boolean = true
    ) {
        super(arrayInfo.name, collapsibleState);

        this.isSection = isSection;
        this.sectionType = sectionType;
        this.isHighlighted = isHighlighted;

        if (isSection) {
            // Section header
            this.contextValue = 'section';
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (isAttribute) {
            this.contextValue = 'attribute';
            this.iconPath = new vscode.ThemeIcon('symbol-field');
        } else if (isHighlighted) {
            // Highlighted item
            this.contextValue = 'highlighted';
            this.iconPath = new vscode.ThemeIcon('symbol-array');
            this.formatHighlightedItem(arrayInfo, displayMode, showInline);
        } else {
            this.contextValue = arrayInfo.isPinned ? 'pinned' : 'unpinned';
            this.iconPath = new vscode.ThemeIcon('symbol-array');

            if (!arrayInfo.isAvailable) {
                this.description = 'N/A';
                this.tooltip = `${arrayInfo.name} is not available in the current frame`;
            } else {
                this.formatRegularItem(arrayInfo, displayMode);
            }
        }
    }

    private formatHighlightedItem(arrayInfo: ArrayInfo, displayMode: DisplayMode, showInline: boolean): void {
        // If showInline is true, always show compact info on the line
        if (showInline) {
            this.formatOneLineCompact(arrayInfo);
        } else {
            // Otherwise format based on display mode
            switch (displayMode) {
                case DisplayMode.OneLine:
                    this.formatOneLineCompact(arrayInfo);
                    break;
                case DisplayMode.TwoLine:
                    this.label = arrayInfo.name;
                    this.description = '';
                    break;
                case DisplayMode.Expanded:
                    this.label = arrayInfo.name;
                    this.description = '';
                    break;
            }
        }
        this.tooltip = this.buildTooltip(arrayInfo);
    }

    private formatRegularItem(arrayInfo: ArrayInfo, displayMode: DisplayMode): void {
        // Format based on display mode
        switch (displayMode) {
            case DisplayMode.OneLine:
                this.formatOneLineCompact(arrayInfo);
                break;
            case DisplayMode.TwoLine:
                this.label = arrayInfo.name;
                this.description = '';
                break;
            case DisplayMode.Expanded:
                this.label = arrayInfo.name;
                this.description = '';
                break;
        }
        this.tooltip = this.buildTooltip(arrayInfo);
    }

    private formatOneLineCompact(arrayInfo: ArrayInfo): void {
        // Compact format: name shape dtype device (no labels)
        this.label = arrayInfo.name;
        const parts: string[] = [];
        if (arrayInfo.shape !== null) {
            parts.push(arrayInfo.shape);
        }
        if (arrayInfo.dtype !== null) {
            parts.push(arrayInfo.dtype);
        }
        if (arrayInfo.device !== null) {
            parts.push(arrayInfo.device);
        }
        this.description = parts.join(' ');
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
            DisplayMode.OneLine,
            false,
            true,
            sectionType
        );
    }

    static createHighlighted(arrayInfo: ArrayInfo, displayMode: DisplayMode, showInline: boolean): ArrayInfoItem {
        // Determine collapsible state based on display mode and showInline
        let collapsibleState = vscode.TreeItemCollapsibleState.None;
        if (!showInline && (displayMode === DisplayMode.TwoLine || displayMode === DisplayMode.Expanded)) {
            collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }

        return new ArrayInfoItem(
            arrayInfo,
            collapsibleState,
            displayMode,
            false,
            false,
            undefined,
            true,
            showInline
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
