/**
 * Read-Repair Reconstructor
 * 
 * Takes a token stream and reconstructs strict JSON by:
 * 1. Matching fuzzy grammar patterns
 * 2. Writing out the valid parts
 * 3. Dropping invalid parts (comments, trailing junk, etc.)
 */

import { SoftTokenizer, TokenCandidate } from "./soft-tokenizer";
import { debug } from "./debug";

interface ReconstructResult {
  success: boolean;
  json?: string;
  repairs: string[];
  warnings: string[];
  score: number;
}

/**
 * Grammar patterns for soft parsing
 */
export class ReadRepairReconstructor {
  private tokenizer: SoftTokenizer;
  private repairs: string[] = [];
  private score: number = 0;

  constructor(input: string) {
    this.tokenizer = new SoftTokenizer(input);
  }

  /**
   * Reconstruct as JSON object or array
   */
  reconstructJSON(): ReconstructResult {
    this.skipWhitespace();
    
    // Check what we're parsing - object or array?
    const candidates = this.tokenizer.nextTokenCandidates();
    let json: string | null = null;
    
    if (candidates.length > 0) {
      if (candidates[0].type === "BRACKET_OPEN") {
        json = this.parseArray();
      } else {
        json = this.parseObject();
      }
    }
    
    debug.verbose('reconstructor', 'Generated JSON:', json);
    
    if (!json) {
      debug.verbose('reconstructor', 'parseObject/parseArray returned null');
      return {
        success: false,
        repairs: this.repairs,
        warnings: ["Failed to reconstruct as JSON"],
        score: Infinity,
      };
    }

    try {
      JSON.parse(json); // Validate
      debug.basic('reconstructor', 'Successfully reconstructed JSON with', this.repairs.length, 'repairs');
      return {
        success: true,
        json,
        repairs: this.repairs,
        warnings: [],
        score: this.score,
      };
    } catch (e) {
      debug.verbose('reconstructor', 'JSON parse error:', e);
      return {
        success: false,
        repairs: this.repairs,
        warnings: [`Invalid JSON: ${e}`],
        score: Infinity,
      };
    }
  }

  /**
   * Parse: { KEY_VALUE, KEY_VALUE, ... }
   */
  private parseObject(): string | null {
    this.skipWhitespace();
    
    if (!this.consume("BRACE_OPEN")) {
      return null;
    }

    const parts: string[] = ["{"];
    let needsComma = false;

    while (!this.tokenizer.isEOF()) {
      this.skipWhitespace();

      // Check for closing brace
      if (this.peek("BRACE_CLOSE")) {
        this.tokenizer.consumeBest();
        parts.push("}");
        return parts.join("");
      }

      // Handle comma between properties
      if (needsComma) {
        if (this.consume("COMMA")) {
          // Comma exists in input - use it
          parts.push(",");
        } else {
          // Missing comma - add it
          parts.push(",");
          this.repairs.push("added missing comma");
          this.score += 1;
        }
        this.skipWhitespace(); // Skip whitespace after comma
      }

      // Parse KEY_VALUE
      const keyValue = this.parseKeyValue();
      if (keyValue) {
        parts.push(keyValue);
        needsComma = true;
      } else {
        // Skip invalid content until we find something useful
        this.tokenizer.consumeBest();
      }
    }

    // Unclosed brace - close it
    parts.push("}");
    this.repairs.push("added missing closing brace");
    this.score += 3;
    return parts.join("");
  }

  /**
   * Parse: KEY : VALUE [# COMMENT]
   */
  private parseKeyValue(): string | null {
    this.skipWhitespace();

    // Parse KEY
    const key = this.parseKey();
    if (!key) return null;

    this.skipWhitespace();

    // Parse SEPARATOR (:)
    if (!this.consume("COLON")) {
      // Missing colon - this might be a bare word like "btw I love YAML"
      // Treat as key with null value
      this.repairs.push("added missing colon and null value");
      this.score += 3;
      return `${key}: null`;
    }

    this.skipWhitespace();

    // Parse VALUE
    const value = this.parseValue();
    
    // Skip trailing COMMENT if present
    this.skipComment();

    return `${key}: ${value}`;
  }

