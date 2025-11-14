/**
 * Unit tests for display mode logic
 * Tests display mode cycling, collapsible state detection, and related logic
 */

import * as assert from 'assert';

enum DisplayMode {
    OneLine = 'oneLine',
    TwoLine = 'twoLine',
    Expanded = 'expanded'
}

suite('Display Mode Cycling Tests', () => {
    function cycleDisplayMode(currentMode: DisplayMode): DisplayMode {
        // Cycle through modes: OneLine -> TwoLine -> Expanded -> OneLine
        switch (currentMode) {
            case DisplayMode.OneLine:
                return DisplayMode.TwoLine;
            case DisplayMode.TwoLine:
                return DisplayMode.Expanded;
            case DisplayMode.Expanded:
                return DisplayMode.OneLine;
        }
    }

    test('Should cycle from OneLine to TwoLine', () => {
        const result = cycleDisplayMode(DisplayMode.OneLine);
        assert.strictEqual(result, DisplayMode.TwoLine);
    });

    test('Should cycle from TwoLine to Expanded', () => {
        const result = cycleDisplayMode(DisplayMode.TwoLine);
        assert.strictEqual(result, DisplayMode.Expanded);
    });

    test('Should cycle from Expanded back to OneLine', () => {
        const result = cycleDisplayMode(DisplayMode.Expanded);
        assert.strictEqual(result, DisplayMode.OneLine);
    });

    test('Should cycle through all modes correctly', () => {
        let mode = DisplayMode.OneLine;
        mode = cycleDisplayMode(mode);
        assert.strictEqual(mode, DisplayMode.TwoLine);

        mode = cycleDisplayMode(mode);
        assert.strictEqual(mode, DisplayMode.Expanded);

        mode = cycleDisplayMode(mode);
        assert.strictEqual(mode, DisplayMode.OneLine);
    });

    test('Should complete multiple full cycles', () => {
        let mode = DisplayMode.OneLine;

        // First cycle
        for (let i = 0; i < 3; i++) {
            mode = cycleDisplayMode(mode);
        }
        assert.strictEqual(mode, DisplayMode.OneLine);

        // Second cycle
        for (let i = 0; i < 3; i++) {
            mode = cycleDisplayMode(mode);
        }
        assert.strictEqual(mode, DisplayMode.OneLine);
    });
});

suite('Collapsible State for Mode Tests', () => {
    // Mock vscode.TreeItemCollapsibleState
    enum TreeItemCollapsibleState {
        None = 0,
        Collapsed = 1,
        Expanded = 2
    }

    function getCollapsibleStateForMode(mode: DisplayMode): TreeItemCollapsibleState {
        switch (mode) {
            case DisplayMode.OneLine:
                return TreeItemCollapsibleState.None;
            case DisplayMode.TwoLine:
                return TreeItemCollapsibleState.Expanded;
            case DisplayMode.Expanded:
                return TreeItemCollapsibleState.Expanded;
        }
    }

    test('OneLine mode should have None collapsible state', () => {
        const result = getCollapsibleStateForMode(DisplayMode.OneLine);
        assert.strictEqual(result, TreeItemCollapsibleState.None);
    });

    test('TwoLine mode should have Expanded collapsible state', () => {
        const result = getCollapsibleStateForMode(DisplayMode.TwoLine);
        assert.strictEqual(result, TreeItemCollapsibleState.Expanded);
    });

    test('Expanded mode should have Expanded collapsible state', () => {
        const result = getCollapsibleStateForMode(DisplayMode.Expanded);
        assert.strictEqual(result, TreeItemCollapsibleState.Expanded);
    });
});

