#!/usr/bin/env node
// Reads tokens.json → writes src/index.css
// Run: node scripts/generate-tokens.js

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(join(root, "src/tokens.json"), "utf8"));

// token name → CSS variable name
const COLOR_MAP = {
  "color.brand.primary":           "--brand",
  "color.brand.primaryHover":      "--brand-hover",
  "color.brand.primaryForeground": "--brand-foreground",
  "color.brand.accent":            "--brand-accent",
  "color.brand.accentForeground":  "--brand-accent-fg",
  "color.text.default":            "--text",
  "color.text.muted":              "--text-muted",
  "color.surface.default":         "--surface",
  "color.surface.card":            "--surface-card",
  "color.surface.subtle":          "--surface-subtle",
  "color.border.default":          "--border",
  "color.border.focus":            "--border-focus",
  "color.feedback.error":          "--feedback-error",
  "color.feedback.success":        "--feedback-success",
};

const RADIUS_MAP = {
  "radius.sm":   "--radius-sm",
  "radius.md":   "--radius-md",
  "radius.lg":   "--radius-lg",
  "radius.full": "--radius-full",
};

function hexToRgbSpaced(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}`;
}

const colorLines = tokens
  .filter(t => COLOR_MAP[t.name])
  .map(t => `    ${COLOR_MAP[t.name]}:${" ".repeat(Math.max(1, 28 - COLOR_MAP[t.name].length))}${hexToRgbSpaced(t.value)};`);

const radiusLines = tokens
  .filter(t => RADIUS_MAP[t.name])
  .map(t => `    ${RADIUS_MAP[t.name]}:${" ".repeat(Math.max(1, 28 - RADIUS_MAP[t.name].length))}${t.value};`);

const css = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
${colorLines.join("\n")}

${radiusLines.join("\n")}
  }
}
`;

writeFileSync(join(root, "src/index.css"), css);
console.log("src/index.css regenerated from tokens.json");
