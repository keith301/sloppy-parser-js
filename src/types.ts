/**
 * A text block from the raw segmented output
 */
export interface TextBlock {
  type: "text";
  text: string;
}

/**
 * An object block from the raw segmented output
 */
export interface ObjectBlock {
  type: "object";
  object: any;
  raw: string;
  repairedText: string;
  warnings: string[];
  repairs: string[];
  score: number;
  winningMode: "json-ish" | "yaml-ish";
}

/**
 * Raw segmented output - the primary output format
 */
export type RawBlock = TextBlock | ObjectBlock;

/**
 * Internal type for object candidates before repair
 */
export interface ObjectCandidate {
  type: "object-candidate";
  raw: string;
}

/**
 * Internal segmented block types
 */
export type SegmentedBlock = TextBlock | ObjectCandidate;

/**
 * Repair result from attempting to parse an object candidate
 */
export interface RepairResult {
  success: boolean;
  object?: any;
  repairedText?: string;
  warnings: string[];
  repairs: string[];
  score: number;
  mode: "json-ish" | "yaml-ish";
}

