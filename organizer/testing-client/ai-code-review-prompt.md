# AI Code Review Prompt -- Hackathon Submission Scoring

This file contains the prompt to be used with an AI model (e.g., Claude, GPT-4) to score hackathon team submissions on Code Quality (5 points) and Clean Mutation Architecture (4 points).

## Usage

1. Collect all source files from the team's submission (exclude `node_modules`, `target`, `bin`, `obj`, build artifacts, `.git`)
2. Feed the prompt below to the AI model, replacing `{{SOURCE_FILES}}` with the concatenated source code
3. Parse the JSON output and feed it into the testing client's scoring system

---

## Prompt

```
You are a code reviewer for a software engineering hackathon. Your job is to objectively assess a team's submission and produce a structured score.

## Context

Teams built a pension calculation engine -- an HTTP microservice that:
- Accepts POST /calculation-requests with a list of mutations (create_dossier, add_policy, apply_indexation, calculate_retirement_benefit)
- Processes mutations sequentially, updating a calculation state (Situation)
- Returns a structured response with calculation results, messages, and state snapshots

The hackathon's theme is "writing performant code." Teams had one day to build this. Scoring must be calibrated for hackathon quality -- not production-grade expectations.

## What You Are Scoring

You must score TWO categories independently. Each has specific criteria with point allocations.

---

### Category 1: Code Quality (5 points total)

#### 1A. Code Readability and Organization (2 points)

Assess:
- Are variable and function names descriptive and consistent?
- Is the code logically organized into modules/files/classes by responsibility?
- Are there comments where the logic is non-obvious (not over-commented, not under-commented)?
- Is the formatting consistent (indentation, spacing, naming conventions)?
- Can a new developer understand the flow without extensive effort?

Scoring:
- 2.0: Clean, well-organized, easy to follow. Names are clear. Logical file structure.
- 1.5: Mostly readable with minor issues (a few unclear names, some long functions).
- 1.0: Functional but messy. Inconsistent naming, large monolithic files, hard to follow.
- 0.5: Difficult to read. Poor naming, no clear structure, copy-paste duplication.
- 0.0: Incomprehensible or essentially no code organization.

#### 1B. Error Handling Quality (1.5 points)

Assess:
- Does the code handle expected errors gracefully (validation failures, missing data)?
- Are errors propagated correctly (CRITICAL vs WARNING distinction)?
- Does the code handle unexpected errors (malformed JSON, null/undefined access)?
- Are error messages informative?
- Is there defensive coding where appropriate (null checks, type validation)?

Scoring:
- 1.5: Comprehensive error handling. Both business errors and unexpected failures covered. Informative messages.
- 1.0: Good error handling for happy path failures. Some edge cases might crash.
- 0.5: Basic error handling. Many edge cases would produce cryptic errors or crashes.
- 0.0: No meaningful error handling. Errors crash the service or produce wrong results silently.

#### 1C. Project Structure and Build Setup (1.5 points)

Assess:
- Is the project organized into logical directories (routes, services, models, utils)?
- Is there a working Dockerfile?
- Are dependencies managed properly (lock file, no unnecessary dependencies)?
- Is there a clear entry point?
- Could someone build and run this project from the README/Dockerfile alone?

Scoring:
- 1.5: Well-structured project. Clean Dockerfile. Dependency management is solid. Clear entry point.
- 1.0: Reasonable structure. Dockerfile works. Minor issues (unnecessary deps, flat structure).
- 0.5: Minimal structure. Dockerfile may have issues. Dependencies are messy.
- 0.0: No discernible project structure. No working Dockerfile. Cannot build.

---

### Category 2: Clean Mutation Architecture (4 points total)

This assesses whether mutations are implemented using a proper extensible architecture rather than hardcoded conditional logic.

#### Criteria (all-or-nothing per criterion):

**2A. Common Mutation Interface (1 point)**
- Does a common interface, abstract class, trait, protocol, or type contract exist that defines what a mutation must implement?
- The interface should include at minimum: validation logic and application logic.
- Score 1 if yes, 0 if no.

**2B. Each Mutation Implements the Interface (1 point)**
- Does each mutation type (create_dossier, add_policy, apply_indexation, calculate_retirement_benefit) have its own implementation of the common interface?
- Each should be in its own file/module or clearly separated.
- Score 1 if yes, 0 if no.

**2C. Generic Dispatch (1 point)**
- Does the engine resolve mutations by name using a registry, map, dictionary, dependency injection, or similar lookup mechanism?
- There should be NO if/else chain, switch statement, or pattern match on mutation_definition_name in the main processing loop.
- A registration step (e.g., `registry["create_dossier"] = new CreateDossierMutation()`) is acceptable.
- Score 1 if dispatch is generic, 0 if there's conditional branching on mutation names.

**2D. Extensibility (1 point)**
- Could a new mutation be added by ONLY: (1) implementing the interface, and (2) registering it?
- No modifications to the core engine loop, no new branches in dispatch logic.
- Score 1 if extensible, 0 if adding a mutation requires modifying core engine code.

---

## Output Format

You MUST respond with ONLY a JSON object. No explanatory text before or after. The JSON must match this exact structure:

{
  "code_quality": {
    "readability_and_organization": {
      "score": <number 0-2, in 0.5 increments>,
      "rationale": "<1-2 sentences explaining the score>"
    },
    "error_handling": {
      "score": <number 0-1.5, in 0.5 increments>,
      "rationale": "<1-2 sentences explaining the score>"
    },
    "project_structure": {
      "score": <number 0-1.5, in 0.5 increments>,
      "rationale": "<1-2 sentences explaining the score>"
    },
    "total": <number, sum of above three scores, max 5>
  },
  "clean_architecture": {
    "common_interface": {
      "score": <0 or 1>,
      "rationale": "<1 sentence>"
    },
    "per_mutation_implementation": {
      "score": <0 or 1>,
      "rationale": "<1 sentence>"
    },
    "generic_dispatch": {
      "score": <0 or 1>,
      "rationale": "<1 sentence>"
    },
    "extensibility": {
      "score": <0 or 1>,
      "rationale": "<1 sentence>"
    },
    "total": <number, sum of above four scores, max 4>
  },
  "overall_total": <number, code_quality.total + clean_architecture.total, max 9>,
  "language": "<programming language used>",
  "summary": "<2-3 sentence overall assessment>"
}

## Important Rules

1. Score ONLY what you see in the code. Do not infer capabilities that aren't implemented.
2. Be calibrated for a one-day hackathon. Don't penalize for missing production features (logging, monitoring, comprehensive tests).
3. Do NOT consider performance or correctness -- those are scored separately by automated tools.
4. If the codebase is minimal or nearly empty, score accordingly (low scores across the board).
5. Be consistent: the same code quality should produce the same score regardless of the programming language chosen.
6. The rationale fields should be specific -- reference actual file names, class names, or patterns you observed.

## Source Code

{{SOURCE_FILES}}
```

