import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
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

  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let inBlockComment = false;
  let inLineComment = false;
  let inRegex = false;
  let lastChar = "";

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inBlockComment) {
      if (ch === "*" && next === "/") { inBlockComment = false; i++; }
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
    if (inRegex) {
      if (ch === "\\") { i++; continue; }
      if (ch === "/") inRegex = false;
      continue;
    }

    if (ch === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (ch === "/" && next === "/") { inLineComment = true; i++; continue; }

    // Regex detection: / followed by non-newline when previous non-space was ( [ { , ; : ? ! & | || &&
    if (ch === "/" && !inSingleQuote && !inDoubleQuote && !inTemplate) {
      const prevNonSpace = (() => {
        let j = i - 1;
        while (j >= 0 && content[j] === " ") j--;
        return j >= 0 ? content[j] : "";
      })();
      if ("({[,:;?!&|]".includes(prevNonSpace) || prevNonSpace === "") {
        inRegex = true;
        continue;
      }
    }

    if (ch === "'" && !inDoubleQuote && !inTemplate && !inRegex) { inSingleQuote = !inSingleQuote; continue; }
    if (ch === '"' && !inSingleQuote && !inTemplate && !inRegex) { inDoubleQuote = !inDoubleQuote; continue; }
    if (ch === "`" && !inSingleQuote && !inDoubleQuote && !inRegex) { inTemplate = !inTemplate; continue; }

    if (!inSingleQuote && !inDoubleQuote && !inTemplate && !inRegex && !inBlockComment && !inLineComment) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
      else if (ch === "[") bracketDepth++;
      else if (ch === "]") bracketDepth--;
      else if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth--;
    }
  }

  const issues = [];
  if (braceDepth !== 0) issues.push("unbalanced braces: " + braceDepth);
  if (bracketDepth !== 0) issues.push("unbalanced brackets: " + bracketDepth);
  if (parenDepth !== 0) issues.push("unbalanced parens: " + parenDepth);

  if (issues.length === 0) {
    console.log("OK  " + path.relative(process.cwd(), file) + "  stmts=" + sf.statements.length);
  } else {
    console.log("FAIL " + path.relative(process.cwd(), file) + "  " + issues.join("; "));
  }
}
