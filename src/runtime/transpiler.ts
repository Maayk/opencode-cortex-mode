export function transpileTypeScript(code: string): string {
  // Prefer Bun's native transpiler when available
  if (typeof Bun !== "undefined" && (Bun as any).Transpiler) {
    try {
      const transpiler = new (Bun as any).Transpiler({ loader: "ts" });
      return transpiler.transformSync(code);
    } catch {
      // fall through to the Node path below
    }
  }

  // Fall back to the typescript package when present in Node
  try {
    const ts = require("typescript");
    if (ts && ts.transpileModule) {
      const output = ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
        },
      });
      return output.outputText;
    }
  } catch {
    // fall through to the type stripper below
  }

  // Last resort: dependency-free stripper for standard TS annotations
  return stripTypeScriptTypes(code);
}

export function stripTypeScriptTypes(code: string): string {
  let result = code;

  // Remove import type statements
  result = result.replace(/import\s+type\s+[^;]+;/g, "");
  result = result.replace(/import\s+{[^}]*type\s+[^}]*}\s+from\s+['"][^'"]+['"];?/g, "");

  // Remove interface declarations
  result = result.replace(/export\s+interface\s+[\w$]+(?:<[^>]+>)?(?:\s+extends\s+[^{]+)?\s*{[\s\S]*?}/g, "");
  result = result.replace(/interface\s+[\w$]+(?:<[^>]+>)?(?:\s+extends\s+[^{]+)?\s*{[\s\S]*?}/g, "");

  // Remove type alias declarations
  result = result.replace(/export\s+type\s+[\w$]+(?:<[^>]+>)?\s*=[\s\S]*?;/g, "");
  result = result.replace(/type\s+[\w$]+(?:<[^>]+>)?\s*=[\s\S]*?;/g, "");

  // Remove 'as <Type>' assertions
  result = result.replace(/\s+as\s+(?:string|number|boolean|any|unknown|void|never|object|Record<[^>]+>|Array<[^>]+>|[\w$]+)(?:\[\])?/g, "");

  // Remove generic type params in function calls: func<T>(...) -> func(...)
  result = result.replace(/<[A-Za-z0-9_$,\s<>\[\]]+>(?=\s*\()/g, "");

  // Remove variable type annotations: const x: string = ... or let y: number;
  result = result.replace(/(const|let|var)\s+([\w$]+)\s*:\s*(?:string|number|boolean|any|unknown|void|never|object|Record<[^>]+>|Array<[^>]+>|Promise<[^>]+>|[\w$]+(?:\[\])?)\s*(=|;)/g, "$1 $2 $3");

  // Remove parameter type annotations in function args: (a: string, b: number)
  result = result.replace(/(\(|\,)\s*([\w$]+)\s*:\s*(?:string|number|boolean|any|unknown|void|never|object|Record<[^>]+>|Array<[^>]+>|Promise<[^>]+>|[\w$]+(?:\[\])?)\s*([,)])/g, "$1 $2$3");

  return result;
}
