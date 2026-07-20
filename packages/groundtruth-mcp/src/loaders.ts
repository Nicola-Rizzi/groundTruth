import { readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import type { Token, Component, ComponentProp, ApiEndpoint } from "./design-system.js";

if (!process.env.SHARED_UI_PATH)    console.error("Warning: SHARED_UI_PATH not set, using default");
if (!process.env.API_CONTRACT_PATH) console.error("Warning: API_CONTRACT_PATH not set, using default");
if (!process.env.PROMPTS_PATH)      console.error("Warning: PROMPTS_PATH not set, using default");

const SHARED_UI    = process.env.SHARED_UI_PATH    ?? "./packages/acme-ui/src";
const API_CONTRACT = process.env.API_CONTRACT_PATH ?? "./apps/todolistvite/api.json";
const PROMPTS_DIR  = process.env.PROMPTS_PATH       ?? "./prompts";

// ─── Tokens ──────────────────────────────────────────────────────────────────

export function loadTokens(): Token[] {
  return JSON.parse(readFileSync(join(SHARED_UI, "tokens.json"), "utf8")) as Token[];
}

// ─── Components ──────────────────────────────────────────────────────────────

function findTsxFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      result.push(...findTsxFiles(full));
    } else if (entry.endsWith(".tsx")) {
      result.push(full);
    }
  }
  return result;
}

// Count braces to extract a balanced { ... } block starting at openPos.
function extractBalancedBraces(src: string, openPos: number): string {
  let depth = 0;
  let start = -1;
  for (let i = openPos; i < src.length; i++) {
    if (src[i] === "{") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i);
    }
  }
  return "";
}

interface CvaVariantGroup {
  name: string;
  options: string[];
  defaultValue?: string;
}

function parseCvaVariants(src: string): CvaVariantGroup[] {
  const variantsIdx = src.indexOf("variants: {");
  if (variantsIdx === -1) return [];

  const blockStart = src.indexOf("{", variantsIdx);
  const block = extractBalancedBraces(src, blockStart);

  const defaultsMap: Record<string, string> = {};
  const dvIdx = src.indexOf("defaultVariants: {");
  if (dvIdx !== -1) {
    const dvStart = src.indexOf("{", dvIdx);
    const dvBlock = extractBalancedBraces(src, dvStart);
    for (const [, k, v] of dvBlock.matchAll(/(\w+)\s*:\s*["']([^"']+)["']/g)) {
      defaultsMap[k] = v;
    }
  }

  const groups: CvaVariantGroup[] = [];
  const groupRe = /(\w+)\s*:\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = groupRe.exec(block)) !== null) {
    const groupName = match[1];
    const subStart = match.index + match[0].length - 1;
    const subBlock = extractBalancedBraces(block, subStart);
    const options = [...subBlock.matchAll(/^[ \t]*(\w+)\s*:/gm)].map(m => m[1]);
    if (options.length > 0) {
      groups.push({ name: groupName, options, defaultValue: defaultsMap[groupName] });
    }
  }
  return groups;
}

function parsePropLine(line: string): ComponentProp | null {
  const m = line.trim().match(/^(\w+)(\?)?\s*:\s*(.+?)(?:;?)$/);
  if (!m) return null;
  return { name: m[1], type: m[3].trim(), required: !m[2] };
}

// Resolve the real PascalCase component name from the source, falling back to the
// filename. Skips the `xVariants` cva export, which is not the component itself.
function resolveComponentName(src: string, fileBase: string): string {
  // `export { Button }` (may list several; take the first PascalCase that isn't *Variants)
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    const names = m[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim());
    const hit = names.find(n => /^[A-Z]/.test(n) && !n.endsWith("Variants"));
    if (hit) return hit;
  }
  // `export default function Button` / `export function Button` / `export const Button`
  const fn = src.match(/export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z]\w*)/);
  if (fn && !fn[1].endsWith("Variants")) return fn[1];
  // `interface ButtonProps` → strip the Props suffix
  const iface = src.match(/interface\s+([A-Z]\w*)Props\b/);
  if (iface) return iface[1];
  // Fallback: capitalize the filename
  return fileBase.charAt(0).toUpperCase() + fileBase.slice(1);
}

