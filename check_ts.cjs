const ts = require("typescript");
const fs = require("fs");

const files = [
  "supabase/functions/_shared/nl-actions.ts",
  "supabase/functions/_shared/passive-memory.ts",
  "supabase/functions/telegram-webhook/index.ts",
  "supabase/functions/_shared/embed.ts",
  "supabase/functions/_shared/model-fallback.ts",
  "supabase/functions/_shared/gemini.ts",
];

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
  strict: false,
  noImplicitAny: false,
};

for (const file of files) {
  const content = fs.readFileSync(file, "utf-8");
  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile;

  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (fileName === file) {
      return ts.createSourceFile(fileName, content, languageVersion, true, ts.ScriptKind.TS);
    }
    return originalGetSourceFile.call(host, fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const program = ts.createProgram([file], compilerOptions, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  const errors = diagnostics.filter(
    (d) => d.category === ts.DiagnosticCategory.Error
  );

  const rel = file;
  if (errors.length === 0) {
    console.log("OK   " + rel);
  } else {
    console.log("ERRORS " + rel + " (" + errors.length + ")");
    for (const d of errors) {
      const sf = d.file;
      if (sf) {
        const pos = sf.getLineAndCharacterOfPosition(d.start);
        const msg = ts.flattenDiagnosticMessageText(d.messageText, " ");
        console.log("  " + pos.line + ":" + pos.character + " " + msg);
      } else {
        console.log("  " + ts.flattenDiagnosticMessageText(d.messageText, " "));
      }
    }
  }
}
