// Drives the real CLI as a subprocess with a real (never-ended) stdin pipe —
// the same shape a human typing at a terminal produces. An artificially
// piped-then-closed stdin (`printf 'y\ny\n' | node cli.mjs`) hits a real
// readline/promises quirk: once the underlying stream reaches "end", a
// second `question()` call never resolves, even though the LangGraph
// interrupt/resume mechanics underneath are correct. This test proves the
// actual interactive path — not the artifact of a bad test harness.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function runCli(dir, answers) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["src/cli.mjs", "--dir", dir], { cwd: ROOT });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stdout += d; });
    child.on("error", reject);

    (async () => {
      for (const answer of answers) {
        await new Promise((r) => setTimeout(r, 300));
        child.stdin.write(`${answer}\n`);
      }
      await new Promise((r) => setTimeout(r, 300));
      child.stdin.end();
    })();

    child.on("exit", (code) => resolve({ code, stdout }));
  });
}

test("auditor agent finds hardcoded hex, resolves via MCP, applies only approved fixes", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "auditor-agent-test-"));
  cpSync(join(ROOT, "demo-fixture"), tmpDir, { recursive: true });
  const fixturePath = join(tmpDir, "LegacyAlert.tsx");
  const original = readFileSync(fixturePath, "utf8");

  try {
    // Approve the first hex, reject the second.
    const { code, stdout } = await runCli(tmpDir, ["y", "n"]);

    assert.equal(code, 0);
    assert.match(stdout, /Exact match: color\.feedback\.error/);
    assert.match(stdout, /Exact match: color\.feedback\.success/);
    assert.match(stdout, /Done\. 1 fix\(es\) applied, 1 skipped\./);

    const patched = readFileSync(fixturePath, "utf8");
    assert.match(patched, /rgb\(var\(--feedback-error\)\)/, "approved fix was applied");
    assert.match(patched, /#15803D/, "rejected fix was left untouched");
    assert.doesNotMatch(patched, /#B91C1C/, "the approved hex should be gone");
  } finally {
    writeFileSync(fixturePath, original, "utf8"); // leave the committed fixture untouched
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
