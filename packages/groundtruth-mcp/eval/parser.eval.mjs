#!/usr/bin/env node
/**
 * Parser eval — validates that the live cva() parser extracts the correct variant
 * API from each component's .tsx source.
 *
 * Why this exists: the parser is the trust boundary of the whole system. If it
 * extracts the wrong variants, the MCP confidently feeds agents wrong values and
 * the entire "no hallucinations" guarantee collapses silently. A unit-style golden
 * test catches a regression in the brace-counting logic the moment it happens —
 * before it reaches an agent.
 *
 * Run:  npm run eval   (from packages/groundtruth-mcp, after `npm run build`)
 * CI:   exits non-zero on any mismatch.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Point the loader at the real component source in this monorepo.
process.env.SHARED_UI_PATH ??= resolve(__dirname, "../../acme-ui/src");
process.env.API_CONTRACT_PATH ??= resolve(__dirname, "../../../apps/todolistvite/api.json");

const { loadComponents } = await import("../dist/loaders.js");

// ─── Golden expectations ───────────────────────────────────────────────────────
// These are the source of truth the parser must reproduce. Hand-verified against
// the .tsx files. If a component's variants legitimately change, update this map.
const EXPECTED = {
  Button: {
    variant: ["default", "outline", "ghost", "destructive", "accent"],
    size: ["sm", "md", "lg", "icon"],
    defaults: { variant: "default", size: "md" },
  },
  Input: {
    variant: ["default", "error", "ghost"],
    size: ["sm", "md", "lg"],
    defaults: { variant: "default", size: "md" },
  },
  Card: {
    variant: ["default", "elevated", "ghost", "outlined"],
    padding: ["none", "sm", "md", "lg"],
    defaults: { variant: "default", padding: "md" },
  },
  Badge: {
    variant: ["default", "outline", "success", "error", "accent", "muted"],
    defaults: { variant: "default" },
  },
};

// ─── Runner ─────────────────────────────────────────────────────────────────────
function optionsFromType(type) {
  // Parser emits union types like: 'default' | 'outline' | 'ghost'
  return type.split("|").map(s => s.trim().replace(/^'|'$/g, ""));
}

const components = loadComponents();
const byName = new Map(components.map(c => [c.name, c]));

let failures = 0;
let checks = 0;

for (const [name, expected] of Object.entries(EXPECTED)) {
  const component = byName.get(name);
  if (!component) {
    console.error(`✗ ${name}: not found by parser (got: ${[...byName.keys()].join(", ") || "none"})`);
    failures++;
    continue;
  }

  for (const [group, expectedOptions] of Object.entries(expected)) {
    if (group === "defaults") continue;
    checks++;
    const prop = component.props.find(p => p.name === group);
    if (!prop) {
      console.error(`✗ ${name}.${group}: prop not extracted`);
      failures++;
      continue;
    }
    const got = optionsFromType(prop.type);
    const same =
      got.length === expectedOptions.length &&
      got.every((o, i) => o === expectedOptions[i]);
    if (!same) {
      console.error(`✗ ${name}.${group}: expected [${expectedOptions.join(", ")}], got [${got.join(", ")}]`);
      failures++;
    } else {
      console.log(`✓ ${name}.${group} = ${got.join(" | ")}`);
    }
  }

  // Check defaults
  for (const [group, expectedDefault] of Object.entries(expected.defaults)) {
    checks++;
    const prop = component.props.find(p => p.name === group);
    const got = prop?.default?.replace(/^'|'$/g, "");
    if (got !== expectedDefault) {
      console.error(`✗ ${name}.${group} default: expected '${expectedDefault}', got ${prop?.default ?? "none"}`);
      failures++;
    } else {
      console.log(`✓ ${name}.${group} default = '${got}'`);
    }
  }
}

console.log("");
console.log(`${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.error(`\n${failures} parser eval failure(s). The MCP would feed agents wrong values — fix the parser before shipping.`);
  process.exit(1);
}
console.log("Parser is faithful to source. ✓");
