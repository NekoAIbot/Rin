const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const files = [
  "supabase/functions/telegram-webhook/index.ts",
  "supabase/functions/_shared/embed.ts",
  "supabase/functions/_shared/nl-actions.ts",
  "supabase/functions/_shared/passive-memory.ts",
  "supabase/functions/_shared/model-fallback.ts",
  "supabase/functions/_shared/gemini.ts",
];

for (const file of files) {
  const content = fs.readFileSync(file, "utf-8");
  const sf = ts.createSourceFile(file, content, ts.ScriptTarget.ES2022, true);

  let syntaxErrors = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let inBlockComment = false;
  let inLineComment = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inSingleQuote) {
      if (ch === "\\") { i++; continue; }
      if (ch === "'") inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      if (ch === "\\") { i++; continue; }
      if (ch === '"') inDoubleQuote = false;
      continue;
    }
    if (inTemplate) {
      if (ch === "\\") { i++; continue; }
      if (ch === "`") inTemplate = false;
      continue;
    }

    if (ch === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (ch === "/" && next === "/") { inLineComment = true; i++; continue; }
    if (ch === "'") { inSingleQuote = true; continue; }
    if (ch === '"') { inDoubleQuote = true; continue; }
    if (ch === "`") { inTemplate = true; continue; }

    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;
    else if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
  }

  const issues = [];
  if (braceDepth !== 0) issues.push("unbalanced braces: " + braceDepth);
  if (bracketDepth !== 0) issues.push("unbalanced brackets: " + bracketDepth);
  if (parenDepth !== 0) issues.push("unbalanced parens: " + parenDepth);

  // Walk the AST for syntax errors
  function walk(node) {
    if (node.kind === ts.SyntaxKind.Unknown && node.getChildCount() === 0) {
      // Might be an error token
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);

  if (issues.length === 0) {
    console.log("OK  " + path.relative(process.cwd(), file) + "  statements=" + sf.statements.length);
  } else {
    console.log("FAIL " + path.relative(process.cwd(), file) + "  " + issues.join("; "));
  }
}
