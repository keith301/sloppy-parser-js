import type { SegmentedBlock } from "./types";
import { SoftParser } from "./soft-parser";

/**
 * Segmenter uses a soft grammar parser with fuzzy productions and backtracking.
 * 
 * The parser:
 * - Explores multiple possible interpretations (token lattice)
 * - Each interpretation has a score (repair cost)
 * - Backtracks and tries alternates when paths fail
 * - Returns the best-scoring valid parse
 * 
 * This is NOT a strict grammar - it's a permission system that tries
 * to make sense of broken input through weighted transitions.
 */
export function segment(input: string): SegmentedBlock[] {
  const parser = new SoftParser(input);
  return parser.parse();
}

