import util from "node:util";

export interface TruncatorConfig {
  maxLines?: number;
  maxChars?: number;
  headLines?: number;
  tailLines?: number;
}

const DEFAULT_CONFIG: Required<TruncatorConfig> = {
  maxLines: 150,
  maxChars: 40000,
  headLines: 80,
  tailLines: 50,
};

export function formatValue(value: any): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`.trim();
  }
  try {
    return util.inspect(value, {
      depth: 5,
      colors: false,
      maxArrayLength: 100,
      breakLength: 80,
      compact: false,
    });
  } catch {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}

export function smartTruncate(
  text: string,
  config: TruncatorConfig = {}
): { text: string; truncated: boolean; originalLines: number; originalChars: number } {
  const merged = { ...DEFAULT_CONFIG, ...config };
  const originalChars = text.length;
  const lines = text.split("\n");
  const originalLines = lines.length;

  if (originalLines <= merged.maxLines && originalChars <= merged.maxChars) {
    return { text, truncated: false, originalLines, originalChars };
  }

  // Line-based head and tail truncation
  if (originalLines > merged.maxLines) {
    const head = lines.slice(0, merged.headLines);
    const tail = lines.slice(-merged.tailLines);
    const omitted = originalLines - (merged.headLines + merged.tailLines);

    const truncatedLines = [
      ...head,
      `\n... [Code Mode Output Spill: ${omitted} lines omitted to preserve LLM context] ...\n`,
      ...tail,
    ];
    let result = truncatedLines.join("\n");

    if (result.length > merged.maxChars) {
      result = result.slice(0, merged.maxChars) + `\n... [Output truncated at ${merged.maxChars} chars] ...`;
    }

    return { text: result, truncated: true, originalLines, originalChars };
  }

  // Character-based truncation
  if (originalChars > merged.maxChars) {
    const half = Math.floor(merged.maxChars / 2) - 120;
    const head = text.slice(0, half);
    const tail = text.slice(-half);
    const omittedChars = originalChars - (half * 2);
    const result = `${head}\n\n... [Code Mode Output Spill: ${omittedChars} characters omitted] ...\n\n${tail}`;
    return { text: result, truncated: true, originalLines, originalChars };
  }

  return { text, truncated: false, originalLines, originalChars };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.8);
}
