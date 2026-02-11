# Quick Start Guide

## Files Overview

- **`README.md`** - Complete requirements, mutation details, scoring system, and performance guidance
- **`api-spec.yaml`** - OpenAPI 3.0.0 specification for the API endpoint
- **`data-model.md`** - Visual data model and entity relationships
- **`mutation-definitions/`** - Reference JSON schema examples for each mutation
  - `create_dossier.json`
  - `add_policy.json`
  - `apply_indexation.json`
  - `calculate_retirement_benefit.json`
  - `project_future_benefits.json` (bonus)

## Getting Started Checklist

1. Read `README.md` for complete requirements
2. Review `api-spec.yaml` for API contract
3. Understand data model in `data-model.md`
4. Review mutation definitions in `mutation-definitions/`
5. Set up development environment
6. Implement core requirements (get it correct first)
7. Optimize for performance
8. Attempt bonus features if time permits
9. Submit solution

## Core vs Bonus

### Core (must have)
- HTTP endpoint `POST /calculation-requests`
- 4 mutations: `create_dossier`, `add_policy`, `apply_indexation`, `calculate_retirement_benefit`
- Correct response format (metadata, messages, mutations list, end_situation, initial_situation)
- Error handling (CRITICAL halts, WARNING continues)
- Docker deployment on port 8080

### Bonus (extra points)
- Forward JSON Patch (7 pts)
- Backward JSON Patch (4 pts)
- Clean mutation architecture (4 pts)
- Cold start performance (5 pts)
- External Scheme Registry integration (5 pts)
- `project_future_benefits` bonus mutation (5 pts)

## Key Points to Remember

### Mutations Are Processed Sequentially
- Mutations are pre-sorted by the caller
- Engine processes them in array order
- Each mutation modifies the calculation state
- Order matters for correct calculations

### Policy ID Generation
- `policy_id` is auto-generated: `{dossier_id}-{sequence_number}`
- First policy: `{dossier_id}-1`
- Second policy: `{dossier_id}-2`
- Sequence based on order in mutations array

### IDs Are Client-Provided
- `dossier_id` and `person_id` are provided by the caller in `create_dossier`
- Both use UUID v4 format

### `apply_indexation` Filters
- `scheme_id` filter: only policies with matching scheme
- `effective_before` filter: only policies with `employment_start_date` before this date
- Both filters combined with AND logic
- No filters = apply to all policies
- Formula: `new_salary = salary * (1 + percentage)`

### `calculate_retirement_benefit` Formula
- Eligibility: age >= 65 OR total years of service >= 40
- Effective salary: `salary * part_time_factor`
- Weighted average: `sum(effective_salary * years) / sum(years)`
- Annual pension: `weighted_avg * total_years * accrual_rate` (default `0.02`, or from Scheme Registry if bonus is implemented)
- Distribution: proportional by years of service per policy

### Scoring (115 points total)
- Correctness: 40 pts (automated tests, pass/fail)
- Performance: 40 pts (relative to other teams, only on correct tests)
- Bonus: 30 pts (JSON Patch, architecture, cold start, scheme registry, bonus mutation)
- Code quality: 5 pts (AI code review)

## Common Pitfalls

1. **Not processing mutations sequentially** - Order matters!
2. **Incorrect policy_id generation** - Must follow `{dossier_id}-{sequence_number}` format
3. **Missing validation** - Validate all business rules, return correct CRITICAL/WARNING levels
4. **Ignoring part-time factor** - Use `salary * part_time_factor` for effective salary
5. **Ignoring indexation filters** - `apply_indexation` must respect `scheme_id` and `effective_before` when provided
6. **Incorrect retirement calculation** - Follow the formula exactly
7. **Not handling CRITICAL errors** - CRITICAL must halt processing immediately

## Submission

See `SUBMISSION.md` for how to submit your solution:
- Your team has its own repository
- Dockerfile in the repo root
- Push to `main` and test your Docker build locally

## Questions?

Refer to:
- `README.md` for detailed requirements and scoring
- `SUBMISSION.md` for submission instructions
- `api-spec.yaml` for API contract details
- `data-model.md` for data structure clarifications

Good luck!
