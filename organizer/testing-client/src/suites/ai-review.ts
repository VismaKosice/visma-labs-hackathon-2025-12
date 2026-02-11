/**
 * AI Code Review integration.
 * Uses an AI model to score Code Quality (5 pts) and Clean Architecture (4 pts).
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Config } from '../config';
import { CodeQualityResults } from '../types/results';
import { CleanArchitectureResult } from '../types/results';

// File extensions to include in the review
const INCLUDE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.java', '.kt', '.kts',
  '.go',
  '.rs',
  '.cs',
  '.py',
  '.rb',
  '.c', '.cpp', '.cc', '.h', '.hpp',
  '.zig',
  '.scala',
  '.clj', '.cljs',
  '.ex', '.exs',
  '.fs', '.fsx',
  '.swift',
  '.yaml', '.yml',
  '.json',
  '.toml',
  '.xml',
  '.dockerfile',
]);

// Directories to exclude
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'target', 'bin', 'obj', 'dist', 'build',
  '.idea', '.vscode', '__pycache__', '.gradle', '.mvn',
  'vendor', 'deps', '_build',
]);

// Files to exclude
const EXCLUDE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'go.sum', 'Cargo.lock', 'Gemfile.lock',
]);

interface AIReviewResponse {
  code_quality: {
    readability_and_organization: { score: number; rationale: string };
    error_handling: { score: number; rationale: string };
    project_structure: { score: number; rationale: string };
    total: number;
  };
  clean_architecture: {
    common_interface: { score: number; rationale: string };
    per_mutation_implementation: { score: number; rationale: string };
    generic_dispatch: { score: number; rationale: string };
    extensibility: { score: number; rationale: string };
    total: number;
  };
  overall_total: number;
  language: string;
  summary: string;
}

/**
 * Run the AI code review.
 */
export async function runAICodeReview(
  config: Config
): Promise<{ codeQuality: CodeQualityResults; cleanArchitecture: CleanArchitectureResult }> {
  if (!config.codePath) {
    console.log('  AI code review skipped (no --code-path provided)');
    return {
      codeQuality: { 
        readability_and_organization: 0, 
        error_handling: 0, 
        project_structure: 0, 
        points: 0, 
        skipped: true 
      },
      cleanArchitecture: { 
        common_interface: 0, 
        per_mutation_implementation: 0, 
        generic_dispatch: 0, 
        extensibility: 0, 
        points: 0 
      },
    };
  }

  console.log(`\n  Running AI code review on: ${config.codePath}`);

  // Collect source files
  const sourceFiles = collectSourceFiles(config.codePath);
  if (sourceFiles.length === 0) {
    console.log('  No source files found');
    return {
      codeQuality: { 
        readability_and_organization: 0, 
        error_handling: 0, 
        project_structure: 0, 
        points: 0, 
        skipped: true 
      },
      cleanArchitecture: { 
        common_interface: 0, 
        per_mutation_implementation: 0, 
        generic_dispatch: 0, 
        extensibility: 0, 
        points: 0 
      },
    };
  }

  console.log(`  Found ${sourceFiles.length} source files`);

  // Format source files
  const formattedSource = formatSourceFiles(sourceFiles, config.codePath);

  // Load the review prompt
  const promptPath = path.join(__dirname, '..', '..', 'ai-code-review-prompt.md');
  let promptTemplate: string;
  try {
    const promptContent = fs.readFileSync(promptPath, 'utf-8');
    // Extract the prompt between the ``` markers
    const match = promptContent.match(/```\n([\s\S]*?)```\n\n---/);
    promptTemplate = match ? match[1] : promptContent;
  } catch {
    console.log('  Could not load ai-code-review-prompt.md');
    return {
      codeQuality: { 
        readability_and_organization: 0, 
        error_handling: 0, 
        project_structure: 0, 
        points: 0, 
        skipped: true 
      },
      cleanArchitecture: { 
        common_interface: 0, 
        per_mutation_implementation: 0, 
        generic_dispatch: 0, 
        extensibility: 0, 
        points: 0 
      },
    };
  }

  const fullPrompt = promptTemplate.replace('{{SOURCE_FILES}}', formattedSource);

  // Always run 3 times and take the median for fairness.
  // LLMs are non-deterministic even at temperature=0, so a single run
  // could over- or under-score by 1-2 points. Three runs + median
  // provides a stable, reproducible result.
  const AI_REVIEW_RUNS = 3;
  const results: AIReviewResponse[] = [];

  for (let run = 1; run <= AI_REVIEW_RUNS; run++) {
    console.log(`  AI review run ${run}/${AI_REVIEW_RUNS}...`);
    const response = await callAIModel(fullPrompt);
    if (response) {
      console.log(`    Run ${run} total: ${response.overall_total.toFixed(1)}`);
      results.push(response);
    } else {
      console.log(`    Run ${run} failed`);
    }
  }

  if (results.length === 0) {
    console.log('  AI review failed - no successful responses');
    return {
      codeQuality: { 
        readability_and_organization: 0, 
        error_handling: 0, 
        project_structure: 0, 
        points: 0, 
        skipped: true 
      },
      cleanArchitecture: { 
        common_interface: 0, 
        per_mutation_implementation: 0, 
        generic_dispatch: 0, 
        extensibility: 0, 
        points: 0 
      },
    };
  }

  // Report spread for transparency
  if (results.length >= 2) {
    const totals = results.map(r => r.overall_total).sort((a, b) => a - b);
    const spread = totals[totals.length - 1] - totals[0];
    console.log(`  AI score spread: ${spread.toFixed(1)} points across ${results.length} runs`);
  }

  // Take median (sort by overall_total, pick middle). If 2 results, average. If 1, use it.
  const finalResult = aggregateResults(results);

  console.log(`  Code Quality: ${finalResult.code_quality.total}/5`);
  console.log(`  Clean Architecture: ${finalResult.clean_architecture.total}/4`);

  return {
    codeQuality: {
      readability_and_organization: finalResult.code_quality.readability_and_organization.score,
      error_handling: finalResult.code_quality.error_handling.score,
      project_structure: finalResult.code_quality.project_structure.score,
      points: finalResult.code_quality.total,
      skipped: false,
      reasoning: {
        readability_and_organization: finalResult.code_quality.readability_and_organization.rationale,
        error_handling: finalResult.code_quality.error_handling.rationale,
        project_structure: finalResult.code_quality.project_structure.rationale,
      },
      summary: finalResult.summary,
    },
    cleanArchitecture: {
      common_interface: finalResult.clean_architecture.common_interface.score,
      per_mutation_implementation: finalResult.clean_architecture.per_mutation_implementation.score,
      generic_dispatch: finalResult.clean_architecture.generic_dispatch.score,
      extensibility: finalResult.clean_architecture.extensibility.score,
      points: finalResult.clean_architecture.total,
      reasoning: {
        common_interface: finalResult.clean_architecture.common_interface.rationale,
        per_mutation_implementation: finalResult.clean_architecture.per_mutation_implementation.rationale,
        generic_dispatch: finalResult.clean_architecture.generic_dispatch.rationale,
        extensibility: finalResult.clean_architecture.extensibility.rationale,
      },
    },
  };
}

