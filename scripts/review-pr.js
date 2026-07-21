#!/usr/bin/env node
// Usage: git diff main | ANTHROPIC_API_KEY=... node scripts/review-pr.js
// Reads a git diff from stdin, calls Claude, prints structured review comments.

import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a code reviewer for the groundtruth monorepo. Review the git diff and report only real problems — skip style nits, formatting, and things that are already correct.

Rules specific to this project:

1. No hardcoded file paths. All paths must come from env vars (SHARED_UI_PATH, API_CONTRACT_PATH). Flag any string literal that looks like an absolute or relative file path passed directly to readFileSync or similar in src/. Do NOT flag test code that resolves repo-relative paths to seed environment variables for a spawned subprocess (e.g. building a path to assign to process.env.SHARED_UI_PATH before spawning a test server) — that's the required pattern for integration tests, not a violation.

2. Every new MCP tool must call a loader function — never call readFileSync inline inside a server.tool() handler. The pattern is: loader in src/loaders.ts, called from the handler in src/server.ts.

3. src/design-system.ts interfaces and src/loaders.ts must stay in sync. If one adds or changes a field, the other must too. Flag any diff where only one side changed.

4. console.log is forbidden anywhere in packages/groundtruth-mcp/src/. It corrupts the stdio JSON-RPC stream. Only console.error is allowed. Flag any console.log addition in that directory.

5. No hardcoded hex color values in JSX or CSS-in-JS. Colors must use CSS variables (rgb(var(--...))) or come from a get_token() MCP call. Flag any #rrggbb or rgb(...) literal in component files.

Format your response as a list of findings. Each finding:
- File and approximate location
- What rule it violates
- One-line fix suggestion

If there are no findings, say "No issues found."`;

async function main() {
  const diff = await new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });

  if (!diff.trim()) {
    console.log("No diff provided — pipe a git diff to stdin.");
    process.exit(0);
  }

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Review this diff:\n\n\`\`\`diff\n${diff}\n\`\`\``,
      },
    ],
  });

  const text = response.content.find(b => b.type === "text")?.text ?? "";
  console.log(text);
}

main().catch(err => {
  console.error("review-pr error:", err.message);
  process.exit(1);
});
