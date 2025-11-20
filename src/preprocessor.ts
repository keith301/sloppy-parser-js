/**
 * Preprocessor does minimal cleanup without removing content:
 * - Normalize line endings
 * 
 * All text, including preambles and fence markers, is preserved.
 * The segmenter will use these as signals to find structured data.
 */
export function preprocess(input: string): string {
  let text = input;

  // Normalize line endings
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\r/g, "\n");

  return text;
}

