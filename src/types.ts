/**
 * Originally written by Claude (Sonnet 4.5) on 2025/11/14
 */

export interface ArrayInfo {
    name: string;
    type: string;
    shape: string | null;
    dtype: string | null;
    device: string | null;
    isPinned: boolean;
    isAvailable: boolean;
}

export interface PinnedArray {
    name: string;
    expression: string;
}

export interface EvaluateResponse {
    success: boolean;
    body?: {
        result: string;
        type?: string;
        variablesReference: number;
    };
    message?: string;
}
