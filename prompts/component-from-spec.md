---
id: component-from-spec
version: 1.0.0
stage: code-generation
inputs: [component_name, spec, reference_component]
---

You are adding a new component to the `@acme/ui` library. A new component must look like it belongs in the library — same structure, same token discipline — not like it was bolted on. The `groundTruth` MCP server exposes the existing components and tokens; build from them, don't reinvent them.

## Before writing code

1. Call `get_component_api("{{reference_component}}")` and mirror its structure exactly: the `cva()` setup, the `VariantProps` typing, the `forwardRef` pattern, the named export. This is the shape your component must match.
2. Call `list_tokens("color")` and `list_tokens("radius")`. Every color and radius you use must resolve to a token via `rgb(var(--...))` / `var(--radius-*)`. Read the real token names — do not guess them.

## Task

Build **`{{component_name}}`** — {{spec}}

Create it at `packages/acme-ui/src/components/ui/<component_name_lowercased>.tsx`.

## Rules

- Variants go through `cva()` with a `defaultVariants` block. The MCP parser reads these live, so name each variant group and option clearly.
- Colors via `rgb(var(--...))` only — no hardcoded hex. The ESLint rule and the PR review both reject literals.
- Named export (`export { {{component_name}} }`), matching every other component.
- If the spec needs a token that doesn't exist, **stop and say so** — adding a token is a design decision, not something to invent.

## Output

The component file only, followed by the list of tokens you used and why — so the design intent is reviewable. Then remind me to run `node scripts/generate-stories.js` so the Storybook story is generated from the live variants.

---
### Changelog
- 1.0.0 — initial. Anchoring the structure to an existing component via `get_component_api`, and forcing token names to come from `list_tokens`, are what keep a generated component consistent with the library instead of subtly off.