  /**
   * Parse KEY: STRING | BARE_WORD | MULTIWORD_PHRASE (if no colon follows)
   */
  private parseKey(): string | null {
    const candidates = this.tokenizer.nextTokenCandidates();
    if (candidates.length === 0) return null;

    const token = candidates[0];

    if (token.type === "STRING") {
      this.tokenizer.consumeBest();
      return `"${token.value}"`;
    }

    if (token.type === "BARE_WORD") {
      const checkpoint = this.tokenizer.getPosition();
      let keyParts: string[] = [token.value];
      this.tokenizer.consumeBest();

      // Lookahead: check next token WITHOUT skipping whitespace first
      const nextCands = this.tokenizer.nextTokenCandidates();
      const hasColon = nextCands.length > 0 && 
                      (nextCands[0].type === "COLON" ||
                       (nextCands[0].type === "WHITESPACE" && 
                        nextCands.length > 1 && 
                        nextCands[1]?.type === "COLON"));
      
      if (!hasColon) {
        // No colon - consume more words until newline or structural char
        while (!this.tokenizer.isEOF()) {
          const next = this.tokenizer.nextTokenCandidates();
          if (next.length === 0) break;
          
          const nextToken = next[0];
          if (nextToken.type === "NEWLINE" || 
              nextToken.type === "BRACE_CLOSE" ||
              nextToken.type === "COMMA") {
            break;
          }
          
          if (nextToken.type === "BARE_WORD") {
            this.tokenizer.consumeBest();
            keyParts.push(nextToken.value);
          } else if (nextToken.type === "WHITESPACE") {
            this.tokenizer.consumeBest();
            keyParts.push(" ");
          } else {
            break;
          }
        }
      }

      const fullKey = keyParts.join("").trim();
      this.repairs.push("quoted bare key");
      this.score += 2;
      return `"${fullKey}"`;
    }

    return null;
  }

  /**
   * Parse VALUE: STRING | NUMBER | BOOLEAN | NULL | OBJECT | ARRAY
   * In VALUE context, we know what we're looking for, so repairs are deterministic
   */
  private parseValue(): string {
    const candidates = this.tokenizer.nextTokenCandidates();
    if (candidates.length === 0) return "null";

    const token = candidates[0];

    // STRING
    if (token.type === "STRING") {
      this.tokenizer.consumeBest();
      return `"${token.value}"`;
    }

    // NUMBER
    if (token.type === "NUMBER") {
      this.tokenizer.consumeBest();
      return token.value;
    }

    // BOOLEAN
    if (token.type === "BOOLEAN") {
      this.tokenizer.consumeBest();
      return token.value;
    }

    // NULL
    if (token.type === "NULL") {
      this.tokenizer.consumeBest();
      return "null";
    }

    // OBJECT
    if (token.type === "BRACE_OPEN") {
      const obj = this.parseObject();
      return obj || "{}";
    }

    // ARRAY
    if (token.type === "BRACKET_OPEN") {
      const arr = this.parseArray();
      return arr || "[]";
    }

    // BARE_WORD (unquoted string value)
    // We're in VALUE context, so we know this should be a quoted string
    // Consume all text until we hit a structural boundary (comma, brace, bracket)
    if (token.type === "BARE_WORD" || token.type === "NEWLINE") {
      let value = "";
      
      // Keep consuming tokens that can be part of a bare value
      while (this.tokenizer.nextTokenCandidates().length > 0) {
        const cand = this.tokenizer.nextTokenCandidates()[0];
        
        // Stop at end-of-value structural tokens
        if (cand.type === "COMMA" || 
            cand.type === "BRACE_CLOSE" || 
            cand.type === "BRACKET_CLOSE") {
          break;
        }
        
        // Skip comments
        if (cand.type === "TEXT" && cand.value === "#") {
          this.skipCommentRestOfLine();
          this.repairs.push("removed inline comment after value");
          this.score += 1;
          break;
        }
        
        // Consume value-like tokens (including newlines for multiline values)
        if (cand.type === "BARE_WORD" || 
            cand.type === "WHITESPACE" ||
            cand.type === "NEWLINE" ||
            cand.type === "NUMBER" ||
            cand.type === "TEXT") {
          this.tokenizer.consumeBest();
          value += cand.value;
        } else {
          break;
        }
      }
      
      if (value.length === 0) return "null";
      
      this.repairs.push("quoted bare value");
      this.score += 2;
      return `"${value.trim()}"`;
    }

    // TEXT (emoji, unicode, etc) - treat as string value
    if (token.type === "TEXT") {
      // Consume all consecutive TEXT tokens to handle multi-char unicode/emoji
      let value = "";
      while (this.tokenizer.nextTokenCandidates().length > 0) {
        const cand = this.tokenizer.nextTokenCandidates()[0];
        if (cand.type !== "TEXT") break;
        this.tokenizer.consumeBest();
        value += cand.value;
      }
      
      this.repairs.push("quoted unicode/emoji value");
      this.score += 1;
      return `"${value}"`;
    }

    // Default: null
    return "null";
  }

