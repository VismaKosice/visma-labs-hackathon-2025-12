#!/usr/bin/env bash
#
# prepare-submission.sh -- Prepare PensionCalculationEngine for submission
#
# This script copies the PensionCalculationEngine to a target directory
# (typically a git repository) for hackathon submission.
#
# Usage:
#   ./prepare-submission.sh <target-directory>
#
# Example:
#   ./prepare-submission.sh ~/test-submission-repo
#   cd ~/test-submission-repo
#   git add .
#   git commit -m "Submission"
#   git push

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/../PensionCalculationEngine"
TARGET_DIR="${1:-}"

if [ -z "$TARGET_DIR" ]; then
    echo "Error: Target directory required"
    echo ""
    echo "Usage: $0 <target-directory>"
    echo ""
    echo "Example:"
    echo "  $0 ~/test-submission-repo"
    echo "  $0 /path/to/team-repo"
    exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Source directory not found: $SOURCE_DIR"
    exit 1
fi

# Create target directory if it doesn't exist
mkdir -p "$TARGET_DIR"

echo "Preparing submission..."
echo "  Source: $SOURCE_DIR"
echo "  Target: $TARGET_DIR"
echo ""

# Copy all files from PensionCalculationEngine to target
echo "Copying files..."
rsync -av --exclude='bin/' --exclude='obj/' --exclude='.vs/' "$SOURCE_DIR/" "$TARGET_DIR/"

# Verify Dockerfile is in root
if [ ! -f "$TARGET_DIR/Dockerfile" ]; then
    echo "Warning: Dockerfile not found in target directory!"
    exit 1
fi

echo ""
echo "✓ Submission prepared successfully!"
echo ""
echo "Next steps:"
echo "  1. cd $TARGET_DIR"
echo "  2. Review the files"
echo "  3. Test the Docker build:"
echo "     docker build -t test-engine ."
echo "  4. Test locally:"
echo "     docker run -p 8080:8080 test-engine"
echo "  5. If using git:"
echo "     git add ."
echo "     git commit -m 'Submission'"
echo "     git push"
