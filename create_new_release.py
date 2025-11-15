#!/usr/bin/env python3
"""
Release script for VSCode Array Inspector extension.

This script automates the release process by:
1. Bumping the minor version using npm
2. Parsing the new version from package.json
3. Creating a git tag in the format release/vX.Y.Z
4. Pushing the tag to trigger the deployment workflow

Usage:
    python release.py
"""

import json
import subprocess
import sys


def get_current_version():
    """Read the current version from package.json."""
    with open('package.json', 'r') as f:
        package = json.load(f)
    return package['version']


def main():
    """Main release workflow."""
    print("VSCode Array Inspector - Release Script")
    print("=" * 60)

    # Check current branch
    result = subprocess.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
                          capture_output=True, text=True, check=True)
    print(f"Current branch: {result.stdout.strip()}")

    # Check for uncommitted changes
    result = subprocess.run(['git', 'status', '--porcelain'],
                          capture_output=True, text=True, check=True)
    if result.stdout.strip():
        print("\n❌ Error: You have uncommitted changes.")
        print("Please commit or stash them before running the release script.")
        sys.exit(1)

    # Bump version
    print("\n=== Bumping minor version ===")
    subprocess.run(["npm", "version", "minor", "-m", "Release version %s"], check=True)

    # npm version creates a tag with format vX.Y.Z, but we need release/vX.Y.Z
    new_version = get_current_version()
    npm_tag = f'v{new_version}'
    release_tag = f'release/v{new_version}'

    print(f"\n✅ Version bumped to: {new_version}")

    # Remove npm-created tag and create release tag
    print(f"\nRemoving npm-created tag: {npm_tag}")
    subprocess.run(['git', 'tag', '-d', npm_tag], check=True)

    print(f"Creating release tag: {release_tag}")
    subprocess.run(['git', 'tag', release_tag], check=True)
    print(f"✅ Created tag: {release_tag}")

    # Confirm with user
    print("\n" + "=" * 60)
    print(f"Ready to release version {new_version}")
    print(f"Tag: {release_tag}")
    print("=" * 60)
    print("\nThis will:")
    print("  1. Push the version bump commit to the remote repository")
    print("  2. Push the release tag to trigger the deployment workflow")
    print("  3. Automatically publish to VSCode Marketplace via GitHub Actions")
    print("\nAre you sure you want to proceed?")

    while True:
        response = input("\nType 'yes' to confirm, 'no' to cancel: ").strip().lower()
        if response == 'yes':
            break
        elif response == 'no':
            print("\n❌ Release cancelled by user.")
            print("\nRolling back changes...")
            subprocess.run(['git', 'reset', 'HEAD~1'], check=True)
            subprocess.run(['git', 'tag', '-d', release_tag], check=True)
            subprocess.run(['git', 'restore', 'package.json'], check=True)
            subprocess.run(['git', 'restore', 'package-lock.json'], check=True)
            print("✅ Changes rolled back.")
            sys.exit(0)
        else:
            print("Please type 'yes' or 'no'")

    # Push release
    print("\n=== Pushing to remote ===")
    subprocess.run(['git', 'push'], check=True)
    subprocess.run(['git', 'push', 'origin', release_tag], check=True)

    print("\n✅ Release tag pushed successfully!")
    print(f"GitHub Actions will now publish version {new_version} to the VSCode Marketplace.")
    print("Check the workflow status at: https://github.com/a-gn/vscode-array-inspector/actions")


if __name__ == '__main__':
    main()
