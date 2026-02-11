#!/usr/bin/env bash
#
# setup-api-key.sh -- Securely set up AI API key for code quality assessment.
#
# This script creates a protected .env file with restricted permissions (600)
# that contains the API key. The continuous-test.sh script will automatically
# load it if present.
#
set -euo pipefail

ENV_FILE="$HOME/.hackathon-env"

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Securely set up AI API key for code quality assessment.

Options:
  --anthropic-key <key>    Set ANTHROPIC_API_KEY
  --openai-key <key>       Set OPENAI_API_KEY
  --remove                 Remove the API key file
  -h, --help               Show this help

Examples:
  $(basename "$0") --anthropic-key "sk-ant-..."
  $(basename "$0") --openai-key "sk-..."
  $(basename "$0") --remove

The API key is stored in $ENV_FILE with permissions 600 (readable only by owner).
EOF
    exit 0
}

if [[ $# -eq 0 ]]; then
    usage
fi

case "$1" in
    --anthropic-key)
        if [[ -z "${2:-}" ]]; then
            echo "ERROR: --anthropic-key requires a value"
            exit 1
        fi
        echo "export ANTHROPIC_API_KEY='$2'" > "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        echo "✓ ANTHROPIC_API_KEY set in $ENV_FILE (permissions: 600)"
        ;;
    --openai-key)
        if [[ -z "${2:-}" ]]; then
            echo "ERROR: --openai-key requires a value"
            exit 1
        fi
        echo "export OPENAI_API_KEY='$2'" > "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        echo "✓ OPENAI_API_KEY set in $ENV_FILE (permissions: 600)"
        ;;
    --remove)
        rm -f "$ENV_FILE"
        echo "✓ API key file removed"
        ;;
    -h|--help)
        usage
        ;;
    *)
        echo "ERROR: Unknown option: $1"
        usage
        ;;
esac
