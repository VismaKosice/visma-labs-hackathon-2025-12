# Visma Performance Hackathon Materials Index

This folder contains all materials needed for the Pension Calculation Engine - Visma Performance Hackathon.

## For Teams

Everything you need is at the **root level** of this repository. You can ignore the `organizer/` folder entirely.

### Documentation

- **`README.md`** - Complete requirements, mutation details, scoring system, and performance optimization guidance
- **`QUICK_START.md`** - Quick reference guide and getting started checklist
- **`SUBMISSION.md`** - How to submit your solution (repository setup, Dockerfile)

### Technical Specifications

- **`api-spec.yaml`** - OpenAPI 3.0.0 specification for the `/calculation-requests` endpoint
- **`data-model.md`** - Visual data model showing entity relationships and data structures

### Mutation Definitions (Reference Examples)

The `mutation-definitions/` folder contains reference JSON schema examples for each mutation. These illustrate the structure and properties of each mutation.

#### Core Mutations
1. **`create_dossier.json`** - Creates a new pension participant dossier
2. **`add_policy.json`** - Adds a pension policy to an existing dossier
3. **`apply_indexation.json`** - Applies percentage salary adjustment to matching policies
4. **`calculate_retirement_benefit.json`** - Calculates retirement benefits

#### Bonus Mutations
5. **`project_future_benefits.json`** - Projects pension benefits at future dates (bonus feature)

### Reference Implementation

- **`PensionCalculationEngine/`** - A reference .NET implementation to help you understand the expected behavior. You are free to use any technology stack.

---

## For Organizers

All organizer-only materials are in the **`organizer/`** folder.

### Guides

- **`organizer/DRY_RUN_GUIDE.md`** - Manual dry run walkthrough (Azure, GitHub template, VM, tests)
- **`organizer/STEP_BY_STEP_SETUP.md`** - Automated dry run using `run-dry-run.sh`
- **`organizer/TESTING_GUIDE.md`** - VM sizing, full tests, multi-team testing tips

### Scripts

- **`organizer/run-dry-run.sh`** - One-click dry run (Azure + VM + team repo + tests)
- **`organizer/prepare-submission.sh`** - Copies PensionCalculationEngine to a team repo for testing
- **`organizer/verify-submission.sh`** - Validates submission has correct layout (Dockerfile, port 8080, etc.)

### Infrastructure

- **`organizer/infrastructure/README.md`** - Azure deployment guide and test runner setup
- **`organizer/infrastructure/CHECKLIST.md`** - Step-by-step organizer checklist (before, during, after hackathon)
- **`organizer/infrastructure/DECISION_LOG.md`** - Design decisions and rationale
- **`organizer/infrastructure/setup-vm.sh`** - Automated VM setup script (Docker, Node.js, tools)
- **`organizer/infrastructure/run-all-teams.sh`** - Test orchestrator that runs all teams sequentially
- **`organizer/infrastructure/create-team-repos.sh`** - Creates team repositories from the template
- **`organizer/infrastructure/create-team-branches.sh`** - Creates team branches
- **`organizer/infrastructure/teams.json`** - Team name to repository URL mapping
- **`organizer/infrastructure/teams-multiple-example.json`** - Example config with multiple teams

### Testing Client

- **`organizer/testing-client/`** - TypeScript test runner for correctness, performance, and bonus scoring
- **`organizer/testing-client/PRD.md`** - Product requirements for the testing client
- **`organizer/testing-client/ai-code-review-prompt.md`** - AI prompt for automated code quality scoring

---

## File Structure

```
hackathon/
├── README.md                          # Main requirements document
├── QUICK_START.md                     # Quick reference guide
├── SUBMISSION.md                      # Submission instructions for teams
├── INDEX.md                           # This file
├── api-spec.yaml                      # OpenAPI API specification
├── data-model.md                      # Data model documentation
├── mutation-definitions/              # Mutation JSON schemas
│   ├── create_dossier.json
│   ├── add_policy.json
│   ├── apply_indexation.json
│   ├── calculate_retirement_benefit.json
│   └── project_future_benefits.json
├── PensionCalculationEngine/          # Reference .NET implementation
│   ├── Controllers/
│   ├── Models/
│   ├── Services/
│   ├── Dockerfile
│   └── ...
├── .github/workflows/build-team.yml   # CI pipeline
└── organizer/                         # ⛔ Organizer-only (teams can ignore)
    ├── DRY_RUN_GUIDE.md
    ├── STEP_BY_STEP_SETUP.md
    ├── TESTING_GUIDE.md
    ├── run-dry-run.sh
    ├── prepare-submission.sh
    ├── verify-submission.sh
    ├── infrastructure/
    │   ├── CHECKLIST.md
    │   ├── DECISION_LOG.md
    │   ├── README.md
    │   ├── setup-vm.sh
    │   ├── run-all-teams.sh
    │   ├── create-team-repos.sh
    │   ├── create-team-branches.sh
    │   ├── teams.json
    │   └── teams-multiple-example.json
    └── testing-client/
        ├── src/
        ├── fixtures/
        ├── scripts/
        └── package.json
```

## Getting Started (Teams)

1. Read **`SUBMISSION.md`** for how to clone and submit
2. Start with **`README.md`** for complete requirements and scoring
3. Review **`api-spec.yaml`** for API contract
4. Understand the data model in **`data-model.md`**
5. Review mutation definitions in **`mutation-definitions/`**
6. Use **`QUICK_START.md`** as a quick reference during development

## Important Notes

- **Testing framework** will be provided by organizers
- Focus on **correctness first, then performance** -- this is how the scoring works
- All code must be **Docker-deployable**
- Scoring: 40 pts correctness + 40 pts performance + 30 pts bonus + 5 pts code quality = **115 total**

---

**Good luck building your high-performance calculation engine!**
