/**
 * Soft Grammar Tokenizer
 * 
 * Produces MAYBE tokens - multiple possible interpretations at each position.
 * Each token candidate has a score representing how much "repair" it requires.
 */

export interface TokenCandidate {
  type: string;
  value: string;
  endPos: number;
  score: number;  // 0 = perfect, higher = more repair needed
  repair?: string; // description of repair made
}

/**
 * Soft tokenizer that produces multiple token candidates at each position
 */
export class SoftTokenizer {
  private input: string;
  private pos: number = 0;

  constructor(input: string) {
    this.input = input;
  }

  getPosition(): number {
    return this.pos;
  }

  seek(pos: number): void {
    this.pos = pos;
  }

  isEOF(): boolean {
    return this.pos >= this.input.length;
  }

  peek(offset: number = 0): string {
    return this.input[this.pos + offset] || "";
  }

  peekAhead(length: number): string {
    return this.input.substring(this.pos, this.pos + length);
  }

  /**
   * Get all possible token interpretations at current position.
   * Returns array of candidates sorted by score (best first).
   */
  nextTokenCandidates(): TokenCandidate[] {
    if (this.isEOF()) return [];

    const candidates: TokenCandidate[] = [];
    const ch = this.peek();

    // Try all possible interpretations
    candidates.push(...this.tryFence());
    candidates.push(...this.tryString());
    candidates.push(...this.tryNumber());
    candidates.push(...this.tryKeyword());
    candidates.push(...this.tryBareWord());
    candidates.push(...this.tryPunctuation());
    candidates.push(...this.tryWhitespace());
    
    // Fallback: treat as text character
    if (candidates.length === 0) {
      candidates.push(...this.tryTextChar());
    }

    // Sort by score (best first)
    return candidates.sort((a, b) => a.score - b.score);
  }

  /**
   * Try to match fence markers: ```json, ```yaml, ```
   */
  private tryFence(): TokenCandidate[] {
    if (this.peekAhead(3) !== "```") return [];

    const candidates: TokenCandidate[] = [];
    let pos = this.pos + 3;

    // Read language identifier
    let lang = "";
    while (pos < this.input.length && /[a-z]/i.test(this.input[pos])) {
      lang += this.input[pos++];
    }

    if (lang.toLowerCase() === "json") {
      candidates.push({
        type: "FENCE_JSON",
        value: "```json",
        endPos: pos,
        score: 0,
      });
    } else if (lang.toLowerCase() === "yaml") {
      candidates.push({
        type: "FENCE_YAML",
        value: "```yaml",
        endPos: pos,
        score: 0,
      });
    } else {
      candidates.push({
        type: "FENCE_END",
        value: "```",
        endPos: this.pos + 3,
        score: 0,
      });
    }

    return candidates;
  }

