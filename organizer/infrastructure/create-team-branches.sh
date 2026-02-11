#!/usr/bin/env bash
#
# create-team-branches.sh -- Create team branches from main.
#
# Run this before the hackathon to set up one branch per team.
# Each branch starts as a copy of main (with all the assignment docs).
#
set -euo pipefail

# -------------------------------------------------------------------
# Usage
# -------------------------------------------------------------------
usage() {
    cat <<EOF
Usage: $(basename "$0") --teams <list> [OPTIONS]

Create team branches from the main branch and push them to the remote.

Required:
  --teams <list>     Comma-separated team names (e.g., "alpha,beta,gamma,delta")

Optional:
  --base <branch>    Base branch to create team branches from (default: main)
  --dry-run          Show what would be done without making changes
  -h, --help         Show this help message

Example:
  $(basename "$0") --teams "alpha,beta,gamma,delta,epsilon"

This creates branches:
  teams/alpha
  teams/beta
  teams/gamma
  teams/delta
  teams/epsilon

EOF
    exit 0
}

# -------------------------------------------------------------------
# Defaults
# -------------------------------------------------------------------
TEAMS=""
BASE_BRANCH="main"
DRY_RUN=false

# -------------------------------------------------------------------
# Parse arguments
# -------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --teams)    TEAMS="$2"; shift 2 ;;
        --base)     BASE_BRANCH="$2"; shift 2 ;;
        --dry-run)  DRY_RUN=true; shift ;;
        -h|--help)  usage ;;
        *)          echo "Unknown option: $1"; usage ;;
    esac
done

if [[ -z "$TEAMS" ]]; then
    echo "ERROR: --teams is required"
    usage
fi

# -------------------------------------------------------------------
# Validate git state
# -------------------------------------------------------------------
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    echo "ERROR: Not inside a git repository."
    exit 1
fi

# Ensure we're on the base branch and up to date
echo "Fetching latest from remote..."
git fetch origin

if ! git rev-parse "origin/$BASE_BRANCH" &>/dev/null; then
    echo "ERROR: Base branch 'origin/$BASE_BRANCH' does not exist."
    exit 1
fi

# -------------------------------------------------------------------
# Create branches
# -------------------------------------------------------------------
IFS=',' read -ra TEAM_ARRAY <<< "$TEAMS"

echo ""
echo "Creating ${#TEAM_ARRAY[@]} team branches from $BASE_BRANCH:"
echo ""

for TEAM in "${TEAM_ARRAY[@]}"; do
    TEAM=$(echo "$TEAM" | xargs)  # trim whitespace
    BRANCH_NAME="teams/$TEAM"

    # Check if branch already exists on remote
    if git ls-remote --heads origin "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
        echo "  SKIP  $BRANCH_NAME (already exists on remote)"
        continue
    fi

    if $DRY_RUN; then
        echo "  DRY   $BRANCH_NAME (would create from origin/$BASE_BRANCH)"
    else
        # Create the branch from the base branch
        git branch "$BRANCH_NAME" "origin/$BASE_BRANCH" 2>/dev/null || {
            # Branch might exist locally already
            echo "  SKIP  $BRANCH_NAME (already exists locally)"
            continue
        }

        # Push to remote
        git push origin "$BRANCH_NAME"
        echo "  OK    $BRANCH_NAME (created and pushed)"
    fi
done

echo ""
echo "Done!"
echo ""

if $DRY_RUN; then
    echo "(Dry run -- no branches were actually created. Remove --dry-run to execute.)"
else
    echo "Teams can now clone and checkout their branch:"
    echo "  git clone <repo-url>"
    echo "  git checkout teams/<team-name>"
fi
echo ""
