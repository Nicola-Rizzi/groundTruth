import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const MCP = resolve(ROOT, "packages/groundtruth-mcp/dist/index.js");

const env = {
  ...process.env,
  SHARED_UI_PATH: resolve(ROOT, "packages/acme-ui/src"),
  API_CONTRACT_PATH: resolve(ROOT, "apps/todolistvite/api.json"),
};

// Same spawn-the-server-over-stdio pattern as scripts/generate-docs.js and
// scripts/generate-stories.js — the agent is just another MCP client, not a
// special case that needs its own protocol handling.
export function callMcpTool(name, args = {}) {
  const payload = JSON.stringify({
    jsonrpc: "2.0", id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const result = spawnSync("node", [MCP], { input: payload + "\n", env, encoding: "utf8" });
  if (result.error) throw result.error;
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed.result?.content?.[0]?.text ?? "";
  } catch {
    throw new Error(`Failed to parse MCP response for "${name}": ${result.stdout.slice(0, 200)}`);
  }
}

/** Parses find_token_for_value's text response into a token name, or null if no clean match. */
export function resolveHexToToken(hex) {
  const text = callMcpTool("find_token_for_value", { value: hex });
  const match = text.match(/^(?:Exact match|Closest):\s*([\w.]+)/);
  return match ? { tokenName: match[1], raw: text } : { tokenName: null, raw: text };
}
