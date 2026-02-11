# Infrastructure & Deployment Guide (Organizer-Only)

> **Before the hackathon:** Replace all occurrences of `<GITHUB_ORG>` in this file and related scripts with actual values.

This document covers how to set up and run the hackathon testing infrastructure in Azure.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  GitHub                                                 │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Template Repo (organizer)                        │   │
│  │ docs + testing client + infrastructure           │   │
│  └──────────────────────────────────────────────────┘   │
│       │ "Use this template"                             │
│       ▼                                                 │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│  │ team-alpha │ │ team-beta  │ │ team-...   │          │
│  │ (own repo) │ │ (own repo) │ │ (own repo) │          │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘          │
│        │               │              │                 │
└────────┼───────────────┼──────────────┼─────────────────┘
         │  git clone    │              │
┌────────┼───────────────┼──────────────┼─────────────────┐
│  Azure │               │              │                 │
│        ▼               ▼              ▼                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Test Runner VM (Standard_D4s_v5)                │   │
│  │  Ubuntu 22.04 + Docker + Node.js 20              │   │
│  │                                                  │   │
│  │  Reads teams.json, then for each team:           │   │
│  │    1. Clone team repo from GitHub                │   │
│  │    2. docker build --no-cache                    │   │
│  │    3. Start container on :8080                   │   │
│  │    4. Run testing client (correctness + perf)    │   │
│  │    5. AI code review (from cloned source)        │   │
│  │    6. Stop container, remove image, save results │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Blob Storage (optional)                         │   │
│  │  results/team-alpha.json                         │   │
│  │  results/team-beta.json                          │   │
│  │  results/leaderboard.json                        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Static Web App (optional)                       │   │
│  │  Leaderboard UI                                  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

- Azure CLI (`az`) installed and authenticated
- GitHub CLI (`gh`) installed and authenticated (for creating team repos)
- SSH access to Azure VMs
- The testing client application built and ready (see `../testing-client/PRD.md` (i.e., `organizer/testing-client/PRD.md`))

## Step 1: Create Azure Resources

### Resource Group

```bash
RESOURCE_GROUP="hackathon-2025"
LOCATION="westeurope"  # Choose a region close to you

az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
```

### Test Runner VM

Use `Standard_D4s_v5` (4 vCPU, 16 GB RAM) for consistent performance benchmarking.

```bash
VM_NAME="hackathon-runner"

az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --image Ubuntu2204 \
  --size Standard_D4s_v5 \
  --admin-username hackathon \
  --generate-ssh-keys \
  --public-ip-sku Standard

# Open port 80 if you want to serve the leaderboard from this VM
az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port 80 \
  --priority 1010
```

Note the public IP from the output.

### Blob Storage (optional, for leaderboard)

```bash
STORAGE_ACCOUNT="hackathon2025results"

az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS

az storage container create \
  --name results \
  --account-name "$STORAGE_ACCOUNT" \
  --public-access blob
```

## Step 2: Set Up the VM

SSH into the VM and run the setup script:

```bash
# Get VM IP
VM_IP=$(az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --query publicIps -o tsv)

# Copy setup script to VM
scp organizer/infrastructure/setup-vm.sh hackathon@$VM_IP:~/

# SSH in and run setup
ssh hackathon@$VM_IP
chmod +x ~/setup-vm.sh
~/setup-vm.sh
```

Or run it remotely:

```bash
az vm run-command invoke \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --command-id RunShellScript \
  --scripts @organizer/infrastructure/setup-vm.sh
```

## Step 3: Create Team Repositories

Before the hackathon, mark this repo as a **GitHub template** (Settings > General > Template repository) and create team repos:

```bash
./organizer/infrastructure/create-team-repos.sh \
  --template "<GITHUB_ORG>/hackathon-2025" \
  --org "<GITHUB_ORG>" \
  --teams "alpha,beta,gamma,delta"
```

This creates one repo per team and updates `organizer/infrastructure/teams.json` with repo URLs.

Give each team push access to their repo and share the URL.

## Step 4: Clone Repository and Install Testing Client

On the VM:

```bash
git clone https://github.com/<GITHUB_ORG>/hackathon-2025.git ~/hackathon
cd ~/hackathon/organizer/testing-client
npm install
```

Copy the updated `teams.json` to the VM (if you edited it locally):

```bash
scp organizer/infrastructure/teams.json hackathon@$VM_IP:~/hackathon/organizer/infrastructure/
```

Set the AI review API key:

