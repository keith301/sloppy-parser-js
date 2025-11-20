import type { RepairResult } from "./types";
import { ReadRepairReconstructor } from "./reconstructor";
import { YAMLReconstructor } from "./yaml-reconstructor";
import { debug } from "./debug";

/**
 * Repairs an object-candidate string into strict JSON.
 * Tries read-repair reconstruction first, then YAML reconstructor.
 * Returns the best result based on score.
 */
export function repairObjectCandidate(raw: string): RepairResult {
  debug.verbose('repairer', 'Input:', JSON.stringify(raw));
  
  // Try JSON read-repair reconstruction
  const reconstructor = new ReadRepairReconstructor(raw);
  const reconstructResult = reconstructor.reconstructJSON();
  
  debug.verbose('repairer', 'JSON reconstruct success:', reconstructResult.success);
  
  if (reconstructResult.success && reconstructResult.json) {
    try {
      const parsed = JSON.parse(reconstructResult.json);
      debug.basic('repairer', 'JSON reconstruction succeeded, repairs:', reconstructResult.repairs.length);
      return {
        success: true,
        object: parsed,
        repairedText: reconstructResult.json,
        warnings: [],
        repairs: reconstructResult.repairs,
        score: reconstructResult.score,
        mode: "json-ish",
      };
    } catch (e) {
      debug.verbose('repairer', 'JSON parse failed:', e);
      // JSON parse failed - fall through to YAML
    }
  }

  // Try YAML read-repair reconstruction  
  const yamlReconstructor = new YAMLReconstructor(raw);
  const yamlReconstructResult = yamlReconstructor.reconstructYAML();
  
  if (yamlReconstructResult.success && yamlReconstructResult.json) {
    try {
      const parsed = JSON.parse(yamlReconstructResult.json);
      // YAML reconstruction succeeded - return it
      return {
        success: true,
        object: parsed,
        repairedText: yamlReconstructResult.json,
        warnings: [],
        repairs: yamlReconstructResult.repairs,
        score: yamlReconstructResult.score,
        mode: "yaml-ish",
      };
    } catch (e) {
      // YAML parse failed - fall through
    }
  }

  // Both reconstructors failed - return failure
  debug.basic('repairer', 'All reconstruction attempts failed');
  return {
    success: false,
    warnings: ["All reconstruction attempts failed"],
    repairs: [],
    score: Infinity,
    mode: "json-ish",
  };
}

/**
 * Attempt to repair as JSON-ish structure
 */
