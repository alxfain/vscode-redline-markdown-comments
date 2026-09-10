// Launches a real VS Code with the extension under development and runs test/integration/suite.js inside it.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runTests } from "@vscode/test-electron";

const extensionDevelopmentPath = resolve(import.meta.dirname, "..", "..");
const extensionTestsPath = resolve(import.meta.dirname, "suite.js");

const workspace = mkdtempSync(join(tmpdir(), "redline-it-"));
writeFileSync(join(workspace, "demo.md"), "# Demo\n\nSome text to comment on.\n\n" + "Paragraph.\n\n".repeat(200));
for (const name of ["a.md", "b.md"]) writeFileSync(join(workspace, name), `# ${name}\n`);

try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    // Short paths: VS Code's IPC socket lives under user-data-dir and macOS limits socket paths to 103 chars.
    launchArgs: [workspace, "--user-data-dir", "/tmp/rl-it-user", "--extensions-dir", "/tmp/rl-it-ext", "--disable-workspace-trust"],
    extensionTestsEnv: { REDLINE_IT_WORKSPACE: workspace, REDLINE_IT_COMMAND: process.env.REDLINE_IT_COMMAND ?? "", REDLINE_IT_VIEWTYPE: process.env.REDLINE_IT_VIEWTYPE ?? "" },
  });
} catch (error) {
  console.error("integration run failed:", error);
  process.exit(1);
}