function collectSourceFiles(rootPath: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (EXCLUDE_FILES.has(entry.name)) continue;

        const ext = path.extname(entry.name).toLowerCase();
        const isDockerfile = entry.name === 'Dockerfile' || entry.name.startsWith('Dockerfile.');

        if (INCLUDE_EXTENSIONS.has(ext) || isDockerfile) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(rootPath);
  return files.slice(0, 100); // Cap at 100 files
}

function formatSourceFiles(files: string[], rootPath: string): string {
  const parts: string[] = [];

  for (const file of files) {
    const relativePath = path.relative(rootPath, file);
    try {
      const content = fs.readFileSync(file, 'utf-8');
      parts.push(`=== FILE: ${relativePath} ===\n${content}\n`);
    } catch {
      // Skip unreadable files
    }
  }

  return parts.join('\n');
}

async function callAIModel(prompt: string): Promise<AIReviewResponse | null> {
  // Try OpenAI first, then Anthropic
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey) {
    return callOpenAI(prompt, openaiKey);
  } else if (anthropicKey) {
    return callAnthropic(prompt, anthropicKey);
  } else {
    console.log('  No AI API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
    return null;
  }
}

async function callOpenAI(prompt: string, apiKey: string): Promise<AIReviewResponse | null> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          temperature: 0,
          messages: [
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        }
      );

      const content = response.data.choices?.[0]?.message?.content;
      if (content) {
        return JSON.parse(content) as AIReviewResponse;
      }
      return null;
    } catch (err: any) {
      lastError = err;
      const statusCode = err?.response?.status;
      const isRateLimit = statusCode === 429;
      
      if (isRateLimit && attempt < maxRetries - 1) {
        // Exponential backoff: 2^attempt seconds (2s, 4s, 8s)
        const waitSeconds = Math.pow(2, attempt);
        console.log(`  Rate limited (429), retrying in ${waitSeconds}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
        continue;
      }
      
      // For non-rate-limit errors or final attempt, log and return
      const errorMsg = err?.response?.status 
        ? `Request failed with status code ${err.response.status}`
        : (err as Error).message;
      console.log(`  OpenAI API error: ${errorMsg}`);
      return null;
    }
  }

  return null;
}

async function callAnthropic(prompt: string, apiKey: string): Promise<AIReviewResponse | null> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          temperature: 0,
          messages: [
            { role: 'user', content: prompt },
          ],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        }
      );

      const content = response.data.content?.[0]?.text;
      if (content) {
        // Extract JSON from the response (may be wrapped in markdown)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as AIReviewResponse;
        }
      }
      return null;
    } catch (err: any) {
      lastError = err;
      const statusCode = err?.response?.status;
      const isRateLimit = statusCode === 429;
      
      if (isRateLimit && attempt < maxRetries - 1) {
        // Exponential backoff: 2^attempt seconds (2s, 4s, 8s)
        const waitSeconds = Math.pow(2, attempt);
        console.log(`  Rate limited (429), retrying in ${waitSeconds}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
        continue;
      }
      
      // For non-rate-limit errors or final attempt, log and return
      const errorMsg = err?.response?.status 
        ? `Request failed with status code ${err.response.status}`
        : (err as Error).message;
      console.log(`  Anthropic API error: ${errorMsg}`);
      return null;
    }
  }

  return null;
}

