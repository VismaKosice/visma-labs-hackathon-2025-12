#!/usr/bin/env bash
#
# run-dry-run.sh -- Automated dry run script for hackathon day
#
# This script automates most of the dry run process. It will:
# 1. Check prerequisites
# 2. Create Azure resources
# 3. Set up the VM
# 4. Create a test team repo
# 5. Prepare and push a test submission
# 6. Run tests on the VM
#
# Usage:
#   ./run-dry-run.sh [--skip-azure] [--skip-repos] [--github-org <org>]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Defaults
SKIP_AZURE=false
SKIP_REPOS=false
GITHUB_ORG=""
SUBSCRIPTION_ID=""
RESOURCE_GROUP="hackathon-2025-dry-run"
VM_NAME="hackathon-runner-dry-run"
LOCATION="westeurope"
VM_SIZE="Standard_D2s_v5"  # Default for dry run (2 vCPU). Use Standard_D4s_v5 (4 vCPU) for production
TEAM_NAME="dry-run"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-azure) SKIP_AZURE=true; shift ;;
        --skip-repos) SKIP_REPOS=true; shift ;;
        --github-org) GITHUB_ORG="$2"; shift 2 ;;
        --subscription-id) SUBSCRIPTION_ID="$2"; shift 2 ;;
        --vm-size) VM_SIZE="$2"; shift 2 ;;
        --help) 
            echo "Usage: $0 --subscription-id <id> --github-org <org> [OPTIONS]"
            echo ""
            echo "Required:"
            echo "  --subscription-id <id>  Azure subscription ID (required)"
            echo "  --github-org <org>      GitHub organization/username"
            echo ""
            echo "Optional:"
            echo "  --skip-azure           Skip Azure resource creation"
            echo "  --skip-repos           Skip repository creation"
            echo "  --vm-size <size>        VM size (default: Standard_D2s_v5 for dry run)"
            echo "                         Use Standard_D4s_v5 for production testing"
            echo ""
            echo "Example (dry run):"
            echo "  $0 --subscription-id ef28d691-8d79-4e64-abab-ec600b490eb8 --github-org VismaKosice"
            echo ""
            echo "Example (production-like):"
            echo "  $0 --subscription-id <id> --github-org VismaKosice --vm-size Standard_D4s_v5"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# -------------------------------------------------------------------
# Prerequisites Check
# -------------------------------------------------------------------
echo "=== Checking Prerequisites ==="
echo ""

check_command() {
    if command -v "$1" &>/dev/null; then
        echo -e "${GREEN}✓${NC} $1 installed"
        return 0
    else
        echo -e "${RED}✗${NC} $1 not found"
        return 1
    fi
}

ERRORS=0

check_command az || ERRORS=$((ERRORS + 1))
check_command gh || ERRORS=$((ERRORS + 1))
# Docker is optional locally (only needed on VM)
if check_command docker; then
    echo -e "${GREEN}✓${NC} Docker available locally (optional)"
fi
check_command jq || ERRORS=$((ERRORS + 1))

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${RED}Please install missing prerequisites before continuing.${NC}"
    exit 1
fi

# Check Azure login
if ! az account show &>/dev/null; then
    echo -e "${YELLOW}⚠${NC} Not logged into Azure. Run: az login"
    echo "Continuing anyway, but Azure steps will fail..."
fi

# Check GitHub auth
if ! gh auth status &>/dev/null; then
    echo -e "${YELLOW}⚠${NC} GitHub CLI not authenticated. Run: gh auth login"
    echo "Continuing anyway, but repo creation will fail..."
fi

# Get GitHub org
if [ -z "$GITHUB_ORG" ]; then
    echo ""
    echo "Enter your GitHub organization/username:"
    read -r GITHUB_ORG
fi

if [ -z "$GITHUB_ORG" ]; then
    echo -e "${RED}GitHub org is required. Use --github-org <org>${NC}"
    exit 1
fi

if [ -z "$SUBSCRIPTION_ID" ]; then
    echo -e "${RED}Azure subscription ID is required. Use --subscription-id <id>${NC}"
    echo ""
    echo "Available subscriptions:"
    az account list --output table --query "[].{Name:name, SubscriptionId:id}" 2>/dev/null || true
    echo ""
    echo "Example:"
    echo "  $0 --subscription-id ef28d691-8d79-4e64-abab-ec600b490eb8 --github-org $GITHUB_ORG"
    exit 1
fi

# Set Azure subscription
echo "Setting Azure subscription to: $SUBSCRIPTION_ID"
az account set --subscription "$SUBSCRIPTION_ID" || {
    echo -e "${RED}Failed to set subscription. Check that the subscription ID is correct.${NC}"
    exit 1
}

# Verify subscription is set
CURRENT_SUB=$(az account show --query id -o tsv)
if [ "$CURRENT_SUB" != "$SUBSCRIPTION_ID" ]; then
    echo -e "${RED}Warning: Subscription mismatch. Expected $SUBSCRIPTION_ID but got $CURRENT_SUB${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Using GitHub org: $GITHUB_ORG${NC}"
