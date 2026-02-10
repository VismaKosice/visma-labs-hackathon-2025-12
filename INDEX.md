# Visma Performance Hackathon Materials Index

This folder contains all materials needed for the Pension Calculation Engine - Visma Performance Hackathon.

## Documentation Files

### Main Requirements
- **`README.md`** - Complete requirements, mutation details, scoring system, and performance optimization guidance
- **`QUICK_START.md`** - Quick reference guide and getting started checklist
- **`SUBMISSION.md`** - How to submit your solution (repository setup, Dockerfile)

### Technical Specifications
- **`api-spec.yaml`** - OpenAPI 3.0.0 specification for the `/calculation-requests` endpoint
- **`data-model.md`** - Visual data model showing entity relationships and data structures

## Mutation Definitions (Reference Examples)

The `mutation-definitions/` folder contains reference JSON schema examples for each mutation. These illustrate the structure and properties of each mutation.

### Core Mutations
1. **`create_dossier.json`** - Creates a new pension participant dossier
2. **`add_policy.json`** - Adds a pension policy to an existing dossier
3. **`apply_indexation.json`** - Applies percentage salary adjustment to matching policies
4. **`calculate_retirement_benefit.json`** - Calculates retirement benefits

### Bonus Mutations
5. **`project_future_benefits.json`** - Projects pension benefits at future dates (bonus feature)

## Testing Client

- **`testing-client/PRD.md`** - Product requirements document for the testing client application (used by organizers to validate team submissions)
- **`testing-client/ai-code-review-prompt.md`** - AI prompt for automated code quality and architecture scoring

## Infrastructure (Organizer-Only)

- **`infrastructure/DECISION_LOG.md`** - Complete decision log documenting all design decisions and rationale
- **`infrastructure/CHECKLIST.md`** - Step-by-step organizer checklist (before, during, after the hackathon)
- **`infrastructure/README.md`** - Azure deployment guide and test runner setup
- **`infrastructure/setup-vm.sh`** - Automated VM setup script (Docker, Node.js, tools)
- **`infrastructure/run-all-teams.sh`** - Test orchestrator that runs all teams sequentially
- **`infrastructure/create-team-repos.sh`** - Creates team repositories from the template before the hackathon
- **`infrastructure/teams.json`** - Team name to repository URL mapping (config file for test runner)

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
├── testing-client/                    # Testing client (organizer tool)
│   ├── PRD.md                         # Requirements for the testing client
│   └── ai-code-review-prompt.md       # AI prompt for code quality scoring
└── infrastructure/                    # Deployment & orchestration (organizer)
    ├── DECISION_LOG.md                # Design decisions & rationale journal
    ├── CHECKLIST.md                   # Organizer step-by-step checklist
    ├── README.md                      # Azure deployment guide
    ├── setup-vm.sh                    # VM setup script
    ├── run-all-teams.sh               # Test orchestrator
    ├── create-team-repos.sh           # Team repo creation script
    └── teams.json                     # Team name → repo URL mapping
```

## Getting Started

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
