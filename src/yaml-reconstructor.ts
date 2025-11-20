/**
 * YAML Read-Repair Reconstructor
 * 
 * Soft grammar for YAML-ish content:
 * - Recognizes patterns: KEY:, KEY: VALUE, - ITEM
 * - Repairs by writing strict JSON
 * - Handles inconsistent indentation
 * - Parallel structure matching
 */

import { SoftTokenizer, TokenCandidate } from "./soft-tokenizer";

interface YAMLReconstructResult {
  success: boolean;
  json?: string;
  repairs: string[];
  warnings: string[];
  score: number;
}

/**
 * YAML reconstructor with fuzzy grammar matching
 */
export class YAMLReconstructor {
  private tokenizer: SoftTokenizer;
  private repairs: string[] = [];
  private score: number = 5; // YAML mode penalty
  private currentKey: string | null = null;
  private inArray: boolean = false;

  constructor(input: string) {
    this.tokenizer = new SoftTokenizer(input);
  }

  /**
   * Reconstruct YAML as JSON
   */
  reconstructYAML(): YAMLReconstructResult {
    try {
      const json = this.parseYAMLDocument();
      
      if (!json) {
        return {
          success: false,
          repairs: this.repairs,
          warnings: ["Failed to reconstruct YAML"],
          score: Infinity,
        };
      }

      JSON.parse(json); // Validate
      return {
        success: true,
        json,
        repairs: this.repairs,
        warnings: [],
        score: this.score,
      };
    } catch (e) {
      return {
        success: false,
        repairs: this.repairs,
        warnings: [`YAML reconstruction failed: ${e}`],
        score: Infinity,
      };
    }
  }

  /**
   * Parse YAML document into JSON object
   * Soft grammar: looks for KEY: VALUE patterns and - ITEM patterns
   */
  private parseYAMLDocument(): string | null {
    const obj: any = {};
    const DEBUG = process.env.DEBUG_YAML === '1';
    
    while (!this.tokenizer.isEOF()) {
      this.skipWhitespace();
      if (this.tokenizer.isEOF()) break;

      // Try to match: KEY: or - ITEM
      const checkpoint = this.tokenizer.getPosition();
      
      // Check for list item: - ITEM
      if (this.peekDash()) {
        if (DEBUG) console.log('Found dash at position', checkpoint);
        const item = this.parseListItem();
        if (DEBUG) console.log('Parsed item:', item, 'currentKey:', this.currentKey);
        
        if (item !== null && this.currentKey) {
          // Add to current key's array
          if (!obj[this.currentKey]) {
            obj[this.currentKey] = [];
          }
          if (!Array.isArray(obj[this.currentKey])) {
            obj[this.currentKey] = [obj[this.currentKey]];
          }
          obj[this.currentKey].push(item);
          if (DEBUG) console.log('Added item to', this.currentKey, ':', obj[this.currentKey]);
          this.repairs.push("added list item");
          this.score += 1;
        }
        continue;
      }

      // Check for KEY: VALUE pattern
      const keyValue = this.parseKeyValue();
      if (DEBUG) console.log('Parsed keyValue:', keyValue);
      
      if (keyValue) {
        const { key, value, hasValue } = keyValue;
        
        if (hasValue && value !== undefined) {
          // KEY: VALUE (inline value)
          obj[key] = value;
          this.currentKey = null;
          if (DEBUG) console.log('Set inline value for', key, '- cleared currentKey');
        } else {
          // KEY: (no value - prepare for nested structure)
          this.currentKey = key;
          if (DEBUG) console.log('Set currentKey to:', key);
          
          // Lookahead: is next line a list item?
          const nextIsList = this.peekNextLineIsList();
          if (DEBUG) console.log('nextIsList:', nextIsList);
          
          if (nextIsList) {
            obj[key] = [];
            this.inArray = true;
            if (DEBUG) console.log('Initialized array for', key);
          } else {
            obj[key] = {}; // Nested object
            if (DEBUG) console.log('Initialized object for', key);
          }
        }
        this.repairs.push("converted YAML key-value");
        this.score += 1;
        continue;
      }

      // Couldn't match anything - skip token
      this.tokenizer.consumeBest();
    }

    return JSON.stringify(obj, null, 2);
  }