```bash
export ANTHROPIC_API_KEY='your-key-here'
# or
export OPENAI_API_KEY='your-key-here'
```

## Step 5: Run Tests (Hackathon Day)

### Option A: Run all teams at once

```bash
# SSH into the VM
ssh hackathon@$VM_IP

# Run the orchestrator (reads teams.json, clones + builds + tests each team)
cd ~/hackathon
./organizer/infrastructure/run-all-teams.sh --output-dir ~/results
```

The script reads `organizer/infrastructure/teams.json` and for each team:
1. Clones the team's repository
2. Builds the Docker image locally with `--no-cache`
3. Starts the container with CPU/memory limits
4. Runs the full test suite
5. Cleans up (stop container, remove image, prune)

### Option B: Run a single team manually

```bash
TEAM="alpha"
REPO_URL="https://github.com/<GITHUB_ORG>/hackathon-team-alpha.git"

# Clone and build
git clone --depth 1 "$REPO_URL" ~/repos/$TEAM
docker build --no-cache -t hackathon-team-$TEAM:latest ~/repos/$TEAM

# Start container (use same resource limits as the orchestrator for fair comparison)
docker run -d --name team-$TEAM --cpus="3.0" --memory="12g" -p 8080:8080 hackathon-team-$TEAM:latest

# Run testing client
cd ~/hackathon/organizer/testing-client
npx ts-node src/index.ts \
  --target http://localhost:8080 \
  --team "$TEAM" \
  --cold-start-image "hackathon-team-$TEAM:latest" \
  --code-path ~/repos/$TEAM \
  --output ~/results/team-$TEAM.json

# Clean up
docker stop team-$TEAM && docker rm team-$TEAM
docker rmi hackathon-team-$TEAM:latest
```

### Option C: Generate leaderboard from existing results

After all teams have been tested individually, generate the leaderboard:

```bash
cd ~/hackathon/organizer/testing-client
npx ts-node src/index.ts --results-dir ~/results --leaderboard
```

## Step 6: Upload Results (Optional)

```bash
# Upload all result files to Blob Storage
for file in ~/results/*.json; do
  az storage blob upload \
    --account-name "$STORAGE_ACCOUNT" \
    --container-name results \
    --file "$file" \
    --name "$(basename $file)" \
    --overwrite
done
```

## Estimated Costs

| Resource | SKU | Cost/hour | Notes |
|---|---|---|---|
| VM (Standard_D4s_v5) | 4 vCPU, 16 GB | ~$0.19/hr | Main cost, run for 8-10 hours |
| Blob Storage | Standard LRS | ~$0.00 | Negligible for a few JSON files |
| Static Web App | Free tier | $0.00 | If leaderboard is built |
| **Total for 1 day** | | **~$2** | |

## Cleanup After Hackathon

```bash
# Delete the entire resource group (removes all resources)
az group delete --name "$RESOURCE_GROUP" --yes --no-wait
```

## Troubleshooting

### Team's Docker image won't build
```bash
# Check the Dockerfile exists
ls ~/repos/<team>/Dockerfile

# Try building manually with verbose output
docker build --no-cache -t debug-test ~/repos/<team>

# Check Docker disk space
docker system df
```

### Team's container won't start
```bash
# Check container logs
docker logs hackathon-team 2>&1 | tail -50

# Check if port 8080 is already in use
lsof -i :8080
```

### Performance numbers seem inconsistent
- Ensure no other containers are running during performance tests
- Check VM CPU usage: `htop` or `top`
- Ensure the VM size is correct: `az vm show -g $RESOURCE_GROUP -n $VM_NAME --query hardwareProfile`
- Run tests sequentially (one team at a time)
- Check the environment snapshot in each team's JSON result:
  ```bash
  for f in ~/results/team-*.json; do
    echo "=== $(basename $f) ==="
    jq '{load: .environment.load_avg_1m, free_mb: .environment.free_memory_mb}' "$f"
  done
  ```
- If one team had elevated load, re-run just that team:
  ```bash
  # Edit teams.json to include only the affected team, or use Option B above
  ```
- The `run-all-teams.sh` script automatically randomizes team order, builds with
  `--no-cache`, removes images between teams, and inserts cooldown periods.
  Check `~/results/_execution_order.txt` to verify.

### AI code review fails
- Ensure `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` environment variable is set
- Check that the team's repo was cloned successfully (look for `~/repos/<team>`)
- Verify the AI model is accessible from the VM
