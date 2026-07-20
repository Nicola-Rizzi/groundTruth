#!/usr/bin/env node
/**
 * Harness self-test — verifies the eval harness itself, with NO API key.
 *
 * An eval is only trustworthy if it (a) passes correct output and (b) fails
 * regressed output. We prove both by injecting a stub model:
 *   Scenario A — canned output matches the golden set → suite must PASS.
 *   Scenario B — canned output has a wrong date + a degraded title → suite must FAIL,
 *                and the report must pinpoint the failing checks.
 *
 * Run:  npm run eval:smart-add:selftest   (offline, deterministic)
 */
import { CASES, REF } from "./cases.mjs";
import { runSuite, formatReport } from "./harness.mjs";

// ── Canned "faithful model" outputs, keyed by input ───────────────────────────
const GOOD = {
  "remind me to call the dentist next Tuesday, it's urgent":
    { isTask: true, title: "Call the dentist", priority: "high", dueDate: "2026-06-23", tags: ["health"] },
  "buy oat milk tomorrow":
    { isTask: true, title: "Buy oat milk", priority: "medium", dueDate: "2026-06-16", tags: ["shopping"] },
  "read the new Pynchon novel":
    { isTask: true, title: "Read the new Pynchon novel", priority: "medium", dueDate: null, tags: ["reading"] },
  "someday maybe reorganize the garage, no rush":
    { isTask: true, title: "Reorganize the garage", priority: "low", dueDate: null, tags: ["home"] },
  "email the design team about the new logo by Friday":
    { isTask: true, title: "Email the design team about the logo", priority: "medium", dueDate: "2026-06-19", tags: ["work"] },
  "i really need to finally submit the tax return before the end of the month":
    { isTask: true, title: "Submit the tax return", priority: "medium", dueDate: "2026-06-30", tags: ["finance"] },
  "what's the weather like tomorrow?":
    { isTask: false, title: "Check the weather", priority: "low", dueDate: "2026-06-16", tags: [] },
  "asdfjkl qwerty":
    { isTask: false, title: "asdfjkl qwerty", priority: "low", dueDate: null, tags: [] },
};

// Scenario B: break two things to prove the harness catches regressions.
const BAD = structuredClone(GOOD);
BAD["buy oat milk tomorrow"].dueDate = "2026-06-99";                 // wrong date → deterministic check must fail
BAD["read the new Pynchon novel"].title = "stuff";                    // degraded title → judge must fail

function stubComplete(table) {
  return async function complete(request) {
    const toolName = request.tools?.[0]?.name;
    if (toolName === "create_todo") {
      const input = request.messages[0].content;
      const canned = table[input] ?? { isTask: false, title: input, priority: "low", dueDate: null, tags: [] };
      return { content: [{ type: "tool_use", name: "create_todo", input: canned }] };
    }
    if (toolName === "grade") {
      // Stub judge: score by whether the title looks like a degraded stub.
      const userMsg = request.messages[0].content;
      const m = /Generated title: "([^"]*)"/.exec(userMsg);
      const title = m ? m[1] : "";
      const degraded = title.length < 6; // "stuff" → degraded
      return { content: [{ type: "tool_use", name: "grade", input: { score: degraded ? 0.4 : 0.95, reason: "stub" } }] };
    }
    throw new Error("stub: unexpected tool " + toolName);
  };
}

function makeStubJudge(complete) {
  // reuse the real judge wiring against the stub complete
  return async function judge(args) {
    const res = await complete({
      tools: [{ name: "grade" }],
      messages: [{ role: "user", content: `Generated title: "${args.title}"` }],
    });
    const block = res.content.find((b) => b.name === "grade");
    return { score: block.input.score, reason: block.input.reason };
  };
}

async function scenario(label, table, expectOk) {
  const complete = stubComplete(table);
  const judge = makeStubJudge(complete);
  const summary = await runSuite(CASES, { complete, judge });
  const ok = summary.ok === expectOk;
  console.log(`── Scenario ${label} (expect ${expectOk ? "PASS" : "FAIL"}) ──`);
  console.log(formatReport(summary));
  console.log(ok ? `\n✓ harness behaved as expected for scenario ${label}\n` :
                   `\n✗ HARNESS BUG: scenario ${label} expected ${expectOk}, got ${summary.ok}\n`);
  return ok;
}

const a = await scenario("A: faithful model", GOOD, true);
const b = await scenario("B: regressed model", BAD, false);

if (a && b) {
  console.log("Harness self-test passed: rewards correct output, catches regressions.");
  process.exit(0);
}
console.error("Harness self-test FAILED.");
process.exit(1);
