import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadTokens, loadComponents, loadApiContracts, loadPromptTemplate } from "./loaders.js";
import { findTokenForValue, describeMatches } from "./reverse-lookup.js";

/**
 * Builds a fully-configured MCP server with all tools and resources registered.
 *
 * Both transports (stdio in index.ts, HTTP in http.ts) call this factory, so the
 * tool set is defined in exactly one place and can never drift between the two.
 */
/**
 * Every tool result lands verbatim in the client model's context window, so the
 * server — not the model — must own the upper bound on list sizes. `limit`
 * defaults high enough to be invisible at this repo's scale, but the contract
 * (and the truncation notice steering the model toward offset or get_*) is what
 * keeps the design honest at 400-component / 2000-token scale.
 */
const DEFAULT_LIMIT = 100;

const pageParams = {
  limit: z.number().int().min(1).max(500).optional()
    .describe(`Max items to return (default ${DEFAULT_LIMIT}).`),
  offset: z.number().int().min(0).optional()
    .describe("Number of items to skip, for paging through long lists."),
};

function paginate<T>(items: T[], limit = DEFAULT_LIMIT, offset = 0) {
  if (items.length > 0 && offset >= items.length) {
    return { page: [], notice: `\n\n[offset=${offset} is past the end — only ${items.length} item(s) exist.]` };
  }
  const page = items.slice(offset, offset + limit);
  const notice =
    items.length > offset + page.length
      ? `\n\n[Showing ${offset + 1}–${offset + page.length} of ${items.length}. ` +
        `Pass offset=${offset + page.length} for more, or use the matching get_* tool for one item.]`
      : "";
  return { page, notice };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "groundtruth-mcp",
    version: "2.0.0",
  });

  // ─── Token tools ───────────────────────────────────────────────────────────

  server.tool(
    "list_tokens",
    "List design tokens, optionally filtered by category. Reads live from shared-ui/src/tokens.json.",
    {
      category: z
        .enum(["color", "spacing", "typography", "radius", "shadow"])
        .optional()
        .describe("Filter to a single category. Omit for all."),
      ...pageParams,
    },
    async ({ category, limit, offset }) => {
      const tokens = loadTokens();
      const filtered = category ? tokens.filter(t => t.category === category) : tokens;
      if (!filtered.length) {
        return { content: [{ type: "text", text: `No tokens found for category "${category}".` }] };
      }
      const { page, notice } = paginate(filtered, limit, offset);
      const lines = page.map(t => `${t.name} = ${t.value}  (${t.category}) — ${t.description}`);
      return { content: [{ type: "text", text: lines.join("\n") + notice }] };
    }
  );

  server.tool(
    "get_token",
    "Resolve a single design token by exact name to its current value.",
    { name: z.string().describe("Token name, e.g. 'color.brand.primary'.") },
    async ({ name }) => {
      const tokens = loadTokens();
      const token = tokens.find(t => t.name === name);
      if (!token) {
        // Rank by how many dot-separated segments the query shares with each
        // candidate — a typo anywhere but the first segment (e.g.
        // "color.brnad.primary") still surfaces the right token, unlike
        // matching only name.split(".")[0].
        const querySegments = new Set(name.split("."));
        const suggestions = tokens
          .map(t => ({
            name: t.name,
            shared: t.name.split(".").filter(seg => querySegments.has(seg)).length,
          }))
          .filter(t => t.shared > 0)
          .sort((a, b) => b.shared - a.shared)
          .slice(0, 5)
          .map(t => t.name);
        return {
          content: [{
            type: "text",
            text: `Token "${name}" not found.` +
              (suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""),
          }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: `${token.name} = ${token.value}\n${token.description}` }] };
    }
  );

  server.tool(
    "find_token_for_value",
    "Reverse lookup: given a raw value seen in legacy or third-party code (a hex color like '#4f46e5', " +
      "a spacing value like '16px'), find which design token it corresponds to. Use this when refactoring " +
      "hardcoded styles onto the design system, or auditing code for drift from the token set. Colors are " +
      "matched perceptually (OKLCH), not by byte comparison, so near-identical shades still resolve to the " +
      "right token even without an exact string match.",
    { value: z.string().describe("The raw value to look up, e.g. '#4f46e5', '16px', '1rem'.") },
    async ({ value }) => {
      const matches = findTokenForValue(value, loadTokens());
      return { content: [{ type: "text", text: describeMatches(value, matches) }] };
    }
  );

  // ─── Component tools ────────────────────────────────────────────────────────

  server.tool(
    "list_components",
    "List all components in shared-ui, parsed live from the .tsx source files.",
    { ...pageParams },
    async ({ limit, offset }) => {
      const { page, notice } = paginate(loadComponents(), limit, offset);
      const lines = page.map(c => `${c.name} (${c.importPath})`);
      return { content: [{ type: "text", text: lines.join("\n") + notice }] };
    }
  );

  server.tool(
    "get_component_api",
    "Get the full prop API for a component, parsed live from its .tsx source file.",
    { name: z.string().describe("Component name, e.g. 'Button'.") },
    async ({ name }) => {
      const components = loadComponents();
      const component = components.find(
        c => c.name.toLowerCase() === name.toLowerCase()
      );
      if (!component) {
        const names = components.map(c => c.name).join(", ");
        return {
          content: [{ type: "text", text: `Component "${name}" not found. Available: ${names}.` }],
          isError: true,
        };
      }

      const propLines = component.props.map(p => {
        const req = p.required ? "required" : "optional";
        const def = p.default ? `, default ${p.default}` : "";
        return `  - ${p.name}: ${p.type} (${req}${def})`;
      });

      const text = [
        `${component.name}`,
        `import { ${component.name} } from "${component.importPath}";`,
        "",
        "Props:",
        ...propLines,
        "",
        "Example:",
        component.example,
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }
  );

  // ─── API contract tools ──────────────────────────────────────────────────────

  server.tool(
    "list_endpoints",
    "List all API endpoints with method, path, and description. Call this before writing any fetch() call to see what's available.",
    { ...pageParams },
    async ({ limit, offset }) => {
      const endpoints = loadApiContracts();
      if (!endpoints.length) {
        return { content: [{ type: "text", text: "No endpoints found." }] };
      }
      const { page, notice } = paginate(endpoints, limit, offset);
      const lines = page.map(e => `${e.method} ${e.path} — ${e.description}`);
      return { content: [{ type: "text", text: lines.join("\n") + notice }] };
    }
  );

  server.tool(
    "get_endpoint",
    "Get the full request/response contract for one endpoint. Use the exact path from list_endpoints.",
    { path: z.string().describe("Endpoint path, e.g. '/todos' or '/todos/:id'.") },
    async ({ path }) => {
      const endpoints = loadApiContracts();
      const endpoint = endpoints.find(e => e.path === path);
      if (!endpoint) {
        const paths = endpoints.map(e => `${e.method} ${e.path}`).join(", ");
        return {
          content: [{ type: "text", text: `Endpoint "${path}" not found. Available: ${paths}.` }],
          isError: true,
        };
      }
      const parts = [
        `${endpoint.method} ${endpoint.path}`,
        endpoint.description,
      ];
      if (endpoint.body) {
        parts.push("", "Request body:", JSON.stringify(endpoint.body, null, 2));
      }
      parts.push("", "Response:", JSON.stringify(endpoint.response, null, 2));
      return { content: [{ type: "text", text: parts.join("\n") }] };
    }
  );

  // ─── Resource ────────────────────────────────────────────────────────────────

  server.resource(
    "groundtruth-overview",
    "devcontext://overview",
    async (uri) => {
      const tokens = loadTokens();
      const components = loadComponents();

      const text = [
        "# groundtruth-mcp",
        "",
        `Tokens: ${tokens.length} across ${new Set(tokens.map(t => t.category)).size} categories.`,
        `Components: ${components.map(c => c.name).join(", ")}.`,
        "",
        "Rules for agents:",
        "- Never hardcode colors or spacing — resolve with get_token / list_tokens.",
        "- Call get_component_api before using any component.",
      ].join("\n");

      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    }
  );

  // ─── Prompt ──────────────────────────────────────────────────────────────────
  // Exposes prompts/component-from-spec.md — already used by the repo's own
  // scripts — as a real MCP prompt, not just a file a human has to find and
  // paste. Same source, one more surface: a client can list_prompts() and get
  // the exact same grounding instructions the CI review script uses.

  server.registerPrompt(
    "component_from_spec",
    {
      title: "New component from a spec",
      description:
        "Scaffold a new @acme/ui component that matches the library's existing structure and token discipline, " +
        "anchored to a reference component's real API rather than reinvented from scratch.",
      argsSchema: {
        component_name: z.string().describe("PascalCase name of the new component, e.g. 'Tooltip'."),
        spec: z.string().describe("One-line description of what the component should do."),
        reference_component: z
          .string()
          .describe("Name of an existing component to mirror the structure of, e.g. 'Button'."),
      },
    },
    async ({ component_name, spec, reference_component }) => {
      const template = loadPromptTemplate("component-from-spec");
      const text = template.body
        .replaceAll("{{component_name}}", component_name)
        .replaceAll("{{spec}}", spec)
        .replaceAll("{{reference_component}}", reference_component);
      return { messages: [{ role: "user", content: { type: "text", text } }] };
    }
  );

  return server;
}
