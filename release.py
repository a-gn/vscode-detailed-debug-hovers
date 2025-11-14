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


def run_command(cmd, capture_output=True):
    """Run a shell command and return the result."""
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=capture_output, text=True)
    if result.returncode != 0:
        print(f"Error: Command failed with exit code {result.returncode}")
        if result.stderr:
            print(f"Error output: {result.stderr}")
        sys.exit(1)
    return result


def get_current_version():
    """Read the current version from package.json."""
    with open('package.json', 'r') as f:
        package = json.load(f)
    return package['version']


def bump_version():
    """Bump the minor version using npm version."""
    print("\n=== Bumping minor version ===")
    result = run_command(['npm', 'version', 'minor', '-m', 'Bump version to %s'])

    # npm version creates a commit and tag, but we need to remove the tag
    # because we use release/vX.Y.Z format, not just vX.Y.Z
    new_version = get_current_version()
    npm_tag = f'v{new_version}'

    # Delete the npm-created tag
    print(f"\nRemoving npm-created tag: {npm_tag}")
    run_command(['git', 'tag', '-d', npm_tag])

    return new_version


def create_release_tag(version):
    """Create a git tag in the format release/vX.Y.Z."""
    tag_name = f'release/v{version}'
    print(f"\n=== Creating release tag: {tag_name} ===")
    run_command(['git', 'tag', tag_name])
    return tag_name


def confirm_release(version, tag_name):
    """Ask user to confirm the release."""
    print("\n" + "=" * 60)
    print(f"Ready to release version {version}")
    print(f"Tag: {tag_name}")
    print("=" * 60)
    print("\nThis will:")
    print("  1. Push the version bump commit to the remote repository")
    print("  2. Push the release tag to trigger the deployment workflow")
    print("  3. Automatically publish to VSCode Marketplace via GitHub Actions")
    print("\nAre you sure you want to proceed?")

    while True:
        response = input("\nType 'yes' to confirm, 'no' to cancel: ").strip().lower()
        if response == 'yes':
            return True
        elif response == 'no':
            return False
        else:
            print("Please type 'yes' or 'no'")


def push_release(tag_name):
    """Push the commit and tag to the remote repository."""
    print("\n=== Pushing to remote ===")

    # Push the version bump commit
    print("Pushing commit...")
    run_command(['git', 'push'], capture_output=False)

    # Push the release tag
    print(f"\nPushing tag {tag_name}...")
    run_command(['git', 'push', 'origin', tag_name], capture_output=False)

    print("\n✅ Release tag pushed successfully!")
    print(f"GitHub Actions will now publish version {tag_name.replace('release/v', '')} to the VSCode Marketplace.")
    print("Check the workflow status at: https://github.com/a-gn/vscode-array-inspector/actions")


def main():
    """Main release workflow."""
    print("VSCode Array Inspector - Release Script")
    print("=" * 60)

    # Check if we're on the right branch (optional, but good practice)
    result = subprocess.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
                          capture_output=True, text=True)
    current_branch = result.stdout.strip()
    print(f"Current branch: {current_branch}")

    # Check for uncommitted changes
    result = subprocess.run(['git', 'status', '--porcelain'],
                          capture_output=True, text=True)
    if result.stdout.strip():
        print("\n❌ Error: You have uncommitted changes.")
        print("Please commit or stash them before running the release script.")
        sys.exit(1)

    # Bump version
    new_version = bump_version()
    print(f"\n✅ Version bumped to: {new_version}")

    # Create release tag
    tag_name = create_release_tag(new_version)
    print(f"✅ Created tag: {tag_name}")

    # Confirm with user
    if not confirm_release(new_version, tag_name):
        print("\n❌ Release cancelled by user.")
        print("\nRolling back changes...")

        # Reset the commit (keep changes in working directory)
        run_command(['git', 'reset', 'HEAD~1'])

        # Delete the tag
        run_command(['git', 'tag', '-d', tag_name])

        # Restore package.json
        run_command(['git', 'restore', 'package.json'])
        run_command(['git', 'restore', 'package-lock.json'])

        print("✅ Changes rolled back.")
        sys.exit(0)

    # Push release
    push_release(tag_name)


if __name__ == '__main__':
    main()