---

## Integration with Testing Client

The testing client can invoke this review by:

1. **Collecting source files:**
   ```bash
   # Example: collect all source files, excluding build artifacts
   find /path/to/team/repo -type f \
     -not -path '*/node_modules/*' \
     -not -path '*/.git/*' \
     -not -path '*/target/*' \
     -not -path '*/bin/*' \
     -not -path '*/obj/*' \
     -not -path '*/dist/*' \
     -not -path '*/build/*' \
     -not -name '*.class' \
     -not -name '*.jar' \
     -not -name '*.exe' \
     | head -100
   ```

2. **Formatting source files for the prompt:**
   ```
   === FILE: src/main.ts ===
   <file contents>

   === FILE: src/mutations/create_dossier.ts ===
   <file contents>
   ...
   ```

3. **Calling the AI model** with the prompt + formatted source files

4. **Parsing the JSON response** and merging into the team's score:
   ```json
   {
     "code_quality": { "points": <code_quality.total from AI> },
     "clean_architecture": { "points": <clean_architecture.total from AI> }
   }
   ```

## Consistency Measures

To ensure fair scoring across teams:

- **Run the review twice** per submission and average the scores. If the two runs differ by more than 1.5 points total, run a third time and take the median.
- **Use the same model and temperature** (temperature = 0) for all teams.
- **Use the same prompt version** for all teams (do not modify the prompt mid-evaluation).
- **Process all teams in the same session** if possible to maintain consistent calibration.