suite('Array Children for Mode Tests', () => {
    interface ArrayInfo {
        name: string;
        type: string;
        shape: string | null;
        dtype: string | null;
        device: string | null;
        isPinned: boolean;
        isAvailable: boolean;
    }

    function getArrayChildrenCountForMode(info: ArrayInfo, mode: DisplayMode, attributes: string[]): number {
        if (!info.isAvailable) {
            return 1; // N/A item
        }

        if (mode === DisplayMode.OneLine) {
            return 0; // No children
        }

        if (mode === DisplayMode.TwoLine) {
            return 1; // Single compact info line
        }

        // Expanded mode: one child per available attribute
        let count = 0;
        if (attributes.includes('shape') && info.shape !== null) {
            count++;
        }
        if (attributes.includes('dtype') && info.dtype !== null) {
            count++;
        }
        if (attributes.includes('device') && info.device !== null) {
            count++;
        }
        return count;
    }

    const sampleArray: ArrayInfo = {
        name: 'arr1',
        type: 'numpy.ndarray',
        shape: '(10, 10)',
        dtype: 'np.float64',
        device: 'cpu',
        isPinned: false,
        isAvailable: true
    };

    const attributes = ['shape', 'dtype', 'device'];

    test('OneLine mode should have no children', () => {
        const count = getArrayChildrenCountForMode(sampleArray, DisplayMode.OneLine, attributes);
        assert.strictEqual(count, 0);
    });

    test('TwoLine mode should have one child', () => {
        const count = getArrayChildrenCountForMode(sampleArray, DisplayMode.TwoLine, attributes);
        assert.strictEqual(count, 1);
    });

    test('Expanded mode should have three children with all attributes', () => {
        const count = getArrayChildrenCountForMode(sampleArray, DisplayMode.Expanded, attributes);
        assert.strictEqual(count, 3);
    });

    test('Expanded mode should have two children when one attribute is null', () => {
        const arrayWithNullDevice: ArrayInfo = {
            ...sampleArray,
            device: null
        };
        const count = getArrayChildrenCountForMode(arrayWithNullDevice, DisplayMode.Expanded, attributes);
        assert.strictEqual(count, 2);
    });

    test('Expanded mode should have one child when two attributes are null', () => {
        const arrayWithNulls: ArrayInfo = {
            ...sampleArray,
            dtype: null,
            device: null
        };
        const count = getArrayChildrenCountForMode(arrayWithNulls, DisplayMode.Expanded, attributes);
        assert.strictEqual(count, 1);
    });

    test('Unavailable array should always have one N/A child', () => {
        const unavailableArray: ArrayInfo = {
            name: 'arr2',
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned: true,
            isAvailable: false
        };

        const countOneLine = getArrayChildrenCountForMode(unavailableArray, DisplayMode.OneLine, attributes);
        const countTwoLine = getArrayChildrenCountForMode(unavailableArray, DisplayMode.TwoLine, attributes);
        const countExpanded = getArrayChildrenCountForMode(unavailableArray, DisplayMode.Expanded, attributes);

        assert.strictEqual(countOneLine, 1);
        assert.strictEqual(countTwoLine, 1);
        assert.strictEqual(countExpanded, 1);
    });

    test('Should handle custom attribute configuration', () => {
        const customAttributes = ['shape', 'dtype']; // No device
        const count = getArrayChildrenCountForMode(sampleArray, DisplayMode.Expanded, customAttributes);
        assert.strictEqual(count, 2);
    });

    test('Should handle minimal attribute configuration', () => {
        const minimalAttributes = ['shape'];
        const count = getArrayChildrenCountForMode(sampleArray, DisplayMode.Expanded, minimalAttributes);
        assert.strictEqual(count, 1);
    });

    test('Should handle empty attribute configuration', () => {
        const emptyAttributes: string[] = [];
        const count = getArrayChildrenCountForMode(sampleArray, DisplayMode.Expanded, emptyAttributes);
        assert.strictEqual(count, 0);
    });
});

suite('Section Collapse State Tests', () => {
    function areAllSectionsCollapsed(
        visibleSections: string[],
        collapsedStates: Map<string, boolean>
    ): boolean {
        for (const section of visibleSections) {
            const isCollapsed = collapsedStates.get(section);
            if (isCollapsed !== true) {
                return false;
            }
        }
        return true;
    }

    test('Should detect all sections collapsed', () => {
        const sections = ['highlighted', 'pinned', 'locals'];
        const states = new Map<string, boolean>([
            ['highlighted', true],
            ['pinned', true],
            ['locals', true]
        ]);

        const result = areAllSectionsCollapsed(sections, states);
        assert.strictEqual(result, true);
    });

    test('Should detect when one section is expanded', () => {
        const sections = ['highlighted', 'pinned', 'locals'];
        const states = new Map<string, boolean>([
            ['highlighted', true],
            ['pinned', false],
            ['locals', true]
        ]);

        const result = areAllSectionsCollapsed(sections, states);
        assert.strictEqual(result, false);
    });

    test('Should detect when all sections are expanded', () => {
        const sections = ['highlighted', 'pinned', 'locals'];
        const states = new Map<string, boolean>([
            ['highlighted', false],
            ['pinned', false],
            ['locals', false]
        ]);

        const result = areAllSectionsCollapsed(sections, states);
        assert.strictEqual(result, false);
    });

    test('Should handle empty section list', () => {
        const sections: string[] = [];
        const states = new Map<string, boolean>();

        const result = areAllSectionsCollapsed(sections, states);
        assert.strictEqual(result, true); // Vacuously true
    });

    test('Should handle missing state as not collapsed', () => {
        const sections = ['highlighted', 'pinned', 'locals'];
        const states = new Map<string, boolean>([
            ['highlighted', true],
            // 'pinned' missing
            ['locals', true]
        ]);

        const result = areAllSectionsCollapsed(sections, states);
        assert.strictEqual(result, false);
    });

    test('Should handle single section collapsed', () => {
        const sections = ['highlighted'];
        const states = new Map<string, boolean>([['highlighted', true]]);

        const result = areAllSectionsCollapsed(sections, states);
        assert.strictEqual(result, true);
    });

    test('Should handle single section expanded', () => {
        const sections = ['highlighted'];
        const states = new Map<string, boolean>([['highlighted', false]]);

        const result = areAllSectionsCollapsed(sections, states);
        assert.strictEqual(result, false);
    });
});

