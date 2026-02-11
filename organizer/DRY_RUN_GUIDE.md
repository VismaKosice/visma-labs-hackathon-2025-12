# Hackathon Day Dry Run - Complete Guide

This guide walks you through a complete dry run of the hackathon day, including Azure setup, repository creation, and testing.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] Azure CLI installed (`az`) and authenticated (`az login`)
- [ ] GitHub CLI installed (`gh`) and authenticated (`gh auth login`)
- [ ] SSH access configured (SSH keys generated)
- [ ] This repository pushed to GitHub (or a GitHub org where you can create repos)
- [ ] AI API key (optional, for code review): `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

## Step 1: Configure GitHub Organization

First, decide on your GitHub organization/username. Replace `<GITHUB_ORG>` in:

1. `organizer/infrastructure/teams.json`
2. `organizer/infrastructure/setup-vm.sh` (line 169)
3. `organizer/infrastructure/README.md` (if you want to update it)

**Example:** If your GitHub username is `matus-nemcik`, replace `<GITHUB_ORG>` with `matus-nemcik`.

Let's do this now:

```bash
# Set your GitHub org/username
export GITHUB_ORG="your-github-org-or-username"

# Update teams.json (we'll do this in the script)
```

## Step 2: Make This Repository a GitHub Template

1. Push this repository to GitHub (if not already):
   ```bash
   git remote -v  # Check if remote exists
   # If not, add it:
   # git remote add origin https://github.com/$GITHUB_ORG/hackathon-2025.git
   # git push -u origin main
   ```

2. On GitHub, go to: **Settings > General > Template repository**
3. Check the box: **"Template repository"**
4. Save

## Step 3: Create Azure Resources

### 3.1 Create Resource Group

```bash
RESOURCE_GROUP="hackathon-2025"
LOCATION="westeurope"  # or choose: eastus, westeurope, etc.

az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
```

### 3.2 Create Test Runner VM

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

# Open port 80 (optional, for leaderboard)
az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port 80 \
  --priority 1010
```

**Note the VM's public IP** from the output. Save it:
```bash
VM_IP=$(az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --query publicIps -o tsv)
echo "VM IP: $VM_IP"
```

### 3.3 (Optional) Create Blob Storage for Results

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

## Step 4: Set Up the VM

### 4.1 Copy Setup Script to VM

```bash
# Get VM IP if you didn't save it
VM_IP=$(az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --query publicIps -o tsv)

# Copy setup script
scp organizer/infrastructure/setup-vm.sh hackathon@$VM_IP:~/
```

### 4.2 Run Setup Script

**Option A: SSH and run manually**
```bash
ssh hackathon@$VM_IP
chmod +x ~/setup-vm.sh
~/setup-vm.sh
# Log out and back in for Docker group access
exit
ssh hackathon@$VM_IP
```

**Option B: Run remotely**
```bash
az vm run-command invoke \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --command-id RunShellScript \
  --scripts @organizer/infrastructure/setup-vm.sh
```

## Step 5: Create Test Team Repositories

### 5.1 Update GitHub Org in Scripts

First, update the placeholders. You can do this manually or use sed:

```bash
export GITHUB_ORG="your-github-org-or-username"

# Update setup-vm.sh
sed -i.bak "s/<GITHUB_ORG>/$GITHUB_ORG/g" organizer/infrastructure/setup-vm.sh

# Update teams.json (we'll recreate it, but you can update manually too)
```

### 5.2 Create Team Repos

For a dry run, create a single test team:

```bash
cd /Users/matus.nemcik/source/visma-labs-hackathon-2025-12

./organizer/infrastructure/create-team-repos.sh \
  --template "$GITHUB_ORG/hackathon-2025" \
  --org "$GITHUB_ORG" \
  --teams "dry-run"
```

This creates: `$GITHUB_ORG/hackathon-team-dry-run`

Verify `organizer/infrastructure/teams.json` was updated:
```bash
cat organizer/infrastructure/teams.json
```

## Step 6: Prepare Test Submission

### 6.1 Clone the Test Team Repo Locally

```bash
cd ~/tmp  # or wherever you want
git clone https://github.com/$GITHUB_ORG/hackathon-team-dry-run.git
cd hackathon-team-dry-run
```

### 6.2 Copy Your PensionCalculationEngine

```bash
# From the hackathon root directory
cd /Users/matus.nemcik/source/visma-labs-hackathon-2025-12

# Use the prepare-submission script
./prepare-submission.sh ~/tmp/hackathon-team-dry-run
```

### 6.3 Verify and Push