  /**
   * Parse: [ VALUE, VALUE, ... ]
   */
  private parseArray(): string | null {
    if (!this.consume("BRACKET_OPEN")) {
      return null;
    }

    const parts: string[] = ["["];
    let needsComma = false;

    while (!this.tokenizer.isEOF()) {
      this.skipWhitespace();

      if (this.peek("BRACKET_CLOSE")) {
        this.tokenizer.consumeBest();
        parts.push("]");
        return parts.join("");
      }

      if (needsComma) {
        if (!this.consume("COMMA")) {
          // Missing comma
          parts.push(",");
          this.repairs.push("added missing comma");
          this.score += 1;
        } else {
          parts.push(",");
        }
        // Skip whitespace after comma
        this.skipWhitespace();
      }

      const value = this.parseValue();
      parts.push(value);
      needsComma = true;
    }

    parts.push("]");
    this.repairs.push("added missing closing bracket");
    this.score += 3;
    return parts.join("");
  }

  /**
   * Skip whitespace and newlines
   */
  private skipWhitespace(): void {
    let candidates = this.tokenizer.nextTokenCandidates();
    while (candidates.length > 0 && 
           (candidates[0].type === "WHITESPACE" || candidates[0].type === "NEWLINE")) {
      this.tokenizer.consumeBest();
      candidates = this.tokenizer.nextTokenCandidates();
    }
  }

  /**
   * Skip comment tokens (# or //)
   */
  private skipComment(): void {
    this.skipWhitespace();
    const candidates = this.tokenizer.nextTokenCandidates();
    if (candidates.length === 0) return;

    // Check if next token starts with # 
    const token = candidates[0];
    if (token.type === "TEXT" && token.value === "#") {
      this.skipCommentRestOfLine();
    }
  }

  /**
   * Skip rest of line (for comment handling)
   */
  private skipCommentRestOfLine(): void {
    while (!this.tokenizer.isEOF()) {
      const next = this.tokenizer.nextTokenCandidates();
      if (next.length === 0) break;
      if (next[0].type === "NEWLINE") {
        this.tokenizer.consumeBest();
        break;
      }
      this.tokenizer.consumeBest();
    }
    this.repairs.push("removed comment");
    this.score += 1;
  }

  /**
   * Check if next token is of given type
   */
  private peek(type: string): boolean {
    const candidates = this.tokenizer.nextTokenCandidates();
    return candidates.length > 0 && candidates[0].type === type;
  }

  /**
   * Consume a token of given type if present
   */
  private consume(type: string): boolean {
    if (this.peek(type)) {
      this.tokenizer.consumeBest();
      return true;
    }
    return false;
  }
}

