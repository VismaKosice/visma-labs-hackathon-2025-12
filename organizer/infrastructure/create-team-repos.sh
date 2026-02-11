#!/usr/bin/env bash
#
# create-team-repos.sh -- Create team repositories from a GitHub template.
#
# Run this before the hackathon to create one repository per team.
# Each team repo starts as a copy of the template (with all the assignment docs).
#
# Teams and their GitHub usernames are defined in teams.json. The script:
#   1. Creates a GitHub repo for each team from the template
#   2. Adds every listed github_username as an admin collaborator
#   3. Updates teams.json with the created repo URLs
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated
#   - jq installed (for JSON parsing)
#   - This repository must be set as a GitHub template repository
#     (Settings > General > Template repository checkbox)
#   - teams.json populated with team names and github_usernames
#
set -euo pipefail

# -------------------------------------------------------------------
# Usage
# -------------------------------------------------------------------
usage() {
    cat <<EOF
Usage: $(basename "$0") --template <owner/repo> --org <github-org> [OPTIONS]

Create team repositories from a GitHub template repository.

Teams are read from teams.json, which should contain entries with "name" and
"github_usernames" fields. After creation, "repo_url" is written back.

Example teams.json (input):
  [
    { "name": "alpha", "github_usernames": ["alice", "bob"] },
    { "name": "beta",  "github_usernames": ["charlie"] }
  ]

Required:
  --template <owner/repo>  Template repository (e.g., "myorg/hackathon-2025")
  --org <github-org>       GitHub org/user to create team repos under

Optional:
  --teams <list>           Comma-separated team names (overrides teams.json names;
                           usernames still read from teams.json if entries match)
  --prefix <string>        Repo name prefix (default: "hackathon-team-")
  --private                Create private repos (default: public)
  --teams-file <path>      Path to teams.json (default: auto-detect)
  --dry-run                Show what would be done without making changes
  -h, --help               Show this help message

Example:
  # Pre-populate teams.json, then run:
  $(basename "$0") \\
    --template "myorg/hackathon-2025" \\
    --org "myorg"

This creates repositories and adds collaborators:
  myorg/hackathon-team-alpha  ->  alice (admin), bob (admin)
  myorg/hackathon-team-beta   ->  charlie (admin)

And updates teams.json with the repo URLs.

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

# Verify gh CLI is installed
if ! command -v gh &>/dev/null; then
    echo "ERROR: GitHub CLI (gh) is not installed."
    echo "Install it: https://cli.github.com/"
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
    echo "Create it with team entries, e.g.:"
    echo '  [{ "name": "alpha", "github_usernames": ["alice"] }]'
    exit 1
fi

# -------------------------------------------------------------------
# Read teams from teams.json (or --teams flag)
# -------------------------------------------------------------------
# Read the full JSON so we can look up github_usernames per team
TEAMS_JSON=$(cat "$TEAMS_FILE")

if [[ -n "$TEAMS" ]]; then
    # --teams flag provided: use those names, but still look up usernames from JSON
    IFS=',' read -ra TEAM_ARRAY <<< "$TEAMS"
else
    # Read team names from teams.json
    TEAM_COUNT=$(echo "$TEAMS_JSON" | jq 'length')
    if [[ "$TEAM_COUNT" -eq 0 ]]; then
        echo "ERROR: teams.json is empty. Add team entries first."
        exit 1
    fi
    TEAM_ARRAY=()
    for i in $(seq 0 $((TEAM_COUNT - 1))); do
        TEAM_NAME=$(echo "$TEAMS_JSON" | jq -r ".[$i].name")
        TEAM_ARRAY+=("$TEAM_NAME")
    done
fi

# -------------------------------------------------------------------
# Helper: get github_usernames for a team from teams.json
# -------------------------------------------------------------------
get_github_usernames() {
    local team_name="$1"
    echo "$TEAMS_JSON" | jq -r \
        --arg name "$team_name" \
        '.[] | select(.name == $name) | .github_usernames // [] | .[]'
}

# -------------------------------------------------------------------
# Helper: add a GitHub user as admin collaborator
# -------------------------------------------------------------------
add_collaborator() {
    local repo="$1"
    local username="$2"

    if $DRY_RUN; then
        echo "          DRY   Would add @$username as admin to $repo"
        return
    fi

    if gh api \
        --method PUT \
        -H "Accept: application/vnd.github+json" \
        "/repos/${repo}/collaborators/${username}" \
        -f permission=admin &>/dev/null; then
        echo "          OK    Added @$username as admin"
    else
        echo "          FAIL  Could not add @$username as admin"
    fi
}

# -------------------------------------------------------------------
# Create repos and add collaborators
# -------------------------------------------------------------------
VISIBILITY_FLAG=""
if $PRIVATE; then
    VISIBILITY_FLAG="--private"
else
    VISIBILITY_FLAG="--public"
fi

echo ""
echo "Creating ${#TEAM_ARRAY[@]} team repositories from template $TEMPLATE:"
echo ""

# Start with existing teams.json content to preserve all teams
RESULT_JSON="$TEAMS_JSON"

for TEAM in "${TEAM_ARRAY[@]}"; do
    TEAM=$(echo "$TEAM" | xargs)  # trim whitespace
    REPO_NAME="${PREFIX}${TEAM}"
    FULL_REPO="${ORG}/${REPO_NAME}"
    REPO_URL="https://github.com/${FULL_REPO}.git"

    # Collect github_usernames for this team
    USERNAMES=()
    while IFS= read -r u; do
        [[ -n "$u" ]] && USERNAMES+=("$u")
    done < <(get_github_usernames "$TEAM")

    # Build the usernames JSON array for this team entry
    USERNAMES_JSON=$(printf '%s\n' "${USERNAMES[@]}" 2>/dev/null | jq -R . | jq -s . 2>/dev/null || echo '[]')

    # Check if repo already exists
    if gh repo view "$FULL_REPO" &>/dev/null; then
        echo "  SKIP  $FULL_REPO (already exists)"
    elif $DRY_RUN; then
        echo "  DRY   $FULL_REPO (would create from $TEMPLATE)"
    else
        if gh repo create "$FULL_REPO" \
            --template "$TEMPLATE" \
            $VISIBILITY_FLAG \
            --clone=false; then
            echo "  OK    $FULL_REPO (created)"
        else
            echo "  FAIL  $FULL_REPO (creation failed)"
            # Update entry without repo_url (or add if doesn't exist)
            RESULT_JSON=$(echo "$RESULT_JSON" | jq \
                --arg name "$TEAM" \
                --argjson usernames "$USERNAMES_JSON" \
                'map(if .name == $name then . + {"github_usernames": $usernames} else . end) | 
                 if map(.name == $name) | any then . else . + [{"name": $name, "github_usernames": $usernames}] end')
            continue
        fi
    fi

    # Add collaborators
    if [[ ${#USERNAMES[@]} -gt 0 ]]; then
        for USERNAME in "${USERNAMES[@]}"; do
            add_collaborator "$FULL_REPO" "$USERNAME"
        done
    else
        echo "          (no github_usernames configured for team $TEAM)"
    fi

    # Update existing entry or add new one with repo_url
    RESULT_JSON=$(echo "$RESULT_JSON" | jq \
        --arg name "$TEAM" \
        --argjson usernames "$USERNAMES_JSON" \
        --arg url "$REPO_URL" \
        'map(if .name == $name then . + {"github_usernames": $usernames, "repo_url": $url} else . end) | 
         if map(.name == $name) | any then . else . + [{"name": $name, "github_usernames": $usernames, "repo_url": $url}] end')
done

echo ""

# -------------------------------------------------------------------
# Update teams.json
# -------------------------------------------------------------------
if $DRY_RUN; then
    echo "(Dry run -- no repos were created and teams.json was not updated.)"
    echo ""
    echo "Would write to $TEAMS_FILE:"
    echo "$RESULT_JSON" | jq .
else
    echo "Updating $TEAMS_FILE..."
    echo "$RESULT_JSON" | jq . > "$TEAMS_FILE"
    echo ""
    cat "$TEAMS_FILE"
fi

echo ""
echo "Done!"
echo ""

if ! $DRY_RUN; then
    echo "Next steps:"
    echo "  1. Each listed github_username has been invited as admin collaborator"
    echo "  2. Share the repo URL with each team"
    echo "  3. Commit the updated teams.json to the main hackathon repo"
fi
echo ""
