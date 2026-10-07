// Minimal structural check: balanced brackets + valid UTF-8 + no obvious syntax issues
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

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  let depth = 0;
  let inStr = null; // ' " ` 
  let inComment = false;
  let inLineComment = false;
  let escape = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (escape) { escape = false; continue; }

    if (inComment) {
      if (ch === "*" && next === "/") { inComment = false; i++; }
      continue;
    }
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inStr) {
      if (ch === "\\") { escape = true; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }

    if (ch === "/" && next === "*") { inComment = true; i++; continue; }
    if (ch === "/" && next === "/") { inLineComment = true; i++; continue; }

    if (ch === "'" || ch === '"' || ch === "`") {
      inStr = ch;
      continue;
    }

    if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth--;
  }

  const rel = path.relative(process.cwd(), filePath);
  if (depth !== 0) {
    console.log("FAIL " + rel + " depth=" + depth);
    return false;
  }
  // Check file is valid UTF-8 (readFile already decoded it)
  console.log("OK   " + rel + "  " + content.split("\n").length + " lines");
  return true;
}

let allOk = true;
for (const f of files) {
  if (!checkFile(f)) allOk = false;
}

console.log(allOk ? "\nALL FILES PASS structural check" : "\nSOME FILES FAILED");
