#!/usr/bin/env node
/**
 * Generates Storybook story files from live MCP tool output.
 * argTypes and named stories are derived directly from each component's cva() variants,
 * so stories can never drift from the implementation.
 *
 * Usage:
 *   node scripts/generate-stories.js
 *
 * Requires: packages/groundtruth-mcp must be built (npm run build in that package)
 */

import { spawnSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT    = resolve(__dirname, "..");
const MCP     = resolve(ROOT, "packages/groundtruth-mcp/dist/index.js");
const STORIES = resolve(ROOT, "apps/ui-docs/stories");

const env = {
  ...process.env,
  SHARED_UI_PATH:    resolve(ROOT, "packages/acme-ui/src"),
  API_CONTRACT_PATH: resolve(ROOT, "apps/todolistvite/api.json"),
};

// ─── MCP helpers ──────────────────────────────────────────────────────────────

function callTool(name, args = {}) {
  const payload = JSON.stringify({
    jsonrpc: "2.0", id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const result = spawnSync("node", [MCP], { input: payload + "\n", env, encoding: "utf8" });
  if (result.error) throw result.error;
  const parsed = JSON.parse(result.stdout);
  return parsed.result?.content?.[0]?.text ?? "";
}

// ─── Prop parser ──────────────────────────────────────────────────────────────

/**
 * Parses a props block from get_component_api output.
 * Returns an array of { name, options: string[] | null, isBoolean, defaultValue }.
 * options is null for non-select (string/boolean) props.
 */
function parseProps(text) {
  const props = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s+-\s+(\w+):\s+(.+?)\s+\((.+?)\)$/);
    if (!m) continue;
    const [, propName, type, notes] = m;
    const defaultMatch = notes.match(/default '?([^']+)'?/);
    const defaultValue = defaultMatch ? defaultMatch[1] : null;

    if (type.includes("|")) {
      const options = type.split("|").map(s => s.trim().replace(/'/g, ""));
      props.push({ name: propName, options, isBoolean: false, defaultValue });
    } else if (type === "boolean") {
      props.push({ name: propName, options: null, isBoolean: true, defaultValue: "false" });
    } else {
      props.push({ name: propName, options: null, isBoolean: false, defaultValue });
    }
  }
  return props;
}

// ─── Story label helpers ───────────────────────────────────────────────────────

const STORY_CHILDREN = {
  button: { default: "Button", outline: "Button", ghost: "Button", destructive: "Delete", accent: "Highlight" },
  badge:  { default: "Badge", success: "Done", error: "Failed", muted: "Pending", accent: "New", outline: "Draft" },
};

function storyChildren(componentName, variant) {
  const map = STORY_CHILDREN[componentName];
  return map?.[variant] ?? (map ? "Button" : null);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Story file generators ─────────────────────────────────────────────────────

function buildArgTypes(props) {
  const lines = [];
  for (const p of props) {
    if (p.options) {
      const opts = p.options.map(o => `"${o}"`).join(", ");
      lines.push(`    ${p.name}: { control: "select", options: [${opts}] },`);
    } else if (p.isBoolean) {
      lines.push(`    ${p.name}: { control: "boolean" },`);
    } else {
      lines.push(`    ${p.name}: { control: "text" },`);
    }
  }
  return lines.join("\n");
}

function buildVariantStories(componentName, variantProp, hasChildren) {
  const lines = [];
  for (const opt of variantProp.options) {
    const storyName = capitalize(opt);
    const children = hasChildren ? storyChildren(componentName, opt) : null;
    const childrenArg = children ? `, children: "${children}"` : "";
    lines.push(`export const ${storyName}: Story = { args: { variant: "${opt}"${childrenArg} } };`);
  }
  return lines.join("\n");
}

function buildSizeStories(componentName, sizeProp, variantProp, hasChildren) {
  const lines = [];
  const defaultVariant = variantProp?.defaultValue ?? variantProp?.options?.[0] ?? "default";
  for (const opt of sizeProp.options) {
    if (opt === "icon") continue; // icon size needs special content
    const storyName = capitalize(opt);
    const children = hasChildren ? storyChildren(componentName, defaultVariant) : null;
    const childrenArg = children ? `, children: "${children}"` : "";
    lines.push(`export const ${storyName}: Story = { args: { size: "${opt}", variant: "${defaultVariant}"${childrenArg} } };`);
  }
  return lines.join("\n");
}

/**
 * Card needs sub-components, so we generate render() stories rather than args stories.
 */
function buildCardStories(props) {
  const variantProp = props.find(p => p.name === "variant");
  const paddingProp = props.find(p => p.name === "padding");
  const defaultPadding = paddingProp?.defaultValue ?? "md";
  const lines = [];
  for (const variant of (variantProp?.options ?? ["default"])) {
    const storyName = capitalize(variant);
    lines.push(
      `export const ${storyName}: Story = { render: () => (\n` +
      `  <Card variant="${variant}" padding="${defaultPadding}">\n` +
      `    <CardHeader><CardTitle>${storyName}</CardTitle></CardHeader>\n` +
      `    <CardContent>Card body content goes here.</CardContent>\n` +
      `  </Card>\n` +
      `) };`
    );
  }
  return lines.join("\n");
}

// ─── Per-component file builder ───────────────────────────────────────────────

function buildStoryFile(rawName, text) {
  const name = capitalize(rawName);
  const importPathMatch = text.match(/^import \S+ from "([^"]+)"/m);
  const importPath = importPathMatch ? importPathMatch[1] : `@acme/ui/${rawName}`;
  const props = parseProps(text);
  const variantProp = props.find(p => p.name === "variant");
  const sizeProp    = props.find(p => p.name === "size");
  const hasChildren = ["button", "badge"].includes(rawName);

  const argTypes = buildArgTypes(props);
  const header = [
    `// THIS FILE IS AUTO-GENERATED. Run \`node scripts/generate-stories.js\` to regenerate.`,
    `// Manual edits will be overwritten.`,
    ``,
    `import type { Meta, StoryObj } from "@storybook/react";`,
  ];

  let imports;
  let stories;

  if (rawName === "card") {
    imports = `import { Card, CardHeader, CardTitle, CardContent } from "${importPath}";`;
    stories = buildCardStories(props);
  } else {
    imports = `import { ${name} } from "${importPath}";`;
    const variantStories = variantProp ? buildVariantStories(rawName, variantProp, hasChildren) : "";
    const sizeStories = sizeProp ? buildSizeStories(rawName, sizeProp, variantProp, hasChildren) : "";
    stories = [variantStories, sizeStories].filter(Boolean).join("\n");
  }

  const meta = [
    `const meta: Meta<typeof ${name}> = {`,
    `  title: "Components/${name}",`,
    `  component: ${name},`,
    `  tags: ["autodocs"],`,
    `  argTypes: {`,
    argTypes,
    `  },`,
    `};`,
    `export default meta;`,
    `type Story = StoryObj<typeof ${name}>;`,
  ].join("\n");

  return [...header, imports, "", meta, "", stories, ""].join("\n");
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const componentListText = callTool("list_components");
  const componentNames = componentListText
    .split("\n")
    .filter(Boolean)
    .map(l => l.split(" ")[0].trim());

  process.stdout.write(`Found ${componentNames.length} components: ${componentNames.join(", ")}\n`);

  for (const rawName of componentNames) {
    const text = callTool("get_component_api", { name: rawName });
    const fileContent = buildStoryFile(rawName, text);
    const outPath = resolve(STORIES, `${capitalize(rawName)}.stories.tsx`);
    writeFileSync(outPath, fileContent, "utf8");
    process.stdout.write(`  ✓ ${outPath}\n`);
  }

  process.stdout.write(`Done. ${componentNames.length} story files written.\n`);
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
