# Organizer Materials

This folder contains all **organizer-only** materials for the Visma Performance Hackathon. Teams can safely ignore this entire folder.

## Contents

| Path | Description |
|------|-------------|
| `DRY_RUN_GUIDE.md` | Complete manual dry run walkthrough |
| `STEP_BY_STEP_SETUP.md` | Automated dry run using `run-dry-run.sh` |
| `TESTING_GUIDE.md` | VM sizing, full tests, multi-team testing tips |
| `run-dry-run.sh` | One-click automated dry run script |
| `prepare-submission.sh` | Copies reference implementation to a team repo |
| `verify-submission.sh` | Validates a submission has correct layout |
| `infrastructure/` | Azure deployment, VM setup, team repo creation, test orchestration |
| `testing-client/` | TypeScript test runner for scoring submissions |

## Quick Start (Organizers)

```bash
# From the repository root:
./organizer/run-dry-run.sh --subscription-id <azure-sub-id> --github-org <your-org>
```

See `STEP_BY_STEP_SETUP.md` for a detailed walkthrough.
