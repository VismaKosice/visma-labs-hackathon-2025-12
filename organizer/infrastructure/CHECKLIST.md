# Organizer Pre-Hackathon Checklist

A step-by-step checklist for preparing and running the Visma Performance Hackathon.

---

## 2+ Weeks Before

- [ ] **Finalize team list** -- collect team names (lowercase, no spaces, e.g., `alpha`, `beta`, `gamma`)
- [ ] **Create the template repository** from this codebase on GitHub
  - [ ] Push this repo to GitHub (if not already)
  - [ ] Enable "Template repository" in Settings > General
- [ ] **Replace placeholders** in team-facing docs:
  - [ ] `organizer/infrastructure/README.md`: replace `<GITHUB_ORG>` with actual value
  - [ ] `organizer/infrastructure/setup-vm.sh`: replace `<GITHUB_ORG>` with actual value
  - [ ] `organizer/infrastructure/teams.json`: replace `<GITHUB_ORG>` with actual value
- [ ] **Create team repositories** from the template:
  ```bash
  ./organizer/infrastructure/create-team-repos.sh \
    --template "<GITHUB_ORG>/hackathon-2025" \
    --org "<GITHUB_ORG>" \
    --teams "alpha,beta,gamma,delta"
  ```
  - [ ] Verify `organizer/infrastructure/teams.json` was updated with repo URLs
  - [ ] Give each team push access to their repository
- [ ] **Commit updated `teams.json`** to the template repo

---

## 1 Week Before

- [ ] **Build the testing client** from `organizer/testing-client/PRD.md`
  - [ ] All 10 correctness test fixtures created
  - [ ] Performance test scenarios defined
  - [ ] Bonus test scenarios (JSON Patch, project_future_benefits, Scheme Registry)
  - [ ] Scheme Registry mock service implemented
  - [ ] AI code review integration working
  - [ ] Cold start test working with Docker
  - [ ] Leaderboard aggregation mode working
- [ ] **Set up Azure VM** (see `organizer/infrastructure/README.md`):
  ```bash
  # Create resource group + VM
  az group create --name hackathon-2025 --location westeurope
  az vm create --resource-group hackathon-2025 --name hackathon-runner \
    --image Ubuntu2204 --size Standard_D4s_v5 \
    --admin-username hackathon --generate-ssh-keys
  ```
  - [ ] SSH into VM and run setup script:
    ```bash
    scp organizer/infrastructure/setup-vm.sh hackathon@<VM_IP>:~/
    ssh hackathon@<VM_IP> 'chmod +x ~/setup-vm.sh && ~/setup-vm.sh'
    ```
  - [ ] Clone hackathon repo to `~/hackathon`
  - [ ] Copy `teams.json` to VM: `scp organizer/infrastructure/teams.json hackathon@<VM_IP>:~/hackathon/infrastructure/`
  - [ ] Install testing client dependencies: `cd ~/hackathon/testing-client && npm install`
  - [ ] Set AI review API key: `export ANTHROPIC_API_KEY=...`

---

## 1-2 Days Before

- [ ] **Dry run** -- full end-to-end test with a dummy submission:
  - [ ] Create a `dry-run` team repo from the template with a simple working Dockerfile
  - [ ] Add it to `teams.json`
  - [ ] On the Azure VM, run the full test suite:
    ```bash
    cd ~/hackathon
    ./organizer/infrastructure/run-all-teams.sh --output-dir ~/results
    ```
  - [ ] Verify the Docker image builds successfully on the VM
  - [ ] Verify correctness tests pass/fail as expected
  - [ ] Verify performance metrics are collected
  - [ ] Verify AI code review produces scores
  - [ ] Verify cold start test works
  - [ ] Verify JSON output file is generated correctly
  - [ ] Verify environment snapshot is present in JSON: `jq '.environment' ~/results/team-dry-run.json`
  - [ ] Verify system load was acceptable during run
  - [ ] Run same team twice and check that scores are within ~5% for perf metrics
  - [ ] Clean up: remove dry-run entry from `teams.json`, delete results
- [ ] **Prepare team credentials** -- each team needs:
  - [ ] GitHub account with push access to their team repository
  - [ ] Their repository URL
- [ ] **Share documentation** -- send teams a link to their repo (which contains all docs):
  - `README.md` (requirements)
  - `SUBMISSION.md` (how to submit)
  - `QUICK_START.md` (quick reference)
  - `api-spec.yaml` (API contract)
