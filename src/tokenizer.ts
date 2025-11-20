/**
 * Token types for the character-by-character tokenizer
 */
export type TokenType =
  | "text"
  | "fence-json"
  | "fence-yaml"
  | "fence-end"
  | "brace-open"
  | "brace-close"
  | "bracket-open"
  | "bracket-close"
  | "colon"
  | "comma"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "word"
  | "whitespace"
  | "newline"
  | "dash";

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Character-by-character tokenizer with lookahead
 */
export class Tokenizer {
  private input: string;
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  getPosition(): number {
    return this.pos;
  }

  seek(position: number): void {
    this.pos = position;
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

  advance(): string {
    const ch = this.input[this.pos++];
    if (ch === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  skipWhitespace(): void {
    while (!this.isEOF() && /\s/.test(this.peek())) {
      this.advance();
    }
  }

  /**
   * Check if we're at the start of a fence marker
   */
  checkFence(): Token | null {
    if (this.peekAhead(3) === "```") {
      const start = this.pos;
      this.advance(); // `
      this.advance(); // `
      this.advance(); // `

      // Check for language identifier
      let lang = "";
      while (!this.isEOF() && this.peek() !== "\n" && /[a-z]/i.test(this.peek())) {
        lang += this.advance();
      }

      if (lang.toLowerCase() === "json") {
        return { type: "fence-json", value: "```json", position: start };
      } else if (lang.toLowerCase() === "yaml") {
        return { type: "fence-yaml", value: "```yaml", position: start };
      } else {
        return { type: "fence-end", value: "```", position: start };
      }
    }
    return null;
  }

  /**
   * Check if we're at a YAML key: pattern
   */
  checkYamlKey(): boolean {
    // Look ahead for pattern: word characters followed by colon
    let offset = 0;
    const startCol = this.col;

    // Must be at start of line or after whitespace
    if (this.col > 1 && !/\s/.test(this.peek(-1))) {
      return false;
    }

    // Skip leading whitespace
    while (/\s/.test(this.peek(offset)) && this.peek(offset) !== "\n") {
      offset++;
    }

    // Read word characters
    if (!/[a-zA-Z_]/.test(this.peek(offset))) {
      return false;
    }

    while (/[a-zA-Z0-9_-]/.test(this.peek(offset))) {
      offset++;
    }

    // Skip whitespace before colon
    while (this.peek(offset) === " " || this.peek(offset) === "\t") {
      offset++;
    }

    // Check for colon
    return this.peek(offset) === ":";
  }

  /**
   * Read a string literal (quoted)
   */
  readString(quote: string): Token {
    const start = this.pos;
    this.advance(); // opening quote
    let value = "";

    while (!this.isEOF() && this.peek() !== quote) {
      if (this.peek() === "\\") {
        this.advance();
        const escaped = this.advance();
        // Handle escape sequences
        switch (escaped) {
          case "n": value += "\n"; break;
          case "t": value += "\t"; break;
          case "r": value += "\r"; break;
          case "\\": value += "\\"; break;
          case quote: value += quote; break;
          default: value += escaped;
        }
      } else {
        value += this.advance();
      }
    }

    if (!this.isEOF()) {
      this.advance(); // closing quote
    }

    return { type: "string", value, position: start };
  }

  /**
   * Read a number
   */
  readNumber(): Token {
    const start = this.pos;
    let value = "";

    if (this.peek() === "-") {
      value += this.advance();
    }

    while (!this.isEOF() && /[0-9]/.test(this.peek())) {
      value += this.advance();
    }

    if (this.peek() === ".") {
      value += this.advance();
      while (!this.isEOF() && /[0-9]/.test(this.peek())) {
        value += this.advance();
      }
    }

    return { type: "number", value, position: start };
  }

  /**
   * Read a word (identifier, keyword, or bare string)
   */
  readWord(): Token {
    const start = this.pos;
    let value = "";

    while (!this.isEOF() && /[a-zA-Z0-9_-]/.test(this.peek())) {
      value += this.advance();
    }

    // Check for keywords
    if (value === "true" || value === "false") {
      return { type: "boolean", value, position: start };
    }
    if (value === "null") {
      return { type: "null", value, position: start };
    }

    return { type: "word", value, position: start };
  }

  /**
   * Get next token
   */
  nextToken(): Token | null {
    if (this.isEOF()) {
      return null;
    }

    // Check for fence markers
    const fence = this.checkFence();
    if (fence) return fence;

    const ch = this.peek();
    const start = this.pos;

    // Single character tokens
    switch (ch) {
      case "{":
        this.advance();
        return { type: "brace-open", value: "{", position: start };
      case "}":
        this.advance();
        return { type: "brace-close", value: "}", position: start };
      case "[":
        this.advance();
        return { type: "bracket-open", value: "[", position: start };
      case "]":
        this.advance();
        return { type: "bracket-close", value: "]", position: start };
      case ":":
        this.advance();
        return { type: "colon", value: ":", position: start };
      case ",":
        this.advance();
        return { type: "comma", value: ",", position: start };
      case "-":
        // Could be list item or negative number
        if (this.peek(1) === " " || this.peek(1) === "\n") {
          this.advance();
          return { type: "dash", value: "-", position: start };
        }
        return this.readNumber();
      case "\n":
        this.advance();
        return { type: "newline", value: "\n", position: start };
    }

    // Whitespace
    if (/[ \t]/.test(ch)) {
      let value = "";
      while (!this.isEOF() && /[ \t]/.test(this.peek())) {
        value += this.advance();
      }
      return { type: "whitespace", value, position: start };
    }

    // Strings
    if (ch === '"' || ch === "'") {
      return this.readString(ch);
    }

    // Numbers
    if (/[0-9-]/.test(ch)) {
      return this.readNumber();
    }

    // Words
    if (/[a-zA-Z_]/.test(ch)) {
      return this.readWord();
    }

    // Default: treat as text
    const value = this.advance();
    return { type: "text", value, position: start };
  }
}

