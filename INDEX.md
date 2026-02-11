# Visma Performance Hackathon Materials Index

This repository contains all materials needed for the Pension Calculation Engine - Visma Performance Hackathon.

## Documentation

- **`README.md`** - Complete requirements, mutation details, scoring system, and performance optimization guidance
- **`QUICK_START.md`** - Quick reference guide and getting started checklist
- **`SUBMISSION.md`** - How to submit your solution (repository setup, Dockerfile)

## Technical Specifications

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

## Reference Implementation

- **`PensionCalculationEngine/`** - A reference .NET implementation to help you understand the expected behavior. You are free to use any technology stack.

## File Structure

```
├── README.md                          # Main requirements document
├── QUICK_START.md                     # Quick reference guide
├── SUBMISSION.md                      # Submission instructions
├── INDEX.md                           # This file
├── api-spec.yaml                      # OpenAPI API specification
├── data-model.md                      # Data model documentation
├── mutation-definitions/              # Mutation JSON schemas
│   ├── create_dossier.json
│   ├── add_policy.json
│   ├── apply_indexation.json
│   ├── calculate_retirement_benefit.json
│   └── project_future_benefits.json
└── PensionCalculationEngine/          # Reference .NET implementation
    ├── Controllers/
    ├── Models/
    ├── Services/
    ├── Dockerfile
    └── ...
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
