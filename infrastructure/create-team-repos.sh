#!/usr/bin/env bash
#
# create-team-repos.sh -- Create team repositories from a GitHub template.
#
# Run this before the hackathon to create one repository per team.
# Each team repo starts as a copy of the template (with all the assignment docs).
# The script also updates teams.json with the created repo URLs.
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated
#   - This repository must be set as a GitHub template repository
#     (Settings > General > Template repository checkbox)
#
set -euo pipefail

# -------------------------------------------------------------------
# Usage
# -------------------------------------------------------------------
usage() {
    cat <<EOF
Usage: $(basename "$0") --template <owner/repo> --org <github-org> --teams <list> [OPTIONS]

Create team repositories from a GitHub template repository and update teams.json.

Required:
  --template <owner/repo>  Template repository (e.g., "myorg/hackathon-2025")
  --org <github-org>       GitHub org/user to create team repos under
  --teams <list>           Comma-separated team names (e.g., "alpha,beta,gamma")

Optional:
  --prefix <string>        Repo name prefix (default: "hackathon-team-")
  --private                Create private repos (default: public)
  --teams-file <path>      Path to teams.json to update (default: auto-detect)
  --dry-run                Show what would be done without making changes
  -h, --help               Show this help message

Example:
  $(basename "$0") \\
    --template "myorg/hackathon-2025" \\
    --org "myorg" \\
    --teams "alpha,beta,gamma,delta"

This creates repositories:
  myorg/hackathon-team-alpha
  myorg/hackathon-team-beta
  myorg/hackathon-team-gamma
  myorg/hackathon-team-delta

And updates infrastructure/teams.json with the repo URLs.

EOF
    exit 0
}

# -------------------------------------------------------------------
# Defaults
# -------------------------------------------------------------------
TEMPLATE=""
ORG=""
TEAMS=""
PREFIX="hackathon-team-"
PRIVATE=false
TEAMS_FILE=""
DRY_RUN=false

# -------------------------------------------------------------------
# Parse arguments
# -------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --template)   TEMPLATE="$2"; shift 2 ;;
        --org)        ORG="$2"; shift 2 ;;
        --teams)      TEAMS="$2"; shift 2 ;;
        --prefix)     PREFIX="$2"; shift 2 ;;
        --private)    PRIVATE=true; shift ;;
        --teams-file) TEAMS_FILE="$2"; shift 2 ;;
        --dry-run)    DRY_RUN=true; shift ;;
        -h|--help)    usage ;;
        *)            echo "Unknown option: $1"; usage ;;
    esac
done

# -------------------------------------------------------------------
# Validate
# -------------------------------------------------------------------
if [[ -z "$TEMPLATE" ]]; then
    echo "ERROR: --template is required"
    usage
fi

if [[ -z "$ORG" ]]; then
    echo "ERROR: --org is required"
    usage
fi

if [[ -z "$TEAMS" ]]; then
    echo "ERROR: --teams is required"
    usage
fi

# Verify gh CLI is installed
if ! command -v gh &>/dev/null; then
    echo "ERROR: GitHub CLI (gh) is not installed."
    echo "Install it: https://cli.github.com/"
    exit 1
fi

# Verify gh is authenticated
if ! gh auth status &>/dev/null; then
    echo "ERROR: GitHub CLI is not authenticated."
    echo "Run: gh auth login"
    exit 1
fi

# Auto-detect teams.json location
if [[ -z "$TEAMS_FILE" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    TEAMS_FILE="$SCRIPT_DIR/teams.json"
fi

# -------------------------------------------------------------------
# Create repos
# -------------------------------------------------------------------
IFS=',' read -ra TEAM_ARRAY <<< "$TEAMS"

VISIBILITY_FLAG=""
if $PRIVATE; then
    VISIBILITY_FLAG="--private"
else
    VISIBILITY_FLAG="--public"
fi

echo ""
echo "Creating ${#TEAM_ARRAY[@]} team repositories from template $TEMPLATE:"
echo ""

# Build teams.json content
JSON_ENTRIES=()

for TEAM in "${TEAM_ARRAY[@]}"; do
    TEAM=$(echo "$TEAM" | xargs)  # trim whitespace
    REPO_NAME="${PREFIX}${TEAM}"
    FULL_REPO="${ORG}/${REPO_NAME}"
    REPO_URL="https://github.com/${FULL_REPO}.git"

    # Check if repo already exists
    if gh repo view "$FULL_REPO" &>/dev/null; then
        echo "  SKIP  $FULL_REPO (already exists)"
        JSON_ENTRIES+=("  { \"name\": \"$TEAM\", \"repo_url\": \"$REPO_URL\" }")
        continue
    fi

    if $DRY_RUN; then
        echo "  DRY   $FULL_REPO (would create from $TEMPLATE)"
    else
        gh repo create "$FULL_REPO" \
            --template "$TEMPLATE" \
            $VISIBILITY_FLAG \
            --clone=false \
            && echo "  OK    $FULL_REPO (created)" \
            || { echo "  FAIL  $FULL_REPO (creation failed)"; continue; }
    fi

    JSON_ENTRIES+=("  { \"name\": \"$TEAM\", \"repo_url\": \"$REPO_URL\" }")
done

echo ""

# -------------------------------------------------------------------
# Update teams.json
# -------------------------------------------------------------------
if $DRY_RUN; then
    echo "(Dry run -- no repos were created and teams.json was not updated.)"
    echo ""
    echo "Would write to $TEAMS_FILE:"
else
    echo "Updating $TEAMS_FILE..."
fi

# Build JSON array
{
    echo "["
    for i in "${!JSON_ENTRIES[@]}"; do
        if [[ $i -lt $((${#JSON_ENTRIES[@]} - 1)) ]]; then
            echo "${JSON_ENTRIES[$i]},"
        else
            echo "${JSON_ENTRIES[$i]}"
        fi
    done
    echo "]"
} | if $DRY_RUN; then
    cat
else
    tee "$TEAMS_FILE"
fi

echo ""
echo "Done!"
echo ""

if ! $DRY_RUN; then
    echo "Next steps:"
    echo "  1. Give each team push access to their repository"
    echo "  2. Share the repo URL with each team"
    echo "  3. Commit the updated teams.json to the main hackathon repo"
fi
echo ""
