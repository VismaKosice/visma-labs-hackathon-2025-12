#!/usr/bin/env bash
#
# sync-team-repos.sh -- Synchronize team repositories with latest changes from template.
#
# This script updates all team repositories with the latest changes from the
# template repository's main branch. It:
#   1. Reads team repo URLs from teams.json
#   2. For each repo, adds the template as a remote (if needed)
#   3. Fetches latest changes from template
#   4. Merges template/main into team repo's main branch
#   5. Optionally pushes the changes
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated
#   - git installed
#   - jq installed (for JSON parsing)
#   - Write access to all team repositories
#
set -euo pipefail

# -------------------------------------------------------------------
# Usage
# -------------------------------------------------------------------
usage() {
    cat <<EOF
Usage: $(basename "$0") --template <owner/repo> [OPTIONS]

Synchronize team repositories with latest changes from template repository.

Required:
  --template <owner/repo>  Template repository (e.g., "myorg/hackathon-2025")

Optional:
  --teams-file <path>      Path to teams.json (default: auto-detect)
  --branch <name>          Branch to sync (default: "main")
  --push                   Push changes after merging (default: dry-run)
  --force-push             Force push (use with caution)
  --teams <list>           Comma-separated team names (sync only these teams)
  --skip-existing          Skip repos that already have the template remote
  --dry-run                Show what would be done without making changes
  -h, --help               Show this help message

Example:
  # Dry run (show what would happen)
  $(basename "$0") --template "VismaKosice/visma-labs-hackathon-2025-12"

  # Actually sync and push
  $(basename "$0") --template "VismaKosice/visma-labs-hackathon-2025-12" --push

EOF
    exit 0
}

# -------------------------------------------------------------------
# Defaults
# -------------------------------------------------------------------
TEMPLATE=""
TEAMS_FILE=""
BRANCH="main"
PUSH=false
FORCE_PUSH=false
TEAMS=""
SKIP_EXISTING=false
DRY_RUN=false

# -------------------------------------------------------------------
# Parse arguments
# -------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --template)      TEMPLATE="$2"; shift 2 ;;
        --teams-file)    TEAMS_FILE="$2"; shift 2 ;;
        --branch)        BRANCH="$2"; shift 2 ;;
        --push)          PUSH=true; shift ;;
        --force-push)    FORCE_PUSH=true; PUSH=true; shift ;;
        --teams)         TEAMS="$2"; shift 2 ;;
        --skip-existing) SKIP_EXISTING=true; shift ;;
        --dry-run)       DRY_RUN=true; shift ;;
        -h|--help)       usage ;;
        *)               echo "Unknown option: $1"; usage ;;
    esac
done

# -------------------------------------------------------------------
# Validate
# -------------------------------------------------------------------
if [[ -z "$TEMPLATE" ]]; then
    echo "ERROR: --template is required"
    usage
fi

# Verify gh CLI is installed
if ! command -v gh &>/dev/null; then
    echo "ERROR: GitHub CLI (gh) is not installed."
    echo "Install it: https://cli.github.com/"
    exit 1
fi

# Verify git is installed
if ! command -v git &>/dev/null; then
    echo "ERROR: git is not installed."
    exit 1
fi

# Verify jq is installed
if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is not installed."
    echo "Install it: https://stedolan.github.io/jq/download/"
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

if [[ ! -f "$TEAMS_FILE" ]]; then
    echo "ERROR: teams.json not found at $TEAMS_FILE"
    exit 1
fi

# Extract template owner/repo for remote URL
TEMPLATE_URL="https://github.com/${TEMPLATE}.git"
TEMPLATE_REMOTE="template-upstream"

# -------------------------------------------------------------------
# Read teams from teams.json
# -------------------------------------------------------------------
TEAMS_JSON=$(cat "$TEAMS_FILE")

if [[ -n "$TEAMS" ]]; then
    # Filter to specific teams
    IFS=',' read -ra TEAM_ARRAY <<< "$TEAMS"
    FILTERED_JSON="[]"
    for TEAM in "${TEAM_ARRAY[@]}"; do
        TEAM=$(echo "$TEAM" | xargs)
        FILTERED_JSON=$(echo "$FILTERED_JSON" | jq --arg name "$TEAM" '. + [.[] | select(.name == $name)]')
    done
    TEAMS_JSON="$FILTERED_JSON"
fi

TEAM_COUNT=$(echo "$TEAMS_JSON" | jq 'length')
if [[ "$TEAM_COUNT" -eq 0 ]]; then
    echo "ERROR: No teams found in teams.json"
    exit 1
fi

