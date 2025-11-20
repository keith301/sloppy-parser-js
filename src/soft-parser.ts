/**
 * Soft Grammar Parser
 * 
 * Explores multiple fuzzy paths with backtracking and scoring.
 * Returns the best valid parse (lowest score).
 */

import { SoftTokenizer, TokenCandidate } from "./soft-tokenizer";
import type { SegmentedBlock } from "./types";

interface ParsePath {
  blocks: SegmentedBlock[];
  score: number;
  repairs: string[];
  position: number;
}

/**
 * Soft grammar parser that tries multiple interpretations
 */
export class SoftParser {
  private tokenizer: SoftTokenizer;
  private paths: ParsePath[] = [];

  constructor(input: string) {
    this.tokenizer = new SoftTokenizer(input);
  }

  /**
   * Parse document, exploring multiple paths
   */
  parse(): SegmentedBlock[] {
    const initialPath: ParsePath = {
      blocks: [],
      score: 0,
      repairs: [],
      position: 0,
    };

    const result = this.parseDocument(initialPath);
    return result.blocks;
  }

  /**
   * Document := (TextBlock | ObjectBlock)*
   */
  private parseDocument(path: ParsePath): ParsePath {
    this.tokenizer.seek(path.position);

    while (!this.tokenizer.isEOF()) {
      // Try to parse object block (multiple attempts with backtracking)
      const objectResult = this.tryParseObjectBlock(path);
      
      if (objectResult) {
        path = objectResult;
        continue;
      }

      // Otherwise, parse text until next object
      const textResult = this.parseTextBlock(path);
      if (textResult) {
        path = textResult;
      } else {
        // Skip one character to avoid infinite loop
        this.tokenizer.seek(this.tokenizer.getPosition() + 1);
        path.position = this.tokenizer.getPosition();
      }
    }

    return path;
  }

  /**
   * Try multiple interpretations of an object block
   */
  private tryParseObjectBlock(path: ParsePath): ParsePath | null {
    const checkpoint = path.position;

    // Try all possible object interpretations
    const attempts = [
      () => this.tryParseFencedJSON(path),
      () => this.tryParseFencedYAML(path),
      () => this.tryParseJSONObject(path),
      () => this.tryParseYAMLObject(path),
    ];

    const results: ParsePath[] = [];

    for (const attempt of attempts) {
      this.tokenizer.seek(checkpoint);
      const result = attempt();
      if (result) {
        results.push(result);
      }
    }

    if (results.length === 0) return null;

    // Return best scoring result
    return results.sort((a, b) => a.score - b.score)[0];
  }

  /**
   * Parse text until we hit something that looks like an object
   */
  private parseTextBlock(path: ParsePath): ParsePath | null {
    this.tokenizer.seek(path.position);
    let text = "";

    while (!this.tokenizer.isEOF()) {
      // Lookahead: check if we're at an object start
      if (this.looksLikeObjectStart()) {
        break;
      }

      // In text mode, consume raw characters to preserve quotes, etc.
      const ch = this.tokenizer.consumeRawChar();
      if (ch) {
        text += ch;
      } else {
        break;
      }
    }

    if (text.trim().length === 0) return null;

    return {
      blocks: [...path.blocks, { type: "text", text: text.trim() }],
      score: path.score,
      repairs: path.repairs,
      position: this.tokenizer.getPosition(),
    };
  }

  /**
   * Lookahead: does it look like an object is starting?
   */
  private looksLikeObjectStart(): boolean {
    const candidates = this.tokenizer.nextTokenCandidates();
    if (candidates.length === 0) return false;

    const types = candidates.map((c) => c.type);
    return (
      types.includes("FENCE_JSON") ||
      types.includes("FENCE_YAML") ||
      types.includes("BRACE_OPEN") ||
      types.includes("BRACKET_OPEN") ||
      this.looksLikeYAMLKey()
    );
  }

