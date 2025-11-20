import type { RawBlock, ObjectBlock } from "./types";
import { parseRaw } from "./parser";
import { setDebugLevel, getDebugLevel, type DebugLevel } from "./debug";

/**
 * Parse raw LLM output into segmented blocks (text + objects)
 * This is the primary output format that preserves order and narration.
 */
export function parseRawOutput(input: string): RawBlock[] {
  return parseRaw(input);
}

/**
 * Parse LLM output and extract only the JSON objects.
 * Returns:
 * - null if no objects found
 * - single object if exactly one object found
 * - array of objects if multiple objects found
 */
export function parseJson(input: string): any | any[] | null {
  const rawBlocks = parseRaw(input);
  const objectBlocks = rawBlocks.filter(
    (block): block is ObjectBlock => block.type === "object"
  );

  if (objectBlocks.length === 0) {
    return null;
  }

  if (objectBlocks.length === 1) {
    return objectBlocks[0].object;
  }

  return objectBlocks.map((block) => block.object);
}

/**
 * Set debug logging level
 * - 'silent': No debug output (default)
 * - 'basic': High-level operations (segmentation, repairs)
 * - 'verbose': Detailed internal operations (tokens, parse steps)
 * 
 * Can also be set via SLOPPY_DEBUG environment variable
 */
export function setDebug(level: DebugLevel): void {
  setDebugLevel(level);
}

/**
 * Get current debug level
 */
export function getDebug(): DebugLevel {
  return getDebugLevel();
}

// Re-export types for library consumers
export type { RawBlock, TextBlock, ObjectBlock } from "./types";
export type { DebugLevel } from "./debug";

// Default export
export default {
  parseRawOutput,
  parseJson,
  setDebug,
  getDebug,
};