function parseComponentFile(filePath: string): Component | null {
  const src = readFileSync(filePath, "utf8");
  const fileBase = basename(filePath, ".tsx");

  const hasExport = /export\s+(default\s+function|function|const|interface|class)\s+\w/.test(src);
  if (!hasExport) return null;

  // Resolve the real exported component name, not the filename.
  // The filename is lowercase ("button"); the export is PascalCase ("Button"),
  // and consumers import the named export, so the API must report the real name.
  // Try, in order: `export { Name }`, `export default function Name`,
  // `interface NameProps` (strip Props), then fall back to the filename.
  const name = resolveComponentName(src, fileBase);

  // 1. cva() variants → typed props
  const variantGroups = parseCvaVariants(src);
  const variantProps: ComponentProp[] = variantGroups.map(g => ({
    name: g.name,
    type: g.options.map(o => `'${o}'`).join(" | "),
    required: false,
    default: g.defaultValue ? `'${g.defaultValue}'` : undefined,
  }));

  // 2. Explicit interface props (extra props beyond HTMLAttributes + VariantProps)
  const ifaceMatch = src.match(
    /(?:export\s+)?interface \w+Props(?:\s+extends[^{]*)?\{([\s\S]*?)\n\}/
  );
  const IMPLICIT = new Set(["className", "ref", "style", "children"]);
  const ifaceProps: ComponentProp[] = ifaceMatch
    ? ifaceMatch[1].split("\n")
        .map(parsePropLine)
        .filter((p): p is ComponentProp => p !== null && !IMPLICIT.has(p.name))
    : [];

  const props = [...variantProps, ...ifaceProps];

  // 3. Import path from package.json — the path segment is the (lowercase) filename,
  //    since that's what consumers import from (e.g. "@acme/ui/button"), even though
  //    the named export itself is PascalCase ("Button").
  const pkgPath = join(SHARED_UI, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
  const importPath = `${pkg.name ?? "@acme/ui"}/${fileBase}`;

  // 4. Example using default variants
  const exampleAttrs = variantGroups
    .filter(g => g.defaultValue)
    .map(g => `${g.name}="${g.defaultValue}"`)
    .join(" ");
  const example = `<${name}${exampleAttrs ? " " + exampleAttrs : ""} />`;

  return { name, importPath, description: "", props, example };
}

export function loadComponents(): Component[] {
  return findTsxFiles(SHARED_UI)
    .map(f => parseComponentFile(f))
    .filter((c): c is Component => c !== null);
}

// ─── API contracts ────────────────────────────────────────────────────────────

export function loadApiContracts(): ApiEndpoint[] {
  return JSON.parse(readFileSync(API_CONTRACT, "utf8")) as ApiEndpoint[];
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

export interface PromptTemplate {
  id: string;
  version: string;
  inputs: string[];
  body: string; // with {{var}} placeholders, unsubstituted
}

/**
 * Parses the repo's own prompt format (YAML-ish frontmatter + Markdown body,
 * used already by scripts/review-pr.js etc). Deliberately not a real YAML
 * parser — the frontmatter here is three flat scalar/array fields, and adding
 * a dependency to parse three lines would be the wrong trade.
 */
export function loadPromptTemplate(id: string): PromptTemplate {
  const raw = readFileSync(join(PROMPTS_DIR, `${id}.md`), "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Prompt "${id}" is missing --- frontmatter.`);

  const [, frontmatter, body] = match;
  const version = frontmatter.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? "0.0.0";
  const inputsLine = frontmatter.match(/^inputs:\s*\[(.*)\]$/m)?.[1] ?? "";
  const inputs = inputsLine.split(",").map(s => s.trim()).filter(Boolean);

  return { id, version, inputs, body: body.trim() };
}

