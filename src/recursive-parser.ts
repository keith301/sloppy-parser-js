import { Tokenizer, Token } from "./tokenizer";
import type { SegmentedBlock } from "./types";

/**
 * Recursive descent parser with backtracking and lookahead.
 * 
 * Grammar (informal):
 *   Document := (TextBlock | ObjectBlock)*
 *   ObjectBlock := JSONObject | YAMLObject
 *   JSONObject := '{' ... '}' | '[' ... ']' | FencedJSON
 *   YAMLObject := (Key ':' Value '\n')+ | FencedYAML
 */
export class RecursiveDescentParser {
  private tokenizer: Tokenizer;
  private blocks: SegmentedBlock[] = [];

  constructor(input: string) {
    this.tokenizer = new Tokenizer(input);
  }

  /**
   * Main entry point: parse the document
   */
  parse(): SegmentedBlock[] {
    this.parseDocument();
    return this.blocks;
  }

  /**
   * Document := (TextBlock | ObjectBlock)*
   */
  private parseDocument(): void {
    while (!this.tokenizer.isEOF()) {
      // Try to parse an object block first
      const objectBlock = this.tryParseObjectBlock();
      
      if (objectBlock) {
        this.blocks.push(objectBlock);
      } else {
        // Otherwise, accumulate text
        const textBlock = this.parseTextBlock();
        if (textBlock) {
          this.blocks.push(textBlock);
        }
      }
    }
  }

  /**
   * Try to parse an object block (with backtracking if it fails)
   * ObjectBlock := FencedJSON | FencedYAML | JSONObject | YAMLObject
   */
  private tryParseObjectBlock(): SegmentedBlock | null {
    const checkpoint = this.tokenizer.getPosition();

    // Try: ```json ... ```
    let result = this.tryParseFencedJSON();
    if (result) return result;
    this.tokenizer.seek(checkpoint);

    // Try: ```yaml ... ```
    result = this.tryParseFencedYAML();
    if (result) return result;
    this.tokenizer.seek(checkpoint);

    // Try: { ... } or [ ... ]
    result = this.tryParseJSONObject();
    if (result) return result;
    this.tokenizer.seek(checkpoint);

    // Try: key: value (YAML)
    result = this.tryParseYAMLObject();
    if (result) return result;
    this.tokenizer.seek(checkpoint);

    // All attempts failed
    return null;
  }

  /**
   * Parse text until we hit something that looks like an object
   */
  private parseTextBlock(): SegmentedBlock | null {
    let text = "";
    
    while (!this.tokenizer.isEOF()) {
      // Lookahead: check if we're about to hit an object
      if (this.looksLikeObjectStart()) {
        break;
      }

      const token = this.tokenizer.nextToken();
      if (token) {
        text += token.value;
      }
    }

    if (text.trim().length === 0) {
      return null;
    }

    return {
      type: "text",
      text: text.trim(),
    };
  }

  /**
   * Lookahead: does the next token(s) look like the start of an object?
   */
  private looksLikeObjectStart(): boolean {
    const fence = this.tokenizer.checkFence();
    if (fence) return true;

    const ch = this.tokenizer.peek();
    if (ch === "{" || ch === "[") return true;

    if (this.tokenizer.checkYamlKey()) return true;

    return false;
  }

  /**
   * Try to parse: ```json ... ```
   */
  private tryParseFencedJSON(): SegmentedBlock | null {
    const fence = this.tokenizer.checkFence();
    if (!fence || fence.type !== "fence-json") {
      return null;
    }

    // Consume the fence marker
    this.tokenizer.nextToken();
    this.tokenizer.skipWhitespace();

    // Capture everything until closing fence
    let raw = "";
    while (!this.tokenizer.isEOF()) {
      const closeFence = this.tokenizer.checkFence();
      if (closeFence && closeFence.type === "fence-end") {
        this.tokenizer.nextToken(); // consume closing fence
        break;
      }

      const token = this.tokenizer.nextToken();
      if (token) {
        raw += token.value;
      }
    }

    return {
      type: "object-candidate",
      raw: raw.trim(),
    };
  }