suite('OneLine Compact Format Tests', () => {
    interface ArrayInfo {
        name: string;
        shape: string | null;
        dtype: string | null;
        device: string | null;
    }

    function formatOneLineCompact(arrayInfo: ArrayInfo, attributes: string[]): { label: string; description: string } {
        const label = arrayInfo.name;
        const parts: string[] = [];

        if (attributes.includes('shape') && arrayInfo.shape !== null) {
            parts.push(arrayInfo.shape);
        }
        if (attributes.includes('dtype') && arrayInfo.dtype !== null) {
            parts.push(arrayInfo.dtype);
        }
        if (attributes.includes('device') && arrayInfo.device !== null) {
            parts.push(arrayInfo.device);
        }

        return { label, description: parts.join(' ') };
    }

    const attributes = ['shape', 'dtype', 'device'];

    test('Should format array with all attributes', () => {
        const info: ArrayInfo = {
            name: 'arr1',
            shape: '(10, 20)',
            dtype: 'np.float64',
            device: 'cpu'
        };

        const result = formatOneLineCompact(info, attributes);
        assert.strictEqual(result.label, 'arr1');
        assert.strictEqual(result.description, '(10, 20) np.float64 cpu');
    });

    test('Should format array with missing device', () => {
        const info: ArrayInfo = {
            name: 'arr2',
            shape: '(5, 5)',
            dtype: 'np.int32',
            device: null
        };

        const result = formatOneLineCompact(info, attributes);
        assert.strictEqual(result.label, 'arr2');
        assert.strictEqual(result.description, '(5, 5) np.int32');
    });

    test('Should format array with only shape', () => {
        const info: ArrayInfo = {
            name: 'arr3',
            shape: '(100,)',
            dtype: null,
            device: null
        };

        const result = formatOneLineCompact(info, attributes);
        assert.strictEqual(result.label, 'arr3');
        assert.strictEqual(result.description, '(100,)');
    });

    test('Should format array with no attributes', () => {
        const info: ArrayInfo = {
            name: 'arr4',
            shape: null,
            dtype: null,
            device: null
        };

        const result = formatOneLineCompact(info, attributes);
        assert.strictEqual(result.label, 'arr4');
        assert.strictEqual(result.description, '');
    });

    test('Should respect custom attribute configuration', () => {
        const info: ArrayInfo = {
            name: 'arr5',
            shape: '(3, 3)',
            dtype: 'torch.float32',
            device: 'gpu_0'
        };

        const customAttrs = ['shape', 'dtype']; // No device
        const result = formatOneLineCompact(info, customAttrs);
        assert.strictEqual(result.description, '(3, 3) torch.float32');
    });

    test('Should handle zero-dimensional array', () => {
        const info: ArrayInfo = {
            name: 'scalar',
            shape: '()',
            dtype: 'np.float64',
            device: 'cpu'
        };

        const result = formatOneLineCompact(info, attributes);
        assert.strictEqual(result.description, '() np.float64 cpu');
    });

    test('Should handle long array name', () => {
        const info: ArrayInfo = {
            name: 'very_long_array_name_that_describes_data',
            shape: '(1024, 768)',
            dtype: 'jnp.float32',
            device: 'TFRT_CPU_0'
        };

        const result = formatOneLineCompact(info, attributes);
        assert.strictEqual(result.label, 'very_long_array_name_that_describes_data');
        assert.strictEqual(result.description, '(1024, 768) jnp.float32 TFRT_CPU_0');
    });
});

suite('TwoLine Format Tests', () => {
    interface ArrayInfo {
        shape: string | null;
        dtype: string | null;
        device: string | null;
    }

    function formatTwoLineChild(arrayInfo: ArrayInfo, attributes: string[]): string {
        const parts: string[] = [];

        if (attributes.includes('shape') && arrayInfo.shape !== null) {
            parts.push(arrayInfo.shape);
        }
        if (attributes.includes('dtype') && arrayInfo.dtype !== null) {
            parts.push(arrayInfo.dtype);
        }
        if (attributes.includes('device') && arrayInfo.device !== null) {
            parts.push(arrayInfo.device);
        }

        return parts.join(' ');
    }

    const attributes = ['shape', 'dtype', 'device'];

    test('Should create compact child with all attributes', () => {
        const info: ArrayInfo = {
            shape: '(10, 20)',
            dtype: 'np.float64',
            device: 'cpu'
        };

        const result = formatTwoLineChild(info, attributes);
        assert.strictEqual(result, '(10, 20) np.float64 cpu');
    });

    test('Should create compact child with partial attributes', () => {
        const info: ArrayInfo = {
            shape: '(5,)',
            dtype: 'torch.int64',
            device: null
        };

        const result = formatTwoLineChild(info, attributes);
        assert.strictEqual(result, '(5,) torch.int64');
    });

    test('Should create empty string when no attributes available', () => {
        const info: ArrayInfo = {
            shape: null,
            dtype: null,
            device: null
        };

        const result = formatTwoLineChild(info, attributes);
        assert.strictEqual(result, '');
    });
});