  /**
   * Try to match strings: "...", '...', or MAYBE missing quotes
   */
  private tryString(): TokenCandidate[] {
    const ch = this.peek();
    const candidates: TokenCandidate[] = [];

    // Double quotes are always string delimiters
    if (ch === '"') {
      const quote = ch;
      let pos = this.pos + 1;
      let value = "";
      let escaped = false;

      while (pos < this.input.length) {
        const c = this.input[pos];
        
        if (escaped) {
          value += c;
          escaped = false;
          pos++;
          continue;
        }

        if (c === "\\") {
          escaped = true;
          pos++;
          continue;
        }

        if (c === quote) {
          pos++; // consume closing quote
          candidates.push({
            type: "STRING",
            value,
            endPos: pos,
            score: 0, // perfect
          });
          break;
        }

        value += c;
        pos++;
      }
    }

    // Single quotes: only treat as string delimiter in JSON-like contexts
    // Check if previous char was : or , or { or [ to distinguish from apostrophes
    if (ch === "'") {
      const prevPos = this.pos - 1;
      const prevChar = prevPos >= 0 ? this.input[prevPos] : "";
      const isProbablyStringDelimiter = /[:,\[\{]/.test(prevChar) || prevPos < 0;

      if (isProbablyStringDelimiter) {
        const quote = ch;
        let pos = this.pos + 1;
        let value = "";
        let escaped = false;

        while (pos < this.input.length) {
          const c = this.input[pos];
          
          if (escaped) {
            value += c;
            escaped = false;
            pos++;
            continue;
          }

          if (c === "\\") {
            escaped = true;
            pos++;
            continue;
          }

          if (c === quote) {
            pos++; // consume closing quote
            candidates.push({
              type: "STRING",
              value,
              endPos: pos,
              score: 1, // slight penalty for single quotes in JSON
            });
            break;
          }

          value += c;
          pos++;
        }
      }
    }

    // MAYBE_QUOTE: Unicode quotes
    if (ch === "\u201c" || ch === "\u201d") {
      let pos = this.pos + 1;
      let value = "";
      
      while (pos < this.input.length && this.input[pos] !== "\u201c" && this.input[pos] !== "\u201d") {
        value += this.input[pos++];
      }
      
      if (pos < this.input.length) {
        pos++; // closing quote
        candidates.push({
          type: "STRING",
          value,
          endPos: pos,
          score: 2, // needs normalization
          repair: "normalized unicode quotes",
        });
      }
    }

    return candidates;
  }

  /**
   * Try to match numbers
   */
  private tryNumber(): TokenCandidate[] {
    const ch = this.peek();
    if (!/[-0-9]/.test(ch)) return [];

    let pos = this.pos;
    let value = "";

    // Optional minus
    if (this.input[pos] === "-") {
      value += this.input[pos++];
    }

    // Digits before decimal
    if (!/[0-9]/.test(this.input[pos])) return [];
    
    while (pos < this.input.length && /[0-9]/.test(this.input[pos])) {
      value += this.input[pos++];
    }

    // Optional decimal
    if (this.input[pos] === ".") {
      value += this.input[pos++];
      while (pos < this.input.length && /[0-9]/.test(this.input[pos])) {
        value += this.input[pos++];
      }
    }

    return [{
      type: "NUMBER",
      value,
      endPos: pos,
      score: 0,
    }];
  }

  /**
   * Try to match keywords: true, false, null
   */
  private tryKeyword(): TokenCandidate[] {
    const candidates: TokenCandidate[] = [];

    if (this.peekAhead(4) === "true") {
      candidates.push({
        type: "BOOLEAN",
        value: "true",
        endPos: this.pos + 4,
        score: 0,
      });
    }

    if (this.peekAhead(5) === "false") {
      candidates.push({
        type: "BOOLEAN",
        value: "false",
        endPos: this.pos + 5,
        score: 0,
      });
    }

    if (this.peekAhead(4) === "null") {
      candidates.push({
        type: "NULL",
        value: "null",
        endPos: this.pos + 4,
        score: 0,
      });
    }

    return candidates;
  }

  /**
   * Try to match bare words (unquoted identifiers)
   */
  private tryBareWord(): TokenCandidate[] {
    const ch = this.peek();
    if (!/[a-zA-Z_$]/.test(ch)) return [];

    let pos = this.pos;
    let value = "";

    while (pos < this.input.length && /[a-zA-Z0-9_$-]/.test(this.input[pos])) {
      value += this.input[pos++];
    }

    // Skip if it's a keyword (handled by tryKeyword)
    if (value === "true" || value === "false" || value === "null") {
      return [];
    }

    return [{
      type: "BARE_WORD",
      value,
      endPos: pos,
      score: 2, // needs quoting
      repair: "bare word (should be quoted)",
    }];
  }

  /**
   * Try to match punctuation
   */
  private tryPunctuation(): TokenCandidate[] {
    const ch = this.peek();
    const punctMap: Record<string, string> = {
      "{": "BRACE_OPEN",
      "}": "BRACE_CLOSE",
      "[": "BRACKET_OPEN",
      "]": "BRACKET_CLOSE",
      ":": "COLON",
      ",": "COMMA",
      "-": "DASH",
    };

    const type = punctMap[ch];
    if (!type) return [];

    return [{
      type,
      value: ch,
      endPos: this.pos + 1,
      score: 0,
    }];
  }

  /**
   * Try to match whitespace
   */
  private tryWhitespace(): TokenCandidate[] {
    const ch = this.peek();
    if (!/[\s]/.test(ch)) return [];

    let pos = this.pos;
    let value = "";
    let hasNewline = false;

    while (pos < this.input.length && /[\s]/.test(this.input[pos])) {
      if (this.input[pos] === "\n") hasNewline = true;
      value += this.input[pos++];
    }

    return [{
      type: hasNewline ? "NEWLINE" : "WHITESPACE",
      value,
      endPos: pos,
      score: 0,
    }];
  }

  /**
   * Fallback: any single character as text
   */
  private tryTextChar(): TokenCandidate[] {
    return [{
      type: "TEXT",
      value: this.peek(),
      endPos: this.pos + 1,
      score: 0,
    }];
  }

  /**
   * Consume the best token candidate and advance position
   */
  consumeBest(): TokenCandidate | null {
    const candidates = this.nextTokenCandidates();
    if (candidates.length === 0) return null;

    const best = candidates[0];
    this.pos = best.endPos;
    return best;
  }

  /**
   * Get raw character(s) at current position for text mode
   * This preserves quotes and other characters as-is
   */
  consumeRawChar(): string {
    if (this.isEOF()) return "";
    const ch = this.input[this.pos++];
    return ch;
  }
}