  /**
   * Try to parse: ```yaml ... ```
   */
  private tryParseFencedYAML(): SegmentedBlock | null {
    const fence = this.tokenizer.checkFence();
    if (!fence || fence.type !== "fence-yaml") {
      return null;
    }

    // Consume the fence marker
    this.tokenizer.nextToken();
    this.tokenizer.skipWhitespace();

    // Capture everything until closing fence
    let raw = "";
    while (!this.tokenizer.isEOF()) {
      const closeFence = this.tokenizer.checkFence();
      if (closeFence && closeFence.type === "fence-end") {
        this.tokenizer.nextToken(); // consume closing fence
        break;
      }

      const token = this.tokenizer.nextToken();
      if (token) {
        raw += token.value;
      }
    }

    return {
      type: "object-candidate",
      raw: raw.trim(),
    };
  }

  /**
   * Try to parse: { ... } or [ ... ]
   */
  private tryParseJSONObject(): SegmentedBlock | null {
    const ch = this.tokenizer.peek();
    if (ch !== "{" && ch !== "[") {
      return null;
    }

    const openChar = ch;
    const closeChar = ch === "{" ? "}" : "]";
    let depth = 0;
    let raw = "";

    while (!this.tokenizer.isEOF()) {
      const token = this.tokenizer.nextToken();
      if (!token) break;

      raw += token.value;

      if (token.type === "brace-open" || token.type === "bracket-open") {
        depth++;
      } else if (token.type === "brace-close" || token.type === "bracket-close") {
        depth--;
        
        if (depth === 0) {
          // Found matching close
          return {
            type: "object-candidate",
            raw: raw.trim(),
          };
        }
      }
    }

    // Unbalanced - this is a failed parse
    return null;
  }

  /**
   * Try to parse YAML object (key: value lines)
   */
  private tryParseYAMLObject(): SegmentedBlock | null {
    if (!this.tokenizer.checkYamlKey()) {
      return null;
    }

    let raw = "";
    let lastLineWasYaml = false;

    while (!this.tokenizer.isEOF()) {
      // Lookahead: if next line doesn't look like YAML, stop
      if (raw.length > 0 && !this.looksLikeYAMLContinuation()) {
        break;
      }

      const token = this.tokenizer.nextToken();
      if (!token) break;

      raw += token.value;

      // Track if we're still seeing YAML patterns
      if (token.type === "newline") {
        if (!lastLineWasYaml && raw.trim().length > 0) {
          break;
        }
        lastLineWasYaml = false;
      } else if (token.type === "colon") {
        lastLineWasYaml = true;
      }
    }

    if (raw.trim().length === 0) {
      return null;
    }

    return {
      type: "object-candidate",
      raw: raw.trim(),
    };
  }

  /**
   * Lookahead: does the next line look like YAML continuation?
   */
  private looksLikeYAMLContinuation(): boolean {
    const checkpoint = this.tokenizer.getPosition();
    
    // Skip whitespace
    this.tokenizer.skipWhitespace();
    
    // Check for blank line (ends YAML)
    if (this.tokenizer.peek() === "\n") {
      this.tokenizer.seek(checkpoint);
      return false;
    }

    // Check for new structure starting (ends YAML)
    if (this.tokenizer.peek() === "{" || this.tokenizer.peek() === "[") {
      this.tokenizer.seek(checkpoint);
      return false;
    }

    // Check for fence marker (ends YAML)
    if (this.tokenizer.checkFence()) {
      this.tokenizer.seek(checkpoint);
      return false;
    }

    // Check for YAML key or list marker
    const hasKey = this.tokenizer.checkYamlKey();
    const hasDash = this.tokenizer.peek() === "-" && this.tokenizer.peek(1) === " ";
    
    this.tokenizer.seek(checkpoint);
    return hasKey || hasDash;
  }
}

