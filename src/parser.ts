import type { RawBlock, SegmentedBlock, ObjectBlock } from "./types";
import { preprocess } from "./preprocessor";
import { segment } from "./segmenter";
import { repairObjectCandidate } from "./repairer";

/**
 * Main parsing function that coordinates the full pipeline
 */
export function parseRaw(input: string): RawBlock[] {
  // Step 1: Preprocess to remove noise
  const cleaned = preprocess(input);

  // Step 2: Segment into text and object-candidate blocks
  const segmented = segment(cleaned);

  // Step 3: Repair each object-candidate into strict JSON
  const result: RawBlock[] = [];

  for (const block of segmented) {
    if (block.type === "text") {
      result.push(block);
    } else {
      // object-candidate
      const repaired = repairObjectCandidate(block.raw);

      if (repaired.success && repaired.object !== undefined) {
        const objectBlock: ObjectBlock = {
          type: "object",
          object: repaired.object,
          raw: block.raw,
          repairedText: repaired.repairedText || "",
          warnings: repaired.warnings,
          repairs: repaired.repairs,
          score: repaired.score,
          winningMode: repaired.mode,
        };
        result.push(objectBlock);
      }
      // If repair fails, we skip the block (could be made into error block in future)
    }
  }

  return result;
}