# -------------------------------------------------------------------
# Helper: sync a single repository
# -------------------------------------------------------------------
sync_repo() {
    local repo_url="$1"
    local team_name="$2"
    
    # Extract owner/repo from URL
    local repo_full
    if [[ "$repo_url" =~ https://github.com/([^/]+)/([^/]+)\.git ]]; then
        repo_full="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    else
        echo "  ERROR  Invalid repo URL format: $repo_url"
        return 1
    fi

    echo ""
    echo "Syncing $repo_full..."

    # Create temporary directory for cloning
    local temp_dir
    temp_dir=$(mktemp -d)
    trap "rm -rf '$temp_dir'" EXIT

    if $DRY_RUN; then
        echo "  DRY   Would clone $repo_url"
        echo "  DRY   Would add remote '$TEMPLATE_REMOTE' -> $TEMPLATE_URL"
        echo "  DRY   Would fetch from template"
        echo "  DRY   Would merge template/$BRANCH into $BRANCH"
        if $PUSH; then
            echo "  DRY   Would push to $repo_full"
        fi
        return 0
    fi

    # Clone the repository
    echo "  Clone  Cloning repository..."
    if ! git clone "$repo_url" "$temp_dir" --quiet; then
        echo "  ERROR  Failed to clone $repo_url"
        return 1
    fi

    cd "$temp_dir"

    # Check if template remote already exists
    if git remote | grep -q "^${TEMPLATE_REMOTE}$"; then
        if $SKIP_EXISTING; then
            echo "  SKIP  Template remote already exists (--skip-existing)"
            cd - > /dev/null
            rm -rf "$temp_dir"
            return 0
        fi
        echo "  Info  Template remote already exists, updating..."
        git remote set-url "$TEMPLATE_REMOTE" "$TEMPLATE_URL"
    else
        echo "  Add   Adding template remote..."
        git remote add "$TEMPLATE_REMOTE" "$TEMPLATE_URL"
    fi

    # Fetch from template
    echo "  Fetch Fetching latest from template..."
    if ! git fetch "$TEMPLATE_REMOTE" "$BRANCH" --quiet; then
        echo "  ERROR  Failed to fetch from template"
        cd - > /dev/null
        rm -rf "$temp_dir"
        return 1
    fi

    # Checkout main branch (or create it)
    if ! git rev-parse --verify "$BRANCH" &>/dev/null; then
        echo "  Info  Creating branch $BRANCH..."
        git checkout -b "$BRANCH" --quiet
    else
        git checkout "$BRANCH" --quiet
    fi

    # Check if merge is needed
    local template_commit
    template_commit=$(git rev-parse "${TEMPLATE_REMOTE}/${BRANCH}")
    local current_commit
    current_commit=$(git rev-parse HEAD)

    if [[ "$template_commit" == "$current_commit" ]]; then
        echo "  OK    Already up to date"
        cd - > /dev/null
        rm -rf "$temp_dir"
        return 0
    fi

    # Check if template commit is already in history
    if git merge-base --is-ancestor "$template_commit" HEAD 2>/dev/null; then
        echo "  OK    Template changes already merged"
        cd - > /dev/null
        rm -rf "$temp_dir"
        return 0
    fi

    # Merge template/main into current branch
    # Use -X theirs to prefer template version when conflicts occur
    echo "  Merge Merging template/$BRANCH into $BRANCH..."
    echo "        (Using template version for conflicts)"
    if ! git merge "${TEMPLATE_REMOTE}/${BRANCH}" --no-edit --allow-unrelated-histories -X theirs --quiet; then
        echo "  WARN  Merge conflict detected. Manual resolution required."
        echo "        Repository cloned to: $temp_dir"
        echo "        Resolve conflicts and push manually."
        cd - > /dev/null
        # Don't delete temp_dir on conflict - user might need it
        trap - EXIT
        return 1
    fi

    # Push if requested
    if $PUSH; then
        echo "  Push  Pushing to $repo_full..."
        if $FORCE_PUSH; then
            if ! git push origin "$BRANCH" --force --quiet; then
                echo "  ERROR  Failed to force push"
                cd - > /dev/null
                rm -rf "$temp_dir"
                return 1
            fi
        else
            if ! git push origin "$BRANCH" --quiet; then
                echo "  ERROR  Failed to push (use --force-push if needed)"
                cd - > /dev/null
                rm -rf "$temp_dir"
                return 1
            fi
        fi
        echo "  OK    Pushed successfully"
    else
        echo "  OK    Merged locally (use --push to push to remote)"
    fi

    cd - > /dev/null
    rm -rf "$temp_dir"
    trap - EXIT
    return 0
}

# -------------------------------------------------------------------
# Main: sync all repositories
# -------------------------------------------------------------------
echo ""
echo "=========================================="
echo " Sync Team Repositories with Template"
echo "=========================================="
echo "Template: $TEMPLATE"
echo "Branch:   $BRANCH"
echo "Teams:    $TEAM_COUNT"
if $DRY_RUN; then
    echo "Mode:     DRY RUN (no changes will be made)"
elif $PUSH; then
    echo "Mode:     SYNC AND PUSH"
    if $FORCE_PUSH; then
        echo "          (with force push)"
    fi
else
    echo "Mode:     SYNC ONLY (use --push to push changes)"
fi
echo ""

SUCCESS=0
FAILED=0

for i in $(seq 0 $((TEAM_COUNT - 1))); do
    TEAM_NAME=$(echo "$TEAMS_JSON" | jq -r ".[$i].name")
    REPO_URL=$(echo "$TEAMS_JSON" | jq -r ".[$i].repo_url // empty")

    if [[ -z "$REPO_URL" ]]; then
        echo ""
        echo "Skipping $TEAM_NAME (no repo_url in teams.json)"
        continue
    fi

    if sync_repo "$REPO_URL" "$TEAM_NAME"; then
        SUCCESS=$((SUCCESS + 1))
    else
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "=========================================="
echo " Summary"
echo "=========================================="
echo "Success: $SUCCESS"
echo "Failed:  $FAILED"
echo "Total:   $((SUCCESS + FAILED))"
echo ""

if [[ $FAILED -gt 0 ]]; then
    exit 1
fi