  /**
   * Check if current position looks like YAML key: value
   * YAML keys must appear at start of a line to avoid matching mid-sentence "is:"
   */
  private looksLikeYAMLKey(): boolean {
    const checkpoint = this.tokenizer.getPosition();
    const startPos = checkpoint;
    
    // Requirement: YAML keys appear at position 0 OR after newline + optional whitespace
    // Check if there's any non-whitespace content before us on the same line
    if (startPos > 0) {
      // Look backwards to find either newline or non-whitespace
      for (let i = startPos - 1; i >= 0; i--) {
        const ch = this.tokenizer.peek(i - startPos);
        if (ch === '\n' || ch === '\r') {
          // Found newline - we're at start of line
          break;
        }
        if (ch !== ' ' && ch !== '\t') {
          // Found non-whitespace before newline - we're mid-line
          return false;
        }
      }
    }
    
    // Skip whitespace (but we've already confirmed we're at start of line)
    let token = this.tokenizer.consumeBest();
    while (token && token.type === "WHITESPACE") {
      token = this.tokenizer.consumeBest();
    }

    // Check for word followed by colon
    const hasWord = token && (token.type === "BARE_WORD" || token.type === "STRING");
    const nextToken = this.tokenizer.consumeBest();
    const hasColon = nextToken && nextToken.type === "COLON";

    this.tokenizer.seek(checkpoint);
    return !!(hasWord && hasColon);
  }

  /**
   * Try to parse ```json ... ```
   */
  private tryParseFencedJSON(path: ParsePath): ParsePath | null {
    const candidates = this.tokenizer.nextTokenCandidates();
    const fence = candidates.find((c) => c.type === "FENCE_JSON");
    if (!fence) return null;

    this.tokenizer.seek(fence.endPos);
    let raw = "";
    let score = path.score + fence.score;
    const repairs = [...path.repairs];
    if (fence.repair) repairs.push(fence.repair);

    // Capture until closing fence
    while (!this.tokenizer.isEOF()) {
      const cands = this.tokenizer.nextTokenCandidates();
      const closeFence = cands.find((c) => c.type === "FENCE_END");
      
      if (closeFence) {
        this.tokenizer.seek(closeFence.endPos);
        break;
      }

      const token = this.tokenizer.consumeBest();
      if (token) {
        raw += token.value;
        score += token.score;
        if (token.repair) repairs.push(token.repair);
      }
    }

    return {
      blocks: [...path.blocks, { type: "object-candidate", raw: raw.trim() }],
      score,
      repairs,
      position: this.tokenizer.getPosition(),
    };
  }

  /**
   * Try to parse ```yaml ... ```
   */
  private tryParseFencedYAML(path: ParsePath): ParsePath | null {
    const candidates = this.tokenizer.nextTokenCandidates();
    const fence = candidates.find((c) => c.type === "FENCE_YAML");
    if (!fence) return null;

    this.tokenizer.seek(fence.endPos);
    let raw = "";
    let score = path.score + fence.score + 5; // YAML mode penalty
    const repairs = [...path.repairs, "YAML mode"];
    if (fence.repair) repairs.push(fence.repair);

    // Capture until closing fence
    while (!this.tokenizer.isEOF()) {
      const cands = this.tokenizer.nextTokenCandidates();
      const closeFence = cands.find((c) => c.type === "FENCE_END");
      
      if (closeFence) {
        this.tokenizer.seek(closeFence.endPos);
        break;
      }

      const token = this.tokenizer.consumeBest();
      if (token) {
        raw += token.value;
        score += token.score;
        if (token.repair) repairs.push(token.repair);
      }
    }

    return {
      blocks: [...path.blocks, { type: "object-candidate", raw: raw.trim() }],
      score,
      repairs,
      position: this.tokenizer.getPosition(),
    };
  }

