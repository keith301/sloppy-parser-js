import { describe, it, expect } from "vitest";
import { parseJson, parseRawOutput } from "../src/index";

describe("sloppy-parser-js basic tests", () => {
  it("should parse a simple JSON object", () => {
    const input = '{"foo": "bar"}';
    const result = parseJson(input);
    expect(result).toEqual({ foo: "bar" });
  });

  it("should repair unquoted keys", () => {
    const input = "{foo: bar}";
    const result = parseJson(input);
    expect(result).toEqual({ foo: "bar" });
  });

  it("should handle text with JSON", () => {
    const input = 'Here is the data: {"tool": "test"}';
    const result = parseJson(input);
    expect(result).toEqual({ tool: "test" });
  });

  it("should return multiple objects as array", () => {
    const input = `
      First call: {tool: first, value: 1}
      Second call: {tool: second, value: 2}
    `;
    const result = parseJson(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("should return raw segmented output", () => {
    const input = `I'll do something
    {tool: test}
    Done!`;
    const result = parseRawOutput(input);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("text");
    expect(result[1].type).toBe("object");
    expect(result[2].type).toBe("text");
  });

  it("should return null for no objects", () => {
    const input = "Just some text here";
    const result = parseJson(input);
    expect(result).toBeNull();
  });
});

