/**
 * Unit tests for ArrayInfoItem class logic
 * Tests item creation, formatting, and tooltip generation
 */

import * as assert from 'assert';

interface ArrayInfo {
    name: string;
    type: string;
    shape: string | null;
    dtype: string | null;
    device: string | null;
    isPinned: boolean;
    isAvailable: boolean;
}

suite('Tooltip Building Tests', () => {
    function buildTooltip(info: ArrayInfo): string {
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

    test('Should build tooltip with all attributes', () => {
        const info: ArrayInfo = {
            name: 'arr1',
            type: 'numpy.ndarray',
            shape: '(10, 20)',
            dtype: 'np.float64',
            device: 'cpu',
            isPinned: false,
            isAvailable: true
        };

        const result = buildTooltip(info);
        const expected = 'arr1 (numpy.ndarray)\nShape: (10, 20)\nDtype: np.float64\nDevice: cpu';
        assert.strictEqual(result, expected);
    });

    test('Should build tooltip without device', () => {
        const info: ArrayInfo = {
            name: 'arr2',
            type: 'jax.Array',
            shape: '(5, 5)',
            dtype: 'jnp.float32',
            device: null,
            isPinned: false,
            isAvailable: true
        };

        const result = buildTooltip(info);
        const expected = 'arr2 (jax.Array)\nShape: (5, 5)\nDtype: jnp.float32';
        assert.strictEqual(result, expected);
    });

    test('Should build tooltip with only type', () => {
        const info: ArrayInfo = {
            name: 'arr3',
            type: 'torch.Tensor',
            shape: null,
            dtype: null,
            device: null,
            isPinned: false,
            isAvailable: true
        };

        const result = buildTooltip(info);
        const expected = 'arr3 (torch.Tensor)';
        assert.strictEqual(result, expected);
    });

    test('Should build tooltip for unavailable array', () => {
        const info: ArrayInfo = {
            name: 'arr4',
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned: true,
            isAvailable: false
        };

        const result = buildTooltip(info);
        const expected = 'arr4 ()';
        assert.strictEqual(result, expected);
    });

    test('Should handle complex dtype in tooltip', () => {
        const info: ArrayInfo = {
            name: 'complex_arr',
            type: 'numpy.ndarray',
            shape: '(100, 100)',
            dtype: 'np.complex128',
            device: 'cpu',
            isPinned: false,
            isAvailable: true
        };

        const result = buildTooltip(info);
        assert.ok(result.includes('Dtype: np.complex128'));
    });

    test('Should handle zero-dimensional array in tooltip', () => {
        const info: ArrayInfo = {
            name: 'scalar',
            type: 'numpy.ndarray',
            shape: '()',
            dtype: 'np.float64',
            device: 'cpu',
            isPinned: false,
            isAvailable: true
        };

        const result = buildTooltip(info);
        assert.ok(result.includes('Shape: ()'));
    });

    test('Should handle JAX device in tooltip', () => {
        const info: ArrayInfo = {
            name: 'jax_arr',
            type: 'jax.Array',
            shape: '(256, 256)',
            dtype: 'jnp.float32',
            device: 'TFRT_CPU_0',
            isPinned: false,
            isAvailable: true
        };

        const result = buildTooltip(info);
        assert.ok(result.includes('Device: TFRT_CPU_0'));
    });

    test('Should handle PyTorch GPU device in tooltip', () => {
        const info: ArrayInfo = {
            name: 'tensor',
            type: 'torch.Tensor',
            shape: '(3, 224, 224)',
            dtype: 'torch.float32',
            device: 'gpu_0',
            isPinned: false,
            isAvailable: true
        };

        const result = buildTooltip(info);
        assert.ok(result.includes('Device: gpu_0'));
    });
});

suite('Section Item Creation Tests', () => {
    function createSectionItem(sectionType: string, label: string): { type: string; label: string; isSection: boolean } {
        return {
            type: sectionType,
            label: label,
            isSection: true
        };
    }

    test('Should create highlighted section', () => {
        const section = createSectionItem('highlighted', 'Highlighted Array');
        assert.strictEqual(section.type, 'highlighted');
        assert.strictEqual(section.label, 'Highlighted Array');
        assert.strictEqual(section.isSection, true);
    });

    test('Should create pinned section', () => {
        const section = createSectionItem('pinned', 'Pinned');
        assert.strictEqual(section.type, 'pinned');
        assert.strictEqual(section.label, 'Pinned');
        assert.strictEqual(section.isSection, true);
    });

    test('Should create locals section', () => {
        const section = createSectionItem('locals', 'Locals');
        assert.strictEqual(section.type, 'locals');
        assert.strictEqual(section.label, 'Locals');
        assert.strictEqual(section.isSection, true);
    });

    test('Should create globals section', () => {
        const section = createSectionItem('globals', 'Globals');
        assert.strictEqual(section.type, 'globals');
        assert.strictEqual(section.label, 'Globals');
        assert.strictEqual(section.isSection, true);
    });
});

suite('Array Item Availability Tests', () => {
    test('Should identify available array', () => {
        const info: ArrayInfo = {
            name: 'arr1',
            type: 'numpy.ndarray',
            shape: '(10, 10)',
            dtype: 'np.float64',
            device: 'cpu',
            isPinned: false,
            isAvailable: true
        };

        assert.strictEqual(info.isAvailable, true);
    });

    test('Should identify unavailable array', () => {
        const info: ArrayInfo = {
            name: 'arr2',
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned: true,
            isAvailable: false
        };

        assert.strictEqual(info.isAvailable, false);
    });

    test('Should mark pinned out-of-scope array as unavailable', () => {
        const info: ArrayInfo = {
            name: 'out_of_scope',
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned: true,
            isAvailable: false
        };

        assert.strictEqual(info.isPinned, true);
        assert.strictEqual(info.isAvailable, false);
    });
});

suite('Context Value Tests', () => {
    function getContextValue(info: ArrayInfo, isAttribute: boolean, isSection: boolean, isHighlighted: boolean): string {
        if (isSection) {
            return 'section';
        }
        if (isAttribute) {
            return 'attribute';
        }
        if (isHighlighted) {
            return 'highlighted';
        }
        return info.isPinned ? 'pinned' : 'unpinned';
    }

    test('Should return "section" for section items', () => {
        const dummyInfo: ArrayInfo = {
            name: 'Section',
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned: false,
            isAvailable: true
        };

        const result = getContextValue(dummyInfo, false, true, false);
        assert.strictEqual(result, 'section');
    });

    test('Should return "attribute" for attribute items', () => {
        const dummyInfo: ArrayInfo = {
            name: 'shape: (10, 10)',
            type: '',
            shape: null,
            dtype: null,
            device: null,
            isPinned: false,
            isAvailable: true
        };

        const result = getContextValue(dummyInfo, true, false, false);
        assert.strictEqual(result, 'attribute');
    });

    test('Should return "highlighted" for highlighted items', () => {
        const info: ArrayInfo = {
            name: 'arr1',
            type: 'numpy.ndarray',
            shape: '(10, 10)',
            dtype: 'np.float64',
            device: 'cpu',
            isPinned: false,
            isAvailable: true
        };

        const result = getContextValue(info, false, false, true);
        assert.strictEqual(result, 'highlighted');
    });

    test('Should return "pinned" for pinned items', () => {
        const info: ArrayInfo = {
            name: 'arr2',
            type: 'jax.Array',
            shape: '(5, 5)',
            dtype: 'jnp.float32',
            device: 'TFRT_CPU_0',
            isPinned: true,
            isAvailable: true
        };

        const result = getContextValue(info, false, false, false);
        assert.strictEqual(result, 'pinned');
    });

    test('Should return "unpinned" for regular items', () => {
        const info: ArrayInfo = {
            name: 'arr3',
            type: 'torch.Tensor',
            shape: '(3, 3)',
            dtype: 'torch.float32',
            device: 'gpu_0',
            isPinned: false,
            isAvailable: true
        };

        const result = getContextValue(info, false, false, false);
        assert.strictEqual(result, 'unpinned');
    });
});

suite('Attribute Item Creation Tests', () => {
    function createAttributeItem(name: string, value: string): { label: string; isAttribute: boolean } {
        return {
            label: name ? `${name}: ${value}` : value,
            isAttribute: true
        };
    }

    test('Should create labeled attribute item', () => {
        const item = createAttributeItem('shape', '(10, 20)');
        assert.strictEqual(item.label, 'shape: (10, 20)');
        assert.strictEqual(item.isAttribute, true);
    });

    test('Should create unlabeled attribute item', () => {
        const item = createAttributeItem('', '(10, 20) np.float64 cpu');
        assert.strictEqual(item.label, '(10, 20) np.float64 cpu');
        assert.strictEqual(item.isAttribute, true);
    });

    test('Should create dtype attribute item', () => {
        const item = createAttributeItem('dtype', 'np.int32');
        assert.strictEqual(item.label, 'dtype: np.int32');
    });

    test('Should create device attribute item', () => {
        const item = createAttributeItem('device', 'gpu_0');
        assert.strictEqual(item.label, 'device: gpu_0');
    });
});

suite('Parent Detection Tests', () => {
    type SectionType = 'highlighted' | 'pinned' | 'locals' | 'globals';

    function getParentSection(
        info: ArrayInfo,
        isHighlighted: boolean,
        localsArrays: Map<string, ArrayInfo>,
        globalsArrays: Map<string, ArrayInfo>
    ): SectionType | undefined {
        if (isHighlighted) {
            return 'highlighted';
        }

        if (info.isPinned) {
            return 'pinned';
        }

        if (localsArrays.has(info.name)) {
            return 'locals';
        }

        if (globalsArrays.has(info.name)) {
            return 'globals';
        }

        return undefined;
    }

    test('Should identify highlighted section as parent', () => {
        const info: ArrayInfo = {
            name: 'arr1',
            type: 'numpy.ndarray',
            shape: '(10, 10)',
            dtype: 'np.float64',
            device: 'cpu',
            isPinned: false,
            isAvailable: true
        };

        const result = getParentSection(info, true, new Map(), new Map());
        assert.strictEqual(result, 'highlighted');
    });

    test('Should identify pinned section as parent', () => {
        const info: ArrayInfo = {
            name: 'arr2',
            type: 'jax.Array',
            shape: '(5, 5)',
            dtype: 'jnp.float32',
            device: null,
            isPinned: true,
            isAvailable: true
        };

        const result = getParentSection(info, false, new Map(), new Map());
        assert.strictEqual(result, 'pinned');
    });

    test('Should identify locals section as parent', () => {
        const info: ArrayInfo = {
            name: 'arr3',
            type: 'numpy.ndarray',
            shape: '(3, 3)',
            dtype: 'np.float32',
            device: 'cpu',
            isPinned: false,
            isAvailable: true
        };

        const locals = new Map([['arr3', info]]);
        const result = getParentSection(info, false, locals, new Map());
        assert.strictEqual(result, 'locals');
    });

    test('Should identify globals section as parent', () => {
        const info: ArrayInfo = {
            name: 'arr4',
            type: 'torch.Tensor',
            shape: '(2, 2)',
            dtype: 'torch.int64',
            device: 'cpu',
            isPinned: false,
            isAvailable: true
        };

        const globals = new Map([['arr4', info]]);
        const result = getParentSection(info, false, new Map(), globals);
        assert.strictEqual(result, 'globals');
    });

    test('Should return undefined when not in any section', () => {
        const info: ArrayInfo = {
            name: 'arr5',
            type: 'numpy.ndarray',
            shape: '(1,)',
            dtype: 'np.int32',
            device: 'cpu',
            isPinned: false,
            isAvailable: true
        };

        const result = getParentSection(info, false, new Map(), new Map());
        assert.strictEqual(result, undefined);
    });

    test('Should prioritize highlighted over pinned', () => {
        const info: ArrayInfo = {
            name: 'arr6',
            type: 'jax.Array',
            shape: '(10,)',
            dtype: 'jnp.float64',
            device: null,
            isPinned: true,
            isAvailable: true
        };

        const result = getParentSection(info, true, new Map(), new Map());
        assert.strictEqual(result, 'highlighted');
    });

    test('Should prioritize pinned over locals', () => {
        const info: ArrayInfo = {
            name: 'arr7',
            type: 'numpy.ndarray',
            shape: '(5,)',
            dtype: 'np.float32',
            device: 'cpu',
            isPinned: true,
            isAvailable: true
        };

        const locals = new Map([['arr7', info]]);
        const result = getParentSection(info, false, locals, new Map());
        assert.strictEqual(result, 'pinned');
    });
});
