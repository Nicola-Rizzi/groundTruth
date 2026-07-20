/**
 * Eval harness for the smart-add parser.
 *
 * Separates the two kinds of grading that non-deterministic output needs:
 *   - DETERMINISTIC checks (isTask, dueDate, priority, tags): the structured
 *     fields have a single right answer; assert them directly.
 *   - JUDGMENT (title fidelity): there's no single correct string, so an LLM
 *     judge scores it against a rubric. This is the part you can't unit-test,
 *     and the part most teams skip — which is why generated text silently drifts.
 *
 * Both the parser client and the judge are injected, so this harness runs
 * against the real model (smart-add.eval.mjs) or a stub (harness.selftest.mjs).
 */
import { parseTodo, ParseError, MODEL } from "../server/lib/parseTodo.mjs";

const TITLE_PASS_THRESHOLD = 0.7; // judge score at/above which the title is acceptable
const SUITE_PASS_THRESHOLD = 0.9; // fraction of checks that must pass for the suite to pass

/** Build an LLM-as-judge from a `complete` function. Returns (args) => {score, reason}. */
export function makeJudge(complete) {
  const GRADE_TOOL = {
    name: "grade",
    description: "Grade the generated todo title.",
    input_schema: {
      type: "object",
      properties: {
        score: { type: "number", description: "0.0-1.0: does the title faithfully and concisely capture the task?" },
        reason: { type: "string", description: "One short sentence." },
      },
      required: ["score", "reason"],
    },
  };
  return async function judge({ input, title, conveys }) {
    const res = await complete({
      model: MODEL,
      max_tokens: 256,
      system:
        "You grade whether a generated todo title faithfully and concisely captures the user's task. " +
        "A good title is imperative, drops scheduling/priority words, and keeps the core action. " +
        "Call the grade tool.",
      tools: [GRADE_TOOL],
      tool_choice: { type: "tool", name: "grade" },
      messages: [{
        role: "user",
        content: `User input: "${input}"\nGenerated title: "${title}"\nThe title should convey: "${conveys}"`,
      }],
    });
    const block = (res.content ?? []).find((b) => b.type === "tool_use" && b.name === "grade");
    if (!block) return { score: 0, reason: "judge did not return a grade" };
    const score = Math.max(0, Math.min(1, Number(block.input.score)));
    return { score, reason: block.input.reason ?? "" };
  };
}

function deterministicChecks(expect, parsed) {
  const checks = [];
  const add = (label, pass, detail) => checks.push({ label, pass, detail });

  if ("isTask" in expect) add(`isTask = ${expect.isTask}`, parsed.isTask === expect.isTask, `got ${parsed.isTask}`);

  // For non-tasks, the other fields are irrelevant — don't grade them.
  if (expect.isTask === false) return checks;

  if ("dueDate" in expect) add(`dueDate = ${expect.dueDate}`, parsed.dueDate === expect.dueDate, `got ${parsed.dueDate}`);
  if ("priority" in expect) add(`priority = ${expect.priority}`, parsed.priority === expect.priority, `got ${parsed.priority}`);
  if ("tagsInclude" in expect) {
    for (const tag of expect.tagsInclude) {
      add(`tags include "${tag}"`, parsed.tags.includes(tag), `got [${parsed.tags.join(", ")}]`);
    }
  }
  return checks;
}

/** Run one golden case end-to-end: parse, deterministic checks, then judge the title. */
export async function runCase(testCase, { complete, judge }) {
  const { name, input, now, expect } = testCase;
  let parsed;
  try {
    parsed = await parseTodo(input, complete, { now });
  } catch (err) {
    const why = err instanceof ParseError ? err.message : String(err);
    return { name, input, parsed: null, checks: [{ label: "parse succeeds", pass: false, detail: why }] };
  }

  const checks = deterministicChecks(expect, parsed);

  // Judge the title only when this is a real task and the case specifies intent.
  if (expect.isTask !== false && expect.titleConveys) {
    const { score, reason } = await judge({ input, title: parsed.title, conveys: expect.titleConveys });
    checks.push({
      label: `title fidelity ≥ ${TITLE_PASS_THRESHOLD}`,
      pass: score >= TITLE_PASS_THRESHOLD,
      detail: `judge ${score.toFixed(2)} — ${reason} (title: "${parsed.title}")`,
    });
  }

  return { name, input, parsed, checks };
}

const CASE_PASS_THRESHOLD = 0.9; // fraction of CASES that must fully pass (every check)

export async function runSuite(cases, deps) {
  const results = [];
  for (const c of cases) results.push(await runCase(c, deps));

  // Check-level: every individual assertion across the suite.
  let total = 0, passed = 0;
  for (const r of results) for (const c of r.checks) { total++; if (c.pass) passed++; }
  const checkRate = total ? passed / total : 0;

  // Case-level: a case counts only if ALL its checks pass. This is the signal
  // that matters — "how many user inputs did we handle end-to-end" — and it's
  // far more sensitive than a global check rate, where a couple of broken checks
  // hide inside a large denominator. The suite must clear BOTH bars.
  const casesPassed = results.filter((r) => r.checks.every((c) => c.pass)).length;
  const caseRate = results.length ? casesPassed / results.length : 0;

  const ok = checkRate >= SUITE_PASS_THRESHOLD && caseRate >= CASE_PASS_THRESHOLD;

  return {
    results,
    total, passed, checkRate,
    casesPassed, caseCount: results.length, caseRate,
    ok,
    checkThreshold: SUITE_PASS_THRESHOLD,
    caseThreshold: CASE_PASS_THRESHOLD,
  };
}

export function formatReport(summary) {
  const lines = [];
  for (const r of summary.results) {
    const caseFail = r.checks.some((c) => !c.pass);
    lines.push(`${caseFail ? "✗" : "✓"} ${r.name}`);
    for (const c of r.checks) {
      lines.push(`    ${c.pass ? "✓" : "✗"} ${c.label}${c.pass ? "" : `  — ${c.detail}`}`);
    }
  }
  lines.push("");
  lines.push(
    `Checks: ${summary.passed}/${summary.total} (${(summary.checkRate * 100).toFixed(0)}%, ` +
    `need ${(summary.checkThreshold * 100).toFixed(0)}%).  ` +
    `Cases: ${summary.casesPassed}/${summary.caseCount} (${(summary.caseRate * 100).toFixed(0)}%, ` +
    `need ${(summary.caseThreshold * 100).toFixed(0)}%).  ${summary.ok ? "PASS" : "FAIL"}`
  );
  return lines.join("\n");
}
