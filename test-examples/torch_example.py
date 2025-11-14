"""
Example script to test the Array Inspector extension with PyTorch tensors.

To test:
1. Install torch: pip install torch
2. Set a breakpoint at line 16
3. Start debugging (F5)
4. Hover over 'x', 'y', 'weights', etc. to see them in the Array Inspector
5. Pin some tensors to keep them visible across stack frames
"""

import torch


def compute(x, y):
    # Set breakpoint here to inspect tensors
    result = torch.matmul(x, y)
    return result


def main():
    # Create PyTorch tensors
    x = torch.tensor([[1.0, 2.0], [3.0, 4.0]])
    y = torch.tensor([[5.0, 6.0], [7.0, 8.0]])

    # Tensors with different shapes and dtypes
    weights = torch.zeros((128, 64), dtype=torch.float32)
    biases = torch.ones(64, dtype=torch.float32)
    int_tensor = torch.arange(20, dtype=torch.int64)

    # Tensors on different devices (if GPU available)
    cpu_tensor = torch.arange(100, device='cpu')
    if torch.cuda.is_available():
        gpu_tensor = torch.arange(100, device='cuda')
    else:
        gpu_tensor = None

    # Compute something
    result = compute(x, y)
    output = torch.matmul(weights, biases)

    # More operations
    normalized = result / result.sum()
    reshaped = normalized.reshape(-1)

    print(f"Result shape: {result.shape}")
    print(f"Output: {output[:5]}")
    print(f"CPU tensor device: {cpu_tensor.device}")
    if gpu_tensor is not None:
        print(f"GPU tensor device: {gpu_tensor.device}")


if __name__ == "__main__":
    main()