function repairJsonIsh(raw: string): RepairResult {
  const warnings: string[] = [];
  const repairs: string[] = [];
  let text = raw;
  let score = 0;

  // Remove comments (// and #)
  if (text.includes("//")) {
    text = text.replace(/\/\/.*/g, "");
    repairs.push("removed // comments");
    score += 1;
  }
  if (text.includes("#")) {
    // Remove # comments (inline style with whitespace before #)
    // Match whitespace + # + rest of line
    text = text.replace(/\s+#.*/g, "");
    repairs.push("removed # comments");
    score += 1;
  }

  // Handle bare words (keys without colons) - add colon and null
  const bareWordsBefore = text;
  text = text.replace(/\n\s+([a-zA-Z_$][a-zA-Z0-9_$ ]+)\s*\n/g, '\n  "$1": null,\n');
  if (text !== bareWordsBefore) {
    repairs.push("added null values for keys without colons");
    score += 3;
  }

  // Quote unquoted keys (word followed by colon)
  const keysBefore = text;
  text = text.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  if (text !== keysBefore) {
    repairs.push("quoted unquoted keys");
    score += 2;
  }

  // Quote unquoted string values (including emoji and unicode)
  // First pass: explicitly handle values with comments
  text = text.replace(/:(\s*)([a-zA-Z_$\u{1F300}-\u{1F9FF}\w]+)\s+(#[^\n]*)/gu, (match, space1, word, comment) => {
    // Value with trailing comment - strip comment and quote value
    if (word === "true" || word === "false" || word === "null" || /^-?\d+(\.\d+)?$/.test(word)) {
      return `:${space1}${word}`;
    }
    return `:${space1}"${word}"`;
  });

  // Second pass: quote remaining bare values
  const valuesBefore = text;
  text = text.replace(/:(\s*)([a-zA-Z_$\u{1F300}-\u{1F9FF}][^\s,}\]]*?)(\s*[,}\]\n])/gu, (match, space1, word, space2) => {
    if (word === "true" || word === "false" || word === "null" || /^-?\d+(\.\d+)?$/.test(word)) {
      return match;
    }
    return `:${space1}"${word}"${space2}`;
  });
  if (text !== valuesBefore) {
    repairs.push("quoted unquoted values");
    score += 2;
  }

  // Add missing commas between values and next keys
  // Pattern: value (word or ") followed by space and key (word followed by colon)
  const commasBefore = text;
  text = text.replace(/([a-zA-Z0-9_$"}])\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1, "$2":');
  if (text !== commasBefore) {
    repairs.push("added missing commas between properties");
    score += 2;
  }

  // Add missing commas between properties on different lines
  if (/([}\]"\d])\s*\n\s*(["{[])/.test(text)) {
    text = text.replace(/([}\]"\d])\s*\n\s*(["{[])/g, "$1,\n$2");
    repairs.push("added missing commas after newlines");
    score += 1;
  }

  // Remove trailing commas
  if (/,(\s*[}\]])/.test(text)) {
    text = text.replace(/,(\s*[}\]])/g, "$1");
    repairs.push("removed trailing commas");
    score += 1;
  }

  // Try to parse
  try {
    const parsed = JSON.parse(text);
    return {
      success: true,
      object: parsed,
      repairedText: text,
      warnings,
      repairs,
      score,
      mode: "json-ish",
    };
  } catch (err) {
    warnings.push(`JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      success: false,
      warnings,
      repairs,
      score: Infinity,
      mode: "json-ish",
    };
  }
}

/**
 * Attempt to repair as YAML-ish structure by reading and building strict JSON as we go.
 * This is a streaming reader that constructs a JSON object incrementally.
 */
function repairYamlIsh(raw: string): RepairResult {
  const warnings: string[] = [];
  const repairs: string[] = [];
  let score = 5; // YAML mode penalty

  try {
    const lines = raw.split("\n");
    const stack: any[] = [{}]; // Start with root object
    const indentStack: number[] = [0];
    let currentKey: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const indent = line.search(/\S/);
      const trimmed = line.trim();

      // Handle list items
      if (trimmed.startsWith("-")) {
        const item = trimmed.substring(1).trim();
        
        // Ensure current context is an array
        if (currentKey && !Array.isArray(stack[stack.length - 1][currentKey])) {
          stack[stack.length - 1][currentKey] = [];
        }

        const value = parseValue(item);
        if (currentKey) {
          stack[stack.length - 1][currentKey].push(value);
        } else {
          // No current key - might be continuing a list from before
          // Find the last array in current object
          const current = stack[stack.length - 1];
          const keys = Object.keys(current);
          const lastKey = keys[keys.length - 1];
          if (lastKey && Array.isArray(current[lastKey])) {
            current[lastKey].push(value);
            currentKey = lastKey; // Restore context
          }
        }
        
        repairs.push("converted list item");
        score += 1;
        continue;
      }

      // Handle key: value pairs
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const valueStr = trimmed.substring(colonIndex + 1).trim();

        // Pop stack if we've dedented
        while (indent < indentStack[indentStack.length - 1] && stack.length > 1) {
          stack.pop();
          indentStack.pop();
        }

        const current = stack[stack.length - 1];

        if (valueStr === "") {
          // Key with no value - next line might be a nested object or array
          currentKey = key;
          
          // Peek ahead to see if next line is a list
          if (i + 1 < lines.length && lines[i + 1].trim().startsWith("-")) {
            current[key] = [];
          } else {
            current[key] = {};
            stack.push(current[key]);
            indentStack.push(indent + 2);
          }
        } else {
          // Key with inline value
          current[key] = parseValue(valueStr);
          currentKey = null;
        }

        repairs.push("converted key-value pair");
        score += 1;
      }
    }

    // Build final JSON text
    const jsonText = JSON.stringify(stack[0], null, 2);
    const parsed = JSON.parse(jsonText);

    return {
      success: true,
      object: parsed,
      repairedText: jsonText,
      warnings,
      repairs,
      score,
      mode: "yaml-ish",
    };
  } catch (err) {
    warnings.push(`YAML parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      success: false,
      warnings,
      repairs,
      score: Infinity,
      mode: "yaml-ish",
    };
  }
}

/**
 * Parse a YAML value into its appropriate JavaScript type
 */
function parseValue(valueStr: string): any {
  const trimmed = valueStr.trim();

  // Boolean
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Null
  if (trimmed === "null" || trimmed === "~") return null;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // String - remove quotes if present
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // Unquoted string
  return trimmed;
}

