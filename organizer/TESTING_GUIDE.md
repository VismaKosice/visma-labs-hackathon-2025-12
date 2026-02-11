# Testing Guide - Multiple Submissions & Full Tests

## 1. VM Size Configuration

The `organizer/run-dry-run.sh` script now supports `--vm-size` parameter:

**Dry Run (default - smaller, cheaper):**
```bash
./organizer/run-dry-run.sh \
  --subscription-id <id> \
  --github-org VismaKosice \
  --vm-size Standard_D2s_v5
```

**Production-like (larger, matches real hackathon):**
```bash
./organizer/run-dry-run.sh \
  --subscription-id <id> \
  --github-org VismaKosice \
  --vm-size Standard_D4s_v5
```

## 2. Running Full Tests

You can run the full test suite anytime on the existing VM:

```bash
VM_IP=$(az vm show -d -g hackathon-2025-dry-run -n hackathon-runner-dry-run \
  --subscription 118b4d48-2c79-4edc-aa93-53e73c9a4626 --query publicIps -o tsv)

ssh hackathon@$VM_IP "cd ~/hackathon && ./organizer/infrastructure/run-all-teams.sh \
  --output-dir ~/results \
  --docker-cpus 1.5 \
  --docker-memory 6g"
```

Or with all features enabled (including AI review if you set the API key):

```bash
ssh hackathon@$VM_IP "cd ~/hackathon && ./organizer/infrastructure/run-all-teams.sh \
  --output-dir ~/results \
  --docker-cpus 1.5 \
  --docker-memory 6g \
  --skip-ai-review false"
```

## 3. Testing Same Repository as Multiple Submissions

You can test the same repository as multiple "teams" by:

### Option A: Multiple Team Entries (Same Repo, Different Names)

Edit `organizer/infrastructure/teams.json`:

```json
[
  {
    "name": "dry-run-v1",
    "repo_url": "https://github.com/VismaKosice/hackathon-team-dry-run.git"
  },
  {
    "name": "dry-run-v2",
    "repo_url": "https://github.com/VismaKosice/hackathon-team-dry-run.git"
  }
]
```

Then run tests:
```bash
ssh hackathon@$VM_IP "cd ~/hackathon && ./organizer/infrastructure/run-all-teams.sh --output-dir ~/results"
```

This will test the same repo twice, giving you two separate result files:
- `~/results/team-dry-run-v1.json`
- `~/results/team-dry-run-v2.json`

### Option B: Different Branches/Tags

Create branches or tags for different versions:

```bash
# In your submission repo
git checkout -b submission-v1
git push origin submission-v1

git checkout -b submission-v2
# Make changes
git push origin submission-v2
```

Then update `teams.json`:
```json
[
  {
    "name": "submission-v1",
    "repo_url": "https://github.com/VismaKosice/hackathon-team-dry-run.git",
    "branch": "submission-v1"
  },
  {
    "name": "submission-v2",
    "repo_url": "https://github.com/VismaKosice/hackathon-team-dry-run.git",
    "branch": "submission-v2"
  }
]
```

**Note:** The `run-all-teams.sh` script currently clones the default branch. To support branches, you'd need to modify it or manually clone different branches.

### Option C: Manual Clone with Different Names

SSH to the VM and manually clone the repo with different names:

```bash
ssh hackathon@$VM_IP

# Clone same repo as different "teams"
cd ~/repos
git clone https://github.com/VismaKosice/hackathon-team-dry-run.git team-alpha
git clone https://github.com/VismaKosice/hackathon-team-dry-run.git team-beta

# Then run tests manually for each
cd ~/hackathon/organizer/testing-client
npx ts-node src/index.ts --target http://localhost:8080 --team alpha --code-path ~/repos/team-alpha --output ~/results/team-alpha.json
```

## Quick Reference

### Check Current Results
```bash
VM_IP=$(az vm show -d -g hackathon-2025-dry-run -n hackathon-runner-dry-run \
  --subscription 118b4d48-2c79-4edc-aa93-53e73c9a4626 --query publicIps -o tsv)

ssh hackathon@$VM_IP "ls -lh ~/results/"
ssh hackathon@$VM_IP "cat ~/results/team-dry-run.json | jq '.total'"
```

### View Leaderboard (if multiple teams)
```bash
ssh hackathon@$VM_IP "cd ~/hackathon/organizer/testing-client && \
  npx ts-node src/index.ts --results-dir ~/results --leaderboard"
```

### Clean Up and Re-run
```bash
ssh hackathon@$VM_IP "cd ~/hackathon && \
  docker kill \$(docker ps -q) 2>/dev/null || true; \
  docker system prune -af --volumes 2>/dev/null || true; \
  rm -rf ~/results/*.json ~/repos/*; \
  ./organizer/infrastructure/run-all-teams.sh --output-dir ~/results"
```