function aggregateResults(results: AIReviewResponse[]): AIReviewResponse {
  if (results.length === 1) return results[0];

  if (results.length === 2) {
    // Average - combine rationales from both runs
    return {
      code_quality: {
        readability_and_organization: {
          score: (results[0].code_quality.readability_and_organization.score + results[1].code_quality.readability_and_organization.score) / 2,
          rationale: `${results[0].code_quality.readability_and_organization.rationale} [Run 2: ${results[1].code_quality.readability_and_organization.rationale}]`,
        },
        error_handling: {
          score: (results[0].code_quality.error_handling.score + results[1].code_quality.error_handling.score) / 2,
          rationale: `${results[0].code_quality.error_handling.rationale} [Run 2: ${results[1].code_quality.error_handling.rationale}]`,
        },
        project_structure: {
          score: (results[0].code_quality.project_structure.score + results[1].code_quality.project_structure.score) / 2,
          rationale: `${results[0].code_quality.project_structure.rationale} [Run 2: ${results[1].code_quality.project_structure.rationale}]`,
        },
        total: (results[0].code_quality.total + results[1].code_quality.total) / 2,
      },
      clean_architecture: {
        common_interface: {
          score: Math.round((results[0].clean_architecture.common_interface.score + results[1].clean_architecture.common_interface.score) / 2),
          rationale: `${results[0].clean_architecture.common_interface.rationale} [Run 2: ${results[1].clean_architecture.common_interface.rationale}]`,
        },
        per_mutation_implementation: {
          score: Math.round((results[0].clean_architecture.per_mutation_implementation.score + results[1].clean_architecture.per_mutation_implementation.score) / 2),
          rationale: `${results[0].clean_architecture.per_mutation_implementation.rationale} [Run 2: ${results[1].clean_architecture.per_mutation_implementation.rationale}]`,
        },
        generic_dispatch: {
          score: Math.round((results[0].clean_architecture.generic_dispatch.score + results[1].clean_architecture.generic_dispatch.score) / 2),
          rationale: `${results[0].clean_architecture.generic_dispatch.rationale} [Run 2: ${results[1].clean_architecture.generic_dispatch.rationale}]`,
        },
        extensibility: {
          score: Math.round((results[0].clean_architecture.extensibility.score + results[1].clean_architecture.extensibility.score) / 2),
          rationale: `${results[0].clean_architecture.extensibility.rationale} [Run 2: ${results[1].clean_architecture.extensibility.rationale}]`,
        },
        total: (results[0].clean_architecture.total + results[1].clean_architecture.total) / 2,
      },
      overall_total: (results[0].overall_total + results[1].overall_total) / 2,
      language: results[0].language,
      summary: results[0].summary && results[1].summary 
        ? `${results[0].summary}\n\n[Additional assessment from second run:] ${results[1].summary}`
        : (results[0].summary || results[1].summary || ''),
    };
  }

  // 3 results: take median by overall_total
  results.sort((a, b) => a.overall_total - b.overall_total);
  return results[1]; // Middle value
}
