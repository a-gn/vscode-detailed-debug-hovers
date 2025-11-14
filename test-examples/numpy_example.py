"""
Example script to test the Array Inspector extension with NumPy arrays.

To test:
1. Install numpy: pip install numpy
2. Set a breakpoint at line 15
3. Start debugging (F5)
4. Hover over 'arr1', 'arr2', etc. to see them in the Array Inspector
5. Pin some arrays to keep them visible
"""

import numpy as np


def main():
    # Create various NumPy arrays
    arr1 = np.zeros((100, 50))  # Breakpoint here
    arr2 = np.ones((1000, 1000, 300), dtype=np.int32)
    arr3 = np.random.randn(1000)

    # Do some operations
    result = arr1 + arr2[:100, :50, 0]
    mean_value = arr3.mean()

    # Create different dtypes
    int_array = np.arange(20, dtype=np.int64)
    float_array = np.linspace(0, 1, 100, dtype=np.float32)
    complex_array = np.array([1+2j, 3+4j, 5+6j])

    print(f"Result shape: {result.shape}")
    print(f"Mean: {mean_value}")
    print(f"Int array: {int_array[:5]}")


if __name__ == "__main__":
    main()