```bash
cd ~/tmp/hackathon-team-dry-run

# Verify Dockerfile is in root
ls -la Dockerfile

# Test build locally (optional but recommended)
docker build -t test-engine .
docker run -d -p 8080:8080 test-engine
# Test it works
curl -X POST http://localhost:8080/calculation-requests \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"test","calculation_instructions":{"mutations":[]}}'
docker stop $(docker ps -q --filter ancestor=test-engine)

# Commit and push
git add .
git commit -m "Dry run submission"
git push origin main
```

## Step 7: Set Up Testing Client on VM

### 7.1 Clone Repository on VM

```bash
ssh hackathon@$VM_IP

# Update the clone command with your actual GitHub org
git clone https://github.com/$GITHUB_ORG/hackathon-2025.git ~/hackathon
```

### 7.2 Copy Updated teams.json

```bash
# From your local machine
scp organizer/infrastructure/teams.json hackathon@$VM_IP:~/hackathon/organizer/infrastructure/
```

### 7.3 Install Testing Client Dependencies

```bash
ssh hackathon@$VM_IP
cd ~/hackathon/testing-client
npm install
```

### 7.4 Set AI Review API Key (Optional)

```bash
ssh hackathon@$VM_IP
export ANTHROPIC_API_KEY='your-key-here'
# or
export OPENAI_API_KEY='your-key-here'

# Add to ~/.bashrc to persist:
echo 'export ANTHROPIC_API_KEY="your-key-here"' >> ~/.bashrc
```

## Step 8: Run the Full Test Suite

### 8.1 Prepare VM for Testing

```bash
ssh hackathon@$VM_IP

# Kill any running containers
docker kill $(docker ps -q) 2>/dev/null || true
docker system prune -af --volumes 2>/dev/null || true

# Check system load (should be low)
cat /proc/loadavg
free -h
```

### 8.2 Run Tests

```bash
cd ~/hackathon
./organizer/infrastructure/run-all-teams.sh --output-dir ~/results
```

This will:
1. Clone the dry-run team repo
2. Build Docker image
3. Run correctness tests
4. Run performance tests
5. Run cold start test
6. Run AI code review
7. Generate results JSON

### 8.3 Check Results

```bash
# View results
ls -lh ~/results/
cat ~/results/team-dry-run.json | jq '.'

# Check execution order
cat ~/results/_execution_order.txt

# View leaderboard (if multiple teams)
cat ~/results/leaderboard.json | jq '.'
```

## Step 9: Verify Everything Works

### 9.1 Check Docker Build
```bash
ssh hackathon@$VM_IP
cd ~/repos/dry-run
docker build --no-cache -t test-build .
docker run -d --name test-container -p 8080:8080 test-build
sleep 3
curl -X POST http://localhost:8080/calculation-requests \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"test","calculation_instructions":{"mutations":[]}}'
docker stop test-container && docker rm test-container
```

### 9.2 Check Test Results Structure

```bash
ssh hackathon@$VM_IP
cat ~/results/team-dry-run.json | jq 'keys'
# Should show: correctness, performance, cold_start, code_quality, environment, etc.
```

## Step 10: Cleanup (After Testing)

### 10.1 Clean Up Azure Resources

```bash
# Delete the entire resource group (removes VM, storage, etc.)
az group delete --name "$RESOURCE_GROUP" --yes --no-wait
```

### 10.2 Clean Up GitHub Repos (Optional)

```bash
# Delete the test team repo
gh repo delete $GITHUB_ORG/hackathon-team-dry-run --yes
```

## Troubleshooting

### VM Connection Issues
```bash
# Check VM status
az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --query "powerState"

# Restart VM if needed
az vm restart --resource-group "$RESOURCE_GROUP" --name "$VM_NAME"
```

### Docker Permission Issues on VM
```bash
# If Docker commands fail, you may need to re-login
ssh hackathon@$VM_IP
sudo usermod -aG docker $USER
# Then log out and back in
```

### GitHub Repo Creation Fails
```bash
# Verify gh CLI is authenticated
gh auth status

# Check if template repo is marked as template
gh repo view $GITHUB_ORG/hackathon-2025 --json isTemplate
```

### Test Execution Fails
```bash
# Check Docker build logs
ssh hackathon@$VM_IP
cd ~/repos/dry-run
docker build --no-cache -t debug . 2>&1 | tee build.log

# Check container logs
docker logs <container-id>

# Check system resources
htop
free -h
df -h
```

## Next Steps for Real Hackathon

Once the dry run is successful:

1. **Create real team repos** with actual team names
2. **Update teams.json** with all team repos
3. **Share repo URLs** with teams
4. **Set up VM** a day before (or morning of)
5. **Run final scoring** after code freeze

## Estimated Costs

- **VM (Standard_D4s_v5)**: ~$0.19/hour
- **Blob Storage**: Negligible (~$0.00)
- **Total for 1 day dry run**: ~$2-5

Remember to delete resources when done!
