#!/usr/bin/env node
/**
 * Smart-add eval — runs the golden set against the real model and grades the
 * output (deterministic checks + LLM-as-judge on title fidelity).
 *
 * Run:  ANTHROPIC_API_KEY=... npm run eval:smart-add
 * CI:   exits non-zero if the pass rate falls below the suite threshold.
 *
 * This is regression protection for a non-deterministic feature: change the
 * prompt or bump the model, re-run, and see immediately whether quality moved.
 */
import { makeComplete } from "../server/lib/anthropicClient.mjs";
import { CASES } from "./cases.mjs";
import { runSuite, formatReport, makeJudge } from "./harness.mjs";

const complete = makeComplete();      // real client (fails fast if no key)
const judge = makeJudge(complete);    // LLM-as-judge uses the same client

const summary = await runSuite(CASES, { complete, judge });
console.log(formatReport(summary));
process.exit(summary.ok ? 0 : 1);