  /**
   * Parse: KEY: [VALUE]
   * Returns {key, value, hasValue}
   */
  private parseKeyValue(): { key: string; value: any; hasValue: boolean } | null {
    const checkpoint = this.tokenizer.getPosition();
    
    // Get KEY
    const key = this.parseKey();
    if (!key) {
      this.tokenizer.seek(checkpoint);
      return null;
    }

    this.skipWhitespace();

    // Expect COLON
    if (!this.consume("COLON")) {
      this.tokenizer.seek(checkpoint);
      return null;
    }

    this.skipWhitespace();

    // Check if there's a VALUE on this line
    // If next token is newline, dash (list start), or EOF, there's no inline value
    if (this.peek("NEWLINE") || this.peek("DASH") || this.tokenizer.isEOF()) {
      // No value - KEY: 
      return { key, value: undefined, hasValue: false };
    }

    // Has inline value - parse it
    const value = this.parseValue();
    return { key, value, hasValue: true };
  }

  /**
   * Parse: - ITEM
   * Returns the item value
   */
  private parseListItem(): any {
    // Consume dash
    if (!this.consume("DASH")) {
      return null;
    }

    this.skipWhitespace();

    // Parse the item value
    return this.parseValue();
  }

  /**
   * Parse KEY (bare word or quoted string)
   */
  private parseKey(): string | null {
    const candidates = this.tokenizer.nextTokenCandidates();
    if (candidates.length === 0) return null;

    const token = candidates[0];

    if (token.type === "STRING") {
      this.tokenizer.consumeBest();
      return token.value;
    }

    if (token.type === "BARE_WORD") {
      this.tokenizer.consumeBest();
      return token.value;
    }

    return null;
  }

  /**
   * Parse VALUE (string, number, boolean, null, or nested object)
   * In YAML, values can be bare words
   */
  private parseValue(): any {
    const candidates = this.tokenizer.nextTokenCandidates();
    if (candidates.length === 0) return null;

    const token = candidates[0];

    // STRING
    if (token.type === "STRING") {
      this.tokenizer.consumeBest();
      return token.value;
    }

    // NUMBER
    if (token.type === "NUMBER") {
      this.tokenizer.consumeBest();
      return parseFloat(token.value);
    }

    // BOOLEAN
    if (token.type === "BOOLEAN") {
      this.tokenizer.consumeBest();
      return token.value === "true";
    }

    // NULL
    if (token.type === "NULL") {
      this.tokenizer.consumeBest();
      return null;
    }

    // INLINE JSON OBJECT {key: value}
    if (token.type === "BRACE_OPEN") {
      return this.parseInlineJSON();
    }

    // BARE_WORD (treat as string in YAML)
    if (token.type === "BARE_WORD") {
      this.tokenizer.consumeBest();
      return token.value;
    }

    // Default
    return null;
  }

  /**
   * Parse inline JSON object: {key: value}
   * This handles YAML with inline JSON like: details: {likes: coffee}
   */
  private parseInlineJSON(): any {
    // Use the JSON reconstructor for this
    const { ReadRepairReconstructor } = require("./reconstructor");
    
    // Capture from { to }
    let braceDepth = 0;
    const start = this.tokenizer.getPosition();
    let jsonStr = "";
    
    while (!this.tokenizer.isEOF()) {
      const token = this.tokenizer.consumeBest();
      if (!token) break;
      
      jsonStr += token.value;
      
      if (token.type === "BRACE_OPEN") braceDepth++;
      if (token.type === "BRACE_CLOSE") {
        braceDepth--;
        if (braceDepth === 0) break;
      }
    }

    try {
      const reconstructor = new ReadRepairReconstructor(jsonStr);
      const result = reconstructor.reconstructJSON();
      if (result.success && result.json) {
        const parsed = JSON.parse(result.json);
        this.repairs.push("parsed inline JSON in YAML");
        this.score += 2;
        return parsed;
      }
    } catch (e) {
      // Fall back to string
    }

    return jsonStr;
  }

  /**
   * Lookahead: is next non-whitespace a dash (list item)?
   */
  private peekNextLineIsList(): boolean {
    const checkpoint = this.tokenizer.getPosition();
    
    // Skip to next line
    while (!this.tokenizer.isEOF()) {
      const token = this.tokenizer.consumeBest();
      if (!token || token.type === "NEWLINE") break;
    }

    this.skipWhitespace();
    const isDash = this.peekDash();
    
    this.tokenizer.seek(checkpoint);
    return isDash;
  }

  /**
   * Check if next token is a dash
   */
  private peekDash(): boolean {
    const candidates = this.tokenizer.nextTokenCandidates();
    return candidates.length > 0 && candidates[0].type === "DASH";
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