- [ ] **Recommend teams test locally** before pushing:
  ```
  docker build -t my-engine .
  docker run -p 8080:8080 my-engine
  curl -X POST http://localhost:8080/calculation-requests -H "Content-Type: application/json" -d '...'
  ```

---

## Hackathon Day -- Morning (Setup)

- [ ] **Verify Azure VM is running:**
  ```bash
  VM_IP=$(az vm show -d -g hackathon-2025 -n hackathon-runner --query publicIps -o tsv)
  ssh hackathon@$VM_IP 'docker info > /dev/null 2>&1 && echo "Docker OK" || echo "Docker FAIL"'
  ```
- [ ] **Confirm all team repos are accessible** from the VM:
  ```bash
  ssh hackathon@$VM_IP
  cd ~/hackathon
  # The run script verifies access at startup, but you can also check manually:
  jq -r '.[].repo_url' organizer/infrastructure/teams.json | while read url; do
    git ls-remote --heads "$url" > /dev/null 2>&1 && echo "OK: $url" || echo "FAIL: $url"
  done
  ```
- [ ] **Kick off** -- share each team's repo URL and point them to `SUBMISSION.md`
- [ ] **Help teams** with Dockerfile issues, API contract questions, etc.

---

## Hackathon Day -- During

- [ ] **Periodically check team progress:**
  ```bash
  # Check latest commit in each team repo
  jq -r '.[] | "\(.name) \(.repo_url)"' organizer/infrastructure/teams.json | while read name url; do
    echo "$name -- $(git ls-remote --heads "$url" | grep main | cut -f1 | head -c 7)"
  done
  ```
- [ ] **Optional: run interim scoring** to show progress on leaderboard (correctness + performance, skipping cold start and AI review):
  ```bash
  ssh hackathon@$VM_IP
  cd ~/hackathon
  ./organizer/infrastructure/run-all-teams.sh \
    --skip-cold-start \
    --skip-ai-review \
    --output-dir ~/results-interim
  ```
- [ ] **Help teams** with Docker issues, API contract questions, etc.

---

## Hackathon Day -- End (Final Scoring)

- [ ] **Announce code freeze** -- teams stop pushing
- [ ] **Prepare VM for fair final scoring** (CRITICAL):
  ```bash
  ssh hackathon@$VM_IP

  # 1. Kill any running containers and prune everything
  docker kill $(docker ps -q) 2>/dev/null || true
  docker system prune -af --volumes 2>/dev/null || true

  # 2. Verify no other user sessions are active
  who

  # 3. Check system load is low (should be < 0.5)
  cat /proc/loadavg

  # 4. Check free memory (should be > 12 GB free on 16 GB VM)
  free -h

  # 5. Verify no swap is being used
  swapon --show
  ```
- [ ] **Run full test suite** for all teams (team order is randomized automatically):
  ```bash
  cd ~/hackathon
  ./organizer/infrastructure/run-all-teams.sh --output-dir ~/results-final
  ```
  The script will automatically:
  - Read team repos from `teams.json`
  - Clone each team's repo and build the Docker image locally (`--no-cache`)
  - Randomize team order
  - Apply Docker CPU/memory limits
  - Remove Docker images and prune between teams
  - Insert cooldown periods between teams
  - Check system load before each team
  - Record execution order to `_execution_order.txt`
  - Generate the leaderboard at the end
- [ ] **Review fairness indicators:**
  ```bash
  # Check execution order
  cat ~/results-final/_execution_order.txt

  # Compare environment snapshots across teams
  for f in ~/results-final/team-*.json; do
    echo "=== $(basename $f) ==="
    jq '.environment.load_avg_1m, .environment.free_memory_mb' "$f"
  done

  # Look for outlier load averages — if one team had load > 2x others,
  # consider re-running that team
  ```
- [ ] **Sanity check scores** -- look for anomalies:
  - Any team with wildly different perf numbers on re-run?
  - Any team where environment load was elevated?
  - AI code review spread > 2 points?
- [ ] **Optional: re-run specific teams** if fairness concerns arise:
  - Edit `teams.json` to include only the teams to re-run
  - Or use the manual single-team approach (see `organizer/infrastructure/README.md`, Option B)
- [ ] **Announce winners**

---

## After the Hackathon

- [ ] **Share results** -- give teams access to their individual result JSON
- [ ] **Collect feedback** -- what worked, what didn't, what to improve
- [ ] **Clean up Azure resources:**
  ```bash
  az group delete --name hackathon-2025 --yes --no-wait
  ```
- [ ] **Archive the repos** -- optionally make team repos read-only or archive them in GitHub settings