echo -e "${GREEN}Using Azure subscription: $SUBSCRIPTION_ID${NC}"
echo ""

# -------------------------------------------------------------------
# Step 1: Create Azure Resources
# -------------------------------------------------------------------
if [ "$SKIP_AZURE" = false ]; then
    echo "=== Step 1: Creating Azure Resources ==="
    echo ""
    
    echo "Creating resource group in subscription $SUBSCRIPTION_ID..."
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --subscription "$SUBSCRIPTION_ID" --output none || {
        echo -e "${YELLOW}Resource group may already exist, continuing...${NC}"
    }
    
    echo "Creating VM (this may take a few minutes)..."
    echo "Using VM size: $VM_SIZE (2 vCPU due to quota limits)"
    az vm create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$VM_NAME" \
        --image Ubuntu2204 \
        --size "$VM_SIZE" \
        --admin-username hackathon \
        --generate-ssh-keys \
        --public-ip-sku Standard \
        --subscription "$SUBSCRIPTION_ID" \
        --output none || {
        echo -e "${YELLOW}VM may already exist, continuing...${NC}"
    }
    
    VM_IP=$(az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --query publicIps -o tsv 2>/dev/null || echo "")
    
    if [ -z "$VM_IP" ]; then
        echo -e "${RED}Failed to get VM IP. Check Azure resources manually.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}VM created: $VM_IP${NC}"
    echo ""
    
    # Wait for VM to be ready
    echo "Waiting for VM to be ready..."
    sleep 30
    
    # Copy setup script
    echo "Copying setup script to VM..."
    scp -o StrictHostKeyChecking=no infrastructure/setup-vm.sh hackathon@$VM_IP:~/ 2>/dev/null || {
        echo -e "${YELLOW}SSH connection may need a moment, retrying...${NC}"
        sleep 10
        scp -o StrictHostKeyChecking=no infrastructure/setup-vm.sh hackathon@$VM_IP:~/
    }
    
    # Update setup script with GitHub org
    ssh -o StrictHostKeyChecking=no hackathon@$VM_IP "sed -i 's/<GITHUB_ORG>/$GITHUB_ORG/g' ~/setup-vm.sh"
    
    echo "Running VM setup (this may take 5-10 minutes)..."
    ssh -o StrictHostKeyChecking=no hackathon@$VM_IP "chmod +x ~/setup-vm.sh && ~/setup-vm.sh" || {
        echo -e "${YELLOW}Setup script had warnings, but continuing...${NC}"
    }
    
    echo ""
    echo -e "${GREEN}VM setup complete!${NC}"
    echo ""
else
    echo "=== Skipping Azure Setup ==="
    echo "Getting existing VM IP..."
    
    if [ -z "$SUBSCRIPTION_ID" ]; then
        echo "Enter VM IP address:"
        read -r VM_IP
    else
        VM_IP=$(az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --subscription "$SUBSCRIPTION_ID" --query publicIps -o tsv 2>/dev/null || echo "")
        
        if [ -z "$VM_IP" ]; then
            echo "Enter VM IP address:"
            read -r VM_IP
        fi
    fi
    
    echo -e "${GREEN}Using VM: $VM_IP${NC}"
    echo ""
fi

# -------------------------------------------------------------------
# Step 2: Create Team Repository
# -------------------------------------------------------------------
if [ "$SKIP_REPOS" = false ]; then
    echo "=== Step 2: Creating Test Team Repository ==="
    echo ""
    
    # Update teams.json temporarily
    BACKUP_TEAMS_JSON=$(mktemp)
    cp infrastructure/teams.json "$BACKUP_TEAMS_JSON"
    
    # Create team repo
    echo "Creating team repository..."
    # Determine the actual repository name from git remote
    REPO_NAME=$(basename -s .git $(git remote get-url origin 2>/dev/null) || echo "visma-labs-hackathon-2025-12")
    TEMPLATE_REPO="$GITHUB_ORG/$REPO_NAME"
    
    echo "Using template repository: $TEMPLATE_REPO"
    ./infrastructure/create-team-repos.sh \
        --template "$TEMPLATE_REPO" \
        --org "$GITHUB_ORG" \
        --teams "$TEAM_NAME" || {
        echo -e "${YELLOW}Repo creation failed or repo already exists, continuing...${NC}"
    }
    
    echo ""
    echo -e "${GREEN}Team repository created${NC}"
    echo ""
fi

# -------------------------------------------------------------------
# Step 3: Prepare and Push Submission
# -------------------------------------------------------------------
echo "=== Step 3: Preparing Test Submission ==="
echo ""

TEMP_REPO_DIR=$(mktemp -d)
REPO_URL="https://github.com/$GITHUB_ORG/hackathon-team-$TEAM_NAME.git"

echo "Cloning test repo to: $TEMP_REPO_DIR"
echo "Repository URL: $REPO_URL"

