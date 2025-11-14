"""
Example script to test the Array Inspector extension with JAX arrays.

To test:
1. Install jax: pip install jax jaxlib  (or jax[cpu] for CPU-only)
2. Set a breakpoint at line 16
3. Start debugging (F5)
4. Hover over 'x', 'y', 'weights', etc. to see them in the Array Inspector
5. Pin some arrays to keep them visible across stack frames
"""

import jax
import jax.numpy as jnp


def compute(x, y):
    # Set breakpoint here to inspect arrays
    result = jnp.dot(x, y)
    return result


def main():
    # Create JAX arrays
    x = jnp.array([[1.0, 2.0], [3.0, 4.0]])
    y = jnp.array([[5.0, 6.0], [7.0, 8.0]])

    # Arrays with different shapes and dtypes
    weights = jnp.zeros((128, 64), dtype=jnp.float32)
    biases = jnp.ones(64, dtype=jnp.float32)

    # Arrays on different devices (if GPU available)
    cpu_array = jax.device_put(jnp.arange(100), jax.devices('cpu')[0])

    # Compute something
    result = compute(x, y)
    output = jnp.dot(weights, biases)

    # More operations
    normalized = result / jnp.sum(result)
    reshaped = normalized.reshape(-1)

    print(f"Result shape: {result.shape}")
    print(f"Output: {output[:5]}")
    print(f"CPU array device: {cpu_array.device()}")


if __name__ == "__main__":
    main()