  /**
   * Try to parse { ... } or [ ... ]
   */
  private tryParseJSONObject(path: ParsePath): ParsePath | null {
    const candidates = this.tokenizer.nextTokenCandidates();
    const opener = candidates.find(
      (c) => c.type === "BRACE_OPEN" || c.type === "BRACKET_OPEN"
    );
    if (!opener) return null;

    this.tokenizer.seek(opener.endPos);
    const closeType = opener.type === "BRACE_OPEN" ? "BRACE_CLOSE" : "BRACKET_CLOSE";
    
    let raw = opener.value;
    let depth = 1;
    let score = path.score + opener.score;
    const repairs = [...path.repairs];
    if (opener.repair) repairs.push(opener.repair);

    while (!this.tokenizer.isEOF() && depth > 0) {
      const token = this.tokenizer.consumeBest();
      if (!token) break;

      raw += token.value;
      score += token.score;
      if (token.repair) repairs.push(token.repair);

      if (token.type === "BRACE_OPEN" || token.type === "BRACKET_OPEN") {
        depth++;
      } else if (token.type === "BRACE_CLOSE" || token.type === "BRACKET_CLOSE") {
        depth--;
      }
    }

    if (depth !== 0) {
      // Unbalanced - failed parse
      return null;
    }

    return {
      blocks: [...path.blocks, { type: "object-candidate", raw: raw.trim() }],
      score,
      repairs,
      position: this.tokenizer.getPosition(),
    };
  }

  /**
   * Try to parse YAML object (key: value lines)
   */
  private tryParseYAMLObject(path: ParsePath): ParsePath | null {
    if (!this.looksLikeYAMLKey()) return null;

    let raw = "";
    let score = path.score + 5; // YAML mode penalty
    const repairs = [...path.repairs, "YAML mode"];

    while (!this.tokenizer.isEOF() && this.looksLikeYAMLContinuation()) {
      const token = this.tokenizer.consumeBest();
      if (!token) break;

      raw += token.value;
      score += token.score;
      if (token.repair) repairs.push(token.repair);
    }

    if (raw.trim().length === 0) return null;

    return {
      blocks: [...path.blocks, { type: "object-candidate", raw: raw.trim() }],
      score,
      repairs,
      position: this.tokenizer.getPosition(),
    };
  }

  /**
   * Lookahead: does YAML continue?
   * Returns true if current position has more YAML content to consume
   */
  private looksLikeYAMLContinuation(): boolean {
    const checkpoint = this.tokenizer.getPosition();
    
    // First check: what's the current token?
    const candidates = this.tokenizer.nextTokenCandidates();
    if (candidates.length === 0) {
      this.tokenizer.seek(checkpoint);
      return false;
    }
    
    const current = candidates[0];
    
    // If we're at a token that's clearly part of YAML, continue
    // Note: BRACE_OPEN is allowed for inline JSON within YAML values
    if (current.type === "DASH" ||
        current.type === "BARE_WORD" ||
        current.type === "STRING" ||
        current.type === "NUMBER" ||
        current.type === "BOOLEAN" ||
        current.type === "NULL" ||
        current.type === "COLON" ||
        current.type === "WHITESPACE" ||
        current.type === "NEWLINE" ||
        current.type === "BRACE_OPEN") {
      
      // But if it's a newline, check what comes after it
      if (current.type === "NEWLINE") {
        this.tokenizer.consumeBest(); // consume newline
        
        // Skip any additional whitespace
        while (this.tokenizer.nextTokenCandidates().length > 0 && 
               this.tokenizer.nextTokenCandidates()[0].type === "WHITESPACE") {
          this.tokenizer.consumeBest();
        }
        
        // Now check what's next
        const nextCandidates = this.tokenizer.nextTokenCandidates();
        const nextIsYAML = nextCandidates.length > 0 && (
          nextCandidates[0].type === "DASH" ||
          this.looksLikeYAMLKey()
        );
        
        this.tokenizer.seek(checkpoint);
        return !!nextIsYAML;
      }
      
      this.tokenizer.seek(checkpoint);
      return true;
    }
    
    // Structural tokens end YAML (except BRACE_OPEN which can be inline JSON)
    if (current.type === "BRACKET_OPEN" ||
        current.type === "FENCE_END") {
      this.tokenizer.seek(checkpoint);
      return false;
    }
    
    this.tokenizer.seek(checkpoint);
    return false;
  }
}

