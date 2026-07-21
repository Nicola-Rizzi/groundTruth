#!/usr/bin/env node
/**
 * Multi-model eval — runs the same golden set through several models and
 * reports pass rate per model, side by side.
 *
 * The judge is pinned (see harness.mjs's JUDGE_MODEL) independent of the model
 * under test, so scores stay comparable across runs — a judge that drifted
 * with the model under test would grade each row by a different rubric.
 *
 * Run:  ANTHROPIC_API_KEY=... npm run eval:smart-add:multi-model
 * CI:   exits non-zero if ANY model falls below the suite threshold.
 */
import { makeComplete } from "../server/lib/anthropicClient.mjs";
import { CASES } from "./cases.mjs";
import { runSuite, formatReport, makeJudge } from "./harness.mjs";

const MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

const complete = makeComplete();   // one real client, reused — model is per-request, not per-client
const judge = makeJudge(complete); // fixed judge model regardless of which row is running

const summaries = [];
for (const model of MODELS) {
  console.log(`\n${"=".repeat(60)}\n${model}\n${"=".repeat(60)}`);
  const summary = await runSuite(CASES, { complete, judge, model });
  console.log(formatReport(summary));
  summaries.push({ model, summary });
}

console.log(`\n${"=".repeat(60)}\nComparison\n${"=".repeat(60)}`);
for (const { model, summary } of summaries) {
  console.log(
    `${summary.ok ? "✓" : "✗"} ${model.padEnd(28)} ` +
    `checks ${(summary.checkRate * 100).toFixed(0)}%  cases ${summary.casesPassed}/${summary.caseCount}`
  );
}

const allOk = summaries.every(({ summary }) => summary.ok);
process.exit(allOk ? 0 : 1);
