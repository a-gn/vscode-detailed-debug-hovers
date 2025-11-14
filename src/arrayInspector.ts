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
    private treeView: vscode.TreeView<ArrayInfoItem> | undefined;
    private sectionCollapsedStates: Map<string, boolean> = new Map();

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

        // Track expansion/collapse events
        treeView.onDidExpandElement((event) => {
            if (event.element.isSection && event.element.sectionType) {
                this.sectionCollapsedStates.set(event.element.sectionType, false);
            }
        });

        treeView.onDidCollapseElement((event) => {
            if (event.element.isSection && event.element.sectionType) {
                this.sectionCollapsedStates.set(event.element.sectionType, true);
            }
        });
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

        // Capture the currently selected item (if any)
        let selectedArrayName: string | undefined;
        let selectedIsHighlighted = false;
        if (this.treeView && this.treeView.selection.length > 0) {
            const selectedItem = this.treeView.selection[0];

            if (selectedItem.isSection) {
                // Section selected - ignore
            } else if (selectedItem.contextValue === 'attribute' && selectedItem.parentArrayInfo) {
                // Attribute item selected - get parent array info
                selectedArrayName = selectedItem.parentArrayInfo.name;
                // Check if parent is the highlighted array
                selectedIsHighlighted = this.currentHoveredArray?.name === selectedItem.parentArrayInfo.name;
            } else if (selectedItem.arrayInfo.isAvailable) {
                // Array item selected directly
                selectedArrayName = selectedItem.arrayInfo.name;
                selectedIsHighlighted = selectedItem.isHighlighted;
            }
        }

        // If no selection, fall back to highlighted array
        if (!selectedArrayName && this.currentHoveredArray) {
            selectedArrayName = this.currentHoveredArray.name;
            selectedIsHighlighted = true;
        }

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

        // Restore selection to the array header (not its attributes)
        if (this.treeView && selectedArrayName) {
            await this.restoreSelection(selectedArrayName, selectedIsHighlighted);
        }
    }

    private async restoreSelection(arrayName: string, isHighlighted: boolean): Promise<void> {
        if (!this.treeView) {
            return;
        }

        try {
            // Find the item to select
            const rootItems = await this.getChildren();
            for (const section of rootItems) {
                if (!section.isSection) {
                    continue;
                }

                const children = await this.getSectionChildren(section.sectionType!);
                for (const child of children) {
                    // Match by array name and highlighted status
                    if (child.arrayInfo.name === arrayName && child.isHighlighted === isHighlighted) {
                        // Reveal and select the item
                        await this.treeView.reveal(child, { select: true, focus: false });
                        this.outputChannel.appendLine(`Restored selection to: ${arrayName}`);
                        return;
                    }
                }
            }
        } catch (error) {
            this.outputChannel.appendLine(`Failed to restore selection: ${error}`);
        }
    }

    getDisplayMode(): DisplayMode {
        return this.displayMode;
    }

    private async areAllSectionsCollapsed(): Promise<boolean> {
        const rootItems = await this.getChildren();
        // Check if all visible sections are collapsed
        for (const section of rootItems) {
            if (section.isSection && section.sectionType) {
                const isCollapsed = this.sectionCollapsedStates.get(section.sectionType);
                // If any section is not explicitly marked as collapsed, it's expanded
                if (isCollapsed !== true) {
                    return false;
                }
            }
        }
        return true;
    }

    async toggleCollapseExpandAll(): Promise<void> {
        if (!this.treeView) {
            return;
        }

        const allCollapsed = await this.areAllSectionsCollapsed();
        const rootItems = await this.getChildren();

        if (allCollapsed) {
            // Expand all sections
            this.outputChannel.appendLine('Expanding all sections');
            for (const section of rootItems) {
                if (section.isSection) {
                    await this.treeView.reveal(section, { expand: true });
                }
            }
        } else {
            // Collapse all sections
            this.outputChannel.appendLine('Collapsing all sections');
            for (const section of rootItems) {
                if (section.isSection) {
                    await this.treeView.reveal(section, { expand: false });
                }
            }
        }
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
                items.push(ArrayInfoItem.createHighlighted(this.currentHoveredArray, this.displayMode));
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
            for (const [name] of this.pinnedArrays) {
                // Check if pinned array is available in current scope (locals or globals)
                const inLocals = this.localsArrays.has(name);
                const inGlobals = this.globalsArrays.has(name);

                if (inLocals || inGlobals) {
                    // Get the info from the scope map (already evaluated)
                    const info = (inLocals ? this.localsArrays.get(name) : this.globalsArrays.get(name))!;
                    // Mark as pinned
                    const pinnedInfo = { ...info, isPinned: true };
                    const collapsibleState = this.getCollapsibleStateForMode();
                    items.push(new ArrayInfoItem(pinnedInfo, collapsibleState, this.displayMode));
                } else {
                    // Pinned array not in current scope - show as unavailable
                    const unavailableInfo = this.createUnavailableInfo(name, true);
                    const collapsibleState = this.getCollapsibleStateForMode();
                    items.push(new ArrayInfoItem(unavailableInfo, collapsibleState, this.displayMode));
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
                return [this.createAttributeItem('', parts.join(' '), info)];
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
            items.push(this.createAttributeItem('shape', info.shape, info));
        }
        if (this.attributes.includes('dtype') && info.dtype !== null) {
            // Dtype is already formatted in evaluateArray
            items.push(this.createAttributeItem('dtype', info.dtype, info));
        }
        if (this.attributes.includes('device') && info.device !== null) {
            items.push(this.createAttributeItem('device', info.device, info));
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

    private createAttributeItem(name: string, value: string, parentInfo?: ArrayInfo): ArrayInfoItem {
        const dummyInfo: ArrayInfo = {
            name: name ? `${name}: ${value}` : value,
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned: false,
            isAvailable: true
        };
        return new ArrayInfoItem(dummyInfo, vscode.TreeItemCollapsibleState.None, this.displayMode, true, false, undefined, false, parentInfo);
    }

    async handleHover(expression: string): Promise<void> {
        this.outputChannel.appendLine(`handleHover called for: "${expression}"`);

        if (!vscode.debug.activeDebugSession) {
            this.outputChannel.appendLine('No active debug session');
            return;
        }

        // Check if array is already in locals or globals scope
        const inLocals = this.localsArrays.has(expression);
        const inGlobals = this.globalsArrays.has(expression);

        let info: ArrayInfo;
        if (inLocals || inGlobals) {
            // Use already evaluated info from scope
            this.outputChannel.appendLine(`Array "${expression}" found in scope, using cached info`);
            info = (inLocals ? this.localsArrays.get(expression) : this.globalsArrays.get(expression))!;
        } else {
            // Not in scope maps, need to evaluate
            this.outputChannel.appendLine(`Evaluating array: "${expression}"`);
            info = await this.evaluateArray(expression, expression, false);
        }

        this.outputChannel.appendLine(`Result - isAvailable: ${info.isAvailable}, type: "${info.type}"`);

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

    async copyNumpyCreationOptions(item: ArrayInfoItem): Promise<void> {
        const info = item.arrayInfo;
        if (!info.isAvailable) {
            vscode.window.showWarningMessage('Array is not available in current scope');
            return;
        }

        const config = vscode.workspace.getConfiguration('arrayInspector');
        const prefix = config.get<string>('numpyPrefix', 'np.');

        const parts: string[] = [];
        if (info.shape !== null) {
            parts.push(`shape=${info.shape}`);
        }
        if (info.dtype !== null) {
            const dtype = this.convertDtypeToNumpy(info.dtype);
            parts.push(`dtype=${prefix}${dtype}`);
        }

        const creationOptions = parts.join(', ');
        await vscode.env.clipboard.writeText(creationOptions);
        vscode.window.showInformationMessage(`Copied NumPy creation options: ${creationOptions}`);
    }

    async copyJaxCreationOptions(item: ArrayInfoItem): Promise<void> {
        const info = item.arrayInfo;
        if (!info.isAvailable) {
            vscode.window.showWarningMessage('Array is not available in current scope');
            return;
        }

        const config = vscode.workspace.getConfiguration('arrayInspector');
        const jaxNumpyPrefix = config.get<string>('jaxNumpyPrefix', 'jnp.');
        const jaxPrefix = config.get<string>('jaxPrefix', 'jax.');

        const parts: string[] = [];
        if (info.shape !== null) {
            parts.push(`shape=${info.shape}`);
        }
        if (info.dtype !== null) {
            const dtype = this.convertDtypeToJax(info.dtype);
            parts.push(`dtype=${jaxNumpyPrefix}${dtype}`);
        }
        if (info.device !== null) {
            const device = this.convertDeviceToJax(info.device, jaxPrefix);
            parts.push(`device=${device}`);
        }

        const creationOptions = parts.join(', ');
        await vscode.env.clipboard.writeText(creationOptions);
        vscode.window.showInformationMessage(`Copied JAX creation options: ${creationOptions}`);
    }

    async copyPytorchCreationOptions(item: ArrayInfoItem): Promise<void> {
        const info = item.arrayInfo;
        if (!info.isAvailable) {
            vscode.window.showWarningMessage('Array is not available in current scope');
            return;
        }

        const config = vscode.workspace.getConfiguration('arrayInspector');
        const prefix = config.get<string>('pytorchPrefix', 'torch.');

        const parts: string[] = [];
        if (info.shape !== null) {
            parts.push(`size=${info.shape}`);
        }
        if (info.dtype !== null) {
            const dtype = this.convertDtypeToPytorch(info.dtype);
            parts.push(`dtype=${prefix}${dtype}`);
        }
        if (info.device !== null) {
            const device = this.convertDeviceToPytorch(info.device, prefix);
            parts.push(`device=${device}`);
        }

        const creationOptions = parts.join(', ');
        await vscode.env.clipboard.writeText(creationOptions);
        vscode.window.showInformationMessage(`Copied PyTorch creation options: ${creationOptions}`);
    }

    private convertDtypeToNumpy(dtype: string): string {
        // dtype is already formatted in our display (e.g., "int32", "float64")
        // NumPy uses np.int32, np.float64, etc.
        return dtype;
    }

    private convertDtypeToJax(dtype: string): string {
        // JAX uses jnp.int32, jnp.float64, etc. - same as NumPy
        return dtype;
    }

    private convertDtypeToPytorch(dtype: string): string {
        // PyTorch dtypes: torch.int32, torch.float64, etc.
        // But PyTorch also has torch.int64 (not torch.long in dtype specification)
        return dtype;
    }

    private convertDeviceToJax(device: string, prefix: string): string {
        // JAX device format: jax.devices('cpu')[0], jax.devices('gpu')[0], etc.
        // The device string might be like "cpu:0" or "gpu:0"
        // Handle prefix: if it ends with '.', remove it; if empty, use it as-is
        const moduleRef = prefix.endsWith('.') && prefix !== '' ? prefix.slice(0, -1) : prefix;
        const separator = moduleRef === '' ? '' : '.';

        if (device.toLowerCase().includes('cpu')) {
            return `${moduleRef}${separator}devices('cpu')[0]`;
        } else if (device.toLowerCase().includes('gpu') || device.toLowerCase().includes('cuda')) {
            return `${moduleRef}${separator}devices('gpu')[0]`;
        }
        // Default to the device string as-is if we don't recognize it
        return `${moduleRef}${separator}devices()[0]`;
    }

    private convertDeviceToPytorch(device: string, prefix: string): string {
        // PyTorch device format: torch.device('cpu'), torch.device('cuda:0'), etc.
        // The device string might be like "cpu" or "cuda:0"
        // Handle prefix: if it ends with '.', remove it; if empty, use it as-is
        const moduleRef = prefix.endsWith('.') && prefix !== '' ? prefix.slice(0, -1) : prefix;
        const separator = moduleRef === '' ? '' : '.';

        if (device.toLowerCase().includes('cpu')) {
            return `${moduleRef}${separator}device('cpu')`;
        } else if (device.toLowerCase().includes('cuda')) {
            // Extract device number if present
            const match = device.match(/cuda:?(\d+)?/i);
            if (match) {
                const deviceNum = match[1] || '0';
                return `${moduleRef}${separator}device('cuda:${deviceNum}')`;
            }
            return `${moduleRef}${separator}device('cuda')`;
        }
        // Default: wrap the device string
        return `${moduleRef}${separator}device('${device}')`;
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

        // Check if there's an active stack item (might not be ready yet when debugger first starts)
        if (!vscode.debug.activeStackItem) {
            this.outputChannel.appendLine('No active stack item yet, skipping scope scan');
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
    public readonly parentArrayInfo?: ArrayInfo;

    constructor(
        public readonly arrayInfo: ArrayInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly displayMode: DisplayMode = DisplayMode.OneLine,
        isAttribute: boolean = false,
        isSection: boolean = false,
        sectionType?: string,
        isHighlighted: boolean = false,
        parentArrayInfo?: ArrayInfo
    ) {
        super(arrayInfo.name, collapsibleState);

        this.isSection = isSection;
        this.sectionType = sectionType;
        this.isHighlighted = isHighlighted;
        this.parentArrayInfo = parentArrayInfo;

        if (isSection) {
            // Section header
            this.contextValue = 'section';
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (isAttribute) {
            this.contextValue = 'attribute';
            this.iconPath = new vscode.ThemeIcon('symbol-field');
        } else if (isHighlighted) {
            // Highlighted item (formatted same as regular items)
            this.contextValue = 'highlighted';
            this.iconPath = new vscode.ThemeIcon('symbol-array');
            this.formatRegularItem(arrayInfo, displayMode);
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

    static createHighlighted(arrayInfo: ArrayInfo, displayMode: DisplayMode): ArrayInfoItem {
        // Determine collapsible state based on display mode (same as other arrays)
        let collapsibleState = vscode.TreeItemCollapsibleState.None;
        if (displayMode === DisplayMode.TwoLine || displayMode === DisplayMode.Expanded) {
            collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }

        return new ArrayInfoItem(
            arrayInfo,
            collapsibleState,
            displayMode,
            false,
            false,
            undefined,
            true
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
