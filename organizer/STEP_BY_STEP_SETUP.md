# Step-by-Step Dry Run Setup Guide

## Prerequisites Status ✅

- ✅ Azure CLI installed and authenticated
- ✅ GitHub CLI installed and authenticated  
- ✅ Repository exists: `VismaKosice/visma-labs-hackathon-2025-12`
- ⚠️ Repository needs to be marked as template (see Step 1)

---

## Step 1: Mark Repository as Template (Required)

**Action:** Go to GitHub and enable template repository

1. Open: https://github.com/VismaKosice/visma-labs-hackathon-2025-12
2. Click **Settings** (top right)
3. Scroll to **General** section
4. Scroll down to **Template repository** section
5. Check the box: **"Template repository"**
6. Click **Save**

**Verify:**
```bash
gh repo view VismaKosice/visma-labs-hackathon-2025-12 --json isTemplate -q '.isTemplate'
# Should output: true
```

---

## Step 2: Run the Automated Dry Run Script

Once the repository is marked as a template, run:

```bash
cd /Users/matus.nemcik/source/visma-labs-hackathon-2025-12
./organizer/run-dry-run.sh --github-org VismaKosice
```

**What the script will do:**
1. ✅ Check prerequisites (Azure CLI, GitHub CLI, Docker, jq)
2. ✅ Create Azure resource group: `hackathon-2025-dry-run`
3. ✅ Create Azure VM: `hackathon-runner-dry-run` (Standard_D4s_v5)
4. ✅ Set up the VM (install Docker, Node.js, configure system)
5. ✅ Create test team repository: `VismaKosice/hackathon-team-dry-run`
6. ✅ Copy your PensionCalculationEngine to the test repo
7. ✅ Push the submission
8. ✅ Clone hackathon repo on VM
9. ✅ Install testing client dependencies
10. ✅ Run full test suite

**Estimated time:** 20-30 minutes total
- Azure VM creation: ~5 minutes
- VM setup: ~5-10 minutes  
- Test execution: ~10-15 minutes

---

## Step 3: Monitor Progress

The script will output progress. Watch for:
- ✅ VM IP address (you'll need this for SSH)
- ✅ Repository creation confirmation
- ✅ Test execution progress
- ✅ Final results summary

---

## Step 4: Review Results

After the script completes:

```bash
# View results locally
cat /tmp/dry-run-results.json | jq '.'

# Or SSH to VM to see detailed results
VM_IP=$(az vm show -d -g hackathon-2025-dry-run -n hackathon-runner-dry-run --query publicIps -o tsv)
ssh hackathon@$VM_IP 'cat ~/results/team-dry-run.json | jq'
```

---

## Step 5: Cleanup (When Done)

```bash
# Delete Azure resources (saves costs)
az group delete --name hackathon-2025-dry-run --yes --no-wait

# Delete test team repository (optional)
gh repo delete VismaKosice/hackathon-team-dry-run --yes
```

---

## Troubleshooting

### If VM creation fails:
- Check Azure subscription limits
- Try a different region: `--location eastus`

### If repository creation fails:
- Verify repository is marked as template (Step 1)
- Check GitHub permissions for VismaKosice org

### If tests fail:
- SSH to VM: `ssh hackathon@$VM_IP`
- Check logs: `cat ~/results/team-dry-run.json`
- Check Docker: `docker ps -a`

### If you need to re-run:
```bash
# Skip Azure setup (reuse existing VM)
./organizer/run-dry-run.sh --github-org VismaKosice --skip-azure

# Skip repo creation (reuse existing repo)
./organizer/run-dry-run.sh --github-org VismaKosice --skip-repos
```

---

## Manual Steps (If Script Fails)

If the automated script fails, follow the detailed guide:
```bash
cat organizer/DRY_RUN_GUIDE.md
```
