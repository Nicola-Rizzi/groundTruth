# STAR Story — groundtruth-mcp

> Delivery target: 90 seconds. Rehearse until you can say this without notes.

---

## Situation

At a team level, AI agents were being used to generate frontend components, but the output consistently required manual fixing before it could be used. Wrong prop names — `variant="danger"` when the real value is `"destructive"`. Hardcoded hex codes that didn't match the design system. Fetch calls that destructured `data.items` when the API returns a flat array. The agent was guessing from training data, not reading the actual project. The cost wasn't catastrophic but it was real: every generated file needed a review pass before it could be committed.

## Task

Close the gap between the design system's source of truth and what the agent actually knows at code-generation time. Do it without requiring engineers to paste documentation into every chat or maintain a context file that drifts out of sync the moment someone renames a component prop.

## Action

I built an MCP server — a lightweight process that exposes structured tools to any AI agent over stdio. The server reads live from the UI library's TypeScript source: it walks the component `.tsx` files and extracts `cva()` variant definitions using brace-counting rather than regex, because Tailwind's arbitrary-value syntax contains `{` characters that break regex parsers. It reads `tokens.json` for design tokens. It reads `api.json` for the endpoint contracts — method, path, request body shape, exact response shape. No copying, no build step, no sync script. The agent queries the server on every session and gets the current state of the repo.

I wired a consumer app to the library via a Vite path alias so the whole pipeline runs end-to-end: agent queries MCP, gets the real props, writes code that imports from the actual package. Then I wrapped the same pattern in a PR review script — `git diff main | node scripts/review-pr.js` — that runs the Claude API against a system prompt containing the project's specific coding rules and posts review comments automatically on every PR.

## Result

Generated components compile without manual fixing. Token changes in the library propagate to the next agent query automatically — no one has to update a context file. The proof point: Button `variant="destructive"` for the delete action. An agent without the MCP writes `"danger"` or `"red"`. Every time. The MCP is what makes it right on the first attempt. The PR review script means the pattern now runs for the whole team without anyone having to remember to invoke it.

## Judgment

What was deliberately not delegated: the component API design itself — what props exist, what they're named, what the variants mean. Accessibility decisions. The choice of which state belongs in the global store versus local component state. These decisions require product context, design intent, and team knowledge that an agent doesn't have and can't be given through a context file. The MCP automates the lookup of what already exists. It doesn't replace the thinking about what should exist.
