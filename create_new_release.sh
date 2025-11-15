#!/usr/bin/env bash
set -euo pipefail

echo "VSCode Array Inspector - Release Script"
echo "============================================================"

# Check current branch
echo "Current branch: $(git rev-parse --abbrev-ref HEAD)"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo ""
    echo "❌ Error: You have uncommitted changes."
    echo "Please commit or stash them before running the release script."
    exit 1
fi

# Bump version
echo ""
echo "=== Bumping minor version ==="
npm version minor -m "Release version %s"

# npm version creates a tag with format vX.Y.Z, but we need release/vX.Y.Z
NEW_VERSION=$(node -p "require('./package.json').version")
NPM_TAG="v${NEW_VERSION}"
RELEASE_TAG="release/v${NEW_VERSION}"

echo ""
echo "✅ Version bumped to: ${NEW_VERSION}"

# Remove npm-created tag and create release tag
echo ""
echo "Removing npm-created tag: ${NPM_TAG}"
git tag -d "${NPM_TAG}"

echo "Creating release tag: ${RELEASE_TAG}"
git tag "${RELEASE_TAG}"
echo "✅ Created tag: ${RELEASE_TAG}"

# Confirm with user
echo ""
echo "============================================================"
echo "Ready to release version ${NEW_VERSION}"
echo "Tag: ${RELEASE_TAG}"
echo "============================================================"
echo ""
echo "This will:"
echo "  1. Push the version bump commit to the remote repository"
echo "  2. Push the release tag to trigger the deployment workflow"
echo "  3. Automatically publish to VSCode Marketplace via GitHub Actions"
echo ""
read -r -p "Type 'yes' to confirm, anything else to cancel: " RESPONSE

if [ "${RESPONSE}" != "yes" ]; then
    echo ""
    echo "❌ Release cancelled."
    echo ""
    echo "Rolling back changes..."
    git reset HEAD~1
    git tag -d "${RELEASE_TAG}"
    git restore package.json package-lock.json
    echo "✅ Changes rolled back."
    exit 1
fi

# Push release
echo ""
echo "=== Pushing to remote ==="
git push
git push origin "${RELEASE_TAG}"

echo ""
echo "✅ Release tag pushed successfully!"
echo "GitHub Actions will now publish version ${NEW_VERSION} to the VSCode Marketplace."
echo "Check the workflow status at: https://github.com/a-gn/vscode-array-inspector/actions"