# Check if repo exists first
if ! gh repo view "$GITHUB_ORG/hackathon-team-$TEAM_NAME" &>/dev/null; then
    echo -e "${YELLOW}Repository doesn't exist yet. Creating it now...${NC}"
    REPO_NAME=$(basename -s .git $(git remote get-url origin 2>/dev/null) || echo "visma-labs-hackathon-2025-12")
    TEMPLATE_REPO="$GITHUB_ORG/$REPO_NAME"
    ./infrastructure/create-team-repos.sh \
        --template "$TEMPLATE_REPO" \
        --org "$GITHUB_ORG" \
        --teams "$TEAM_NAME" || {
        echo -e "${RED}Failed to create repository.${NC}"
        exit 1
    }
    sleep 2  # Give GitHub a moment to create the repo
fi

git clone "$REPO_URL" "$TEMP_REPO_DIR" || {
    echo -e "${RED}Failed to clone repo. Make sure it exists and is accessible.${NC}"
    exit 1
}

echo "Copying PensionCalculationEngine..."
./prepare-submission.sh "$TEMP_REPO_DIR"

echo "Committing and pushing..."
cd "$TEMP_REPO_DIR"
git add .
git commit -m "Dry run submission" || echo "Nothing to commit"
git push origin main || echo "Push failed or already up to date"

cd "$SCRIPT_DIR"
echo ""
echo -e "${GREEN}Submission pushed!${NC}"
echo ""

# -------------------------------------------------------------------
# Step 4: Set Up Testing Client on VM
# -------------------------------------------------------------------
echo "=== Step 4: Setting Up Testing Client on VM ==="
echo ""

echo "Cloning hackathon repo on VM..."
# Get the actual repository name
REPO_NAME=$(basename -s .git $(git remote get-url origin 2>/dev/null) || echo "visma-labs-hackathon-2025-12")
ssh -o StrictHostKeyChecking=no hackathon@$VM_IP "rm -rf ~/hackathon && git clone https://github.com/$GITHUB_ORG/$REPO_NAME.git ~/hackathon" || {
    echo -e "${YELLOW}Clone failed, repo may already exist${NC}"
}

echo "Copying teams.json..."
scp -o StrictHostKeyChecking=no infrastructure/teams.json hackathon@$VM_IP:~/hackathon/organizer/infrastructure/

echo "Installing testing client dependencies..."
ssh -o StrictHostKeyChecking=no hackathon@$VM_IP "cd ~/hackathon/organizer/testing-client && npm install" || {
    echo -e "${YELLOW}npm install had issues, but continuing...${NC}"
}

echo ""
echo -e "${GREEN}Testing client ready!${NC}"
echo ""

# -------------------------------------------------------------------
# Step 5: Run Tests
# -------------------------------------------------------------------
echo "=== Step 5: Running Tests ==="
echo ""
echo "This will run the full test suite. It may take 10-20 minutes."
echo ""
read -p "Press Enter to continue, or Ctrl+C to cancel..."

echo "Preparing VM for testing..."
ssh -o StrictHostKeyChecking=no hackathon@$VM_IP "docker kill \$(docker ps -q) 2>/dev/null || true; docker system prune -af --volumes 2>/dev/null || true"

echo "Running test suite..."
ssh -o StrictHostKeyChecking=no hackathon@$VM_IP "cd ~/hackathon && ./organizer/infrastructure/run-all-teams.sh --output-dir ~/results" || {
    echo -e "${YELLOW}Test execution completed with warnings${NC}"
}

echo ""
echo "=== Test Results ==="
echo ""

echo "Fetching results..."
scp -o StrictHostKeyChecking=no hackathon@$VM_IP:~/results/team-$TEAM_NAME.json /tmp/dry-run-results.json 2>/dev/null || {
    echo -e "${YELLOW}Results file not found. Check VM manually.${NC}"
    echo "SSH: ssh hackathon@$VM_IP"
    echo "Results: ~/results/"
    exit 0
}

echo "Results saved to: /tmp/dry-run-results.json"
echo ""
echo "Summary:"
cat /tmp/dry-run-results.json | jq '{
    correctness_score: .correctness.score,
    performance_score: .performance.score,
    cold_start_ms: .cold_start.startup_time_ms,
    code_quality_score: .code_quality.score,
    total_score: .total_score
}' 2>/dev/null || cat /tmp/dry-run-results.json

echo ""
echo -e "${GREEN}Dry run complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review results: cat /tmp/dry-run-results.json | jq '.'"
echo "  2. Check VM results: ssh hackathon@$VM_IP 'cat ~/results/team-$TEAM_NAME.json | jq'"
if [ -n "$SUBSCRIPTION_ID" ]; then
    echo "  3. Clean up Azure: az group delete --name $RESOURCE_GROUP --subscription $SUBSCRIPTION_ID --yes --no-wait"
else
    echo "  3. Clean up Azure: az group delete --name $RESOURCE_GROUP --yes --no-wait"
fi
echo "  4. Clean up repo: gh repo delete $GITHUB_ORG/hackathon-team-$TEAM_NAME --yes"
