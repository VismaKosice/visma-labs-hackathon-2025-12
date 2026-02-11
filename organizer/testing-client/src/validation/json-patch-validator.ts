/**
 * Validates JSON Patch documents (RFC 6902) for bonus scoring.
 */

import { applyPatch, deepClone } from 'fast-json-patch';
import { Situation, ProcessedMutation, JsonPatchOperation } from '../types/api';
import { compareSituations } from './situation-comparator';

export interface PatchValidationResult {
  forwardValid: boolean;
  backwardValid: boolean;
  forwardErrors: string[];
  backwardErrors: string[];
}

/**
 * Validate forward and backward JSON Patches across all mutations.
 *
 * For forward patches:
 * - Start with initial_situation.situation
 * - For each mutation, apply the forward patch
 * - Verify result matches expected situation after that mutation
 *
 * For backward patches:
 * - Start from the end situation
 * - For each mutation in reverse, apply the backward patch
 * - Verify result matches the previous situation
 */
export function validatePatches(
  initialSituation: Situation,
  endSituation: Situation,
  mutations: ProcessedMutation[],
): PatchValidationResult {
  const forwardErrors: string[] = [];
  const backwardErrors: string[] = [];

  // Check if forward patches are present on all mutations
  const allHaveForward = mutations.every(
    m => m.forward_patch_to_situation_after_this_mutation != null
  );
  const allHaveBackward = mutations.every(
    m => m.backward_patch_to_previous_situation != null
  );

  if (!allHaveForward) {
    forwardErrors.push('Not all mutations have forward_patch_to_situation_after_this_mutation');
    return {
      forwardValid: false,
      backwardValid: false,
      forwardErrors,
      backwardErrors: ['Forward patches required for backward patch validation'],
    };
  }

  // Validate forward patches
  let currentSituation = deepClone(initialSituation) as Situation;

  for (let i = 0; i < mutations.length; i++) {
    const patch = mutations[i].forward_patch_to_situation_after_this_mutation as JsonPatchOperation[];

    try {
      const result = applyPatch(currentSituation, patch as any, true, false);
      currentSituation = result.newDocument as Situation;
    } catch (err) {
      forwardErrors.push(
        `Forward patch at mutation index ${i} failed to apply: ${(err as Error).message}`
      );
      break;
    }
  }

  // After applying all forward patches, compare with end_situation
  if (forwardErrors.length === 0) {
    const sitErrors = compareSituations(endSituation, currentSituation, `forward_patch_end`);
    if (sitErrors.length > 0) {
      forwardErrors.push(
        `After applying all forward patches, result does not match end_situation: ${sitErrors.map(e => e.message).join('; ')}`
      );
    }
  }

  // Validate backward patches (only if forward patches are valid and backward patches exist)
  if (!allHaveBackward) {
    backwardErrors.push('Not all mutations have backward_patch_to_previous_situation');
  } else if (forwardErrors.length === 0) {
    // Build intermediate situations by applying forward patches
    const situations: Situation[] = [deepClone(initialSituation) as Situation];
    let sit = deepClone(initialSituation) as Situation;

    for (let i = 0; i < mutations.length; i++) {
      const patch = mutations[i].forward_patch_to_situation_after_this_mutation as JsonPatchOperation[];
      try {
        const result = applyPatch(sit, patch as any, true, false);
        sit = result.newDocument as Situation;
        situations.push(deepClone(sit) as Situation);
      } catch {
        backwardErrors.push(`Cannot build intermediate situations (forward patch ${i} failed)`);
        break;
      }
    }

    if (backwardErrors.length === 0) {
      // Apply backward patches in reverse
      for (let i = mutations.length - 1; i >= 0; i--) {
        const patch = mutations[i].backward_patch_to_previous_situation as JsonPatchOperation[];
        const afterSituation = deepClone(situations[i + 1]) as Situation;

        try {
          const result = applyPatch(afterSituation, patch as any, true, false);
          const restoredSituation = result.newDocument as Situation;

          const sitErrors = compareSituations(
            situations[i],
            restoredSituation,
            `backward_patch_${i}`
          );

          if (sitErrors.length > 0) {
            backwardErrors.push(
              `Backward patch at mutation index ${i} produced incorrect result: ${sitErrors.map(e => e.message).join('; ')}`
            );
          }
        } catch (err) {
          backwardErrors.push(
            `Backward patch at mutation index ${i} failed to apply: ${(err as Error).message}`
          );
        }
      }
    }
  } else {
    backwardErrors.push('Forward patches invalid; cannot validate backward patches');
  }

  return {
    forwardValid: forwardErrors.length === 0,
    backwardValid: backwardErrors.length === 0,
    forwardErrors,
    backwardErrors,
  };
}
