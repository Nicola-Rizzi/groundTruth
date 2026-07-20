# ADR: Dark mode token architecture for @acme/ui

**Status:** Decided  
**Date:** 2026-06-01

---

## Context

`@acme/ui` currently ships a single token set. All color tokens are hardcoded light-mode values in `src/tokens.json` and `src/index.css`. As the library is adopted in more products, dark mode support is a recurring request.

I used Claude to explore the three main approaches before writing any code. The goal of this ADR is to capture what was considered, why options were rejected, and what was decided — so the decision is auditable and reversible.

---

## Options considered

### Option 1 — `.dark` class override (chosen)

Add a `.dark` class to the document root. Override the CSS custom properties inside it:

```css
:root {
  --brand: 109 40 217;       /* deep violet */
  --surface-card: 255 255 255;
  --text: 28 25 23;
}

.dark {
  --brand: 167 139 250;      /* lighter violet on dark bg */
  --surface-card: 28 25 35;
  --text: 245 243 255;
}
```

The consumer toggles dark mode by adding/removing the `.dark` class on `<html>` or `<body>`. Components don't change — they already use CSS vars throughout.

**Pros:**
- Components need zero changes — they reference `rgb(var(--brand))` already
- Consumer controls the toggle (JavaScript can switch modes programmatically)
- Works alongside a user preference toggle (not just `prefers-color-scheme`)
- This is the shadcn standard; tooling and documentation exist

**Cons:**
- Requires the consumer to manage the class (one line of JS, acceptable)
- Specificity: if components ever set CSS vars inline, `.dark` won't override them. Convention: never set CSS vars inline in components.

### Option 2 — Separate token files (`tokens.light.json` + `tokens.dark.json`)

Maintain two complete token sets. Consumer imports the correct one based on mode.

**Why rejected:**
- Token names diverge between files — a misspelling in one isn't caught by TypeScript
- The MCP loader would need to know about two files and merge or switch between them
- Consumers have to manage loading, which is more complex than adding a class
- No benefit over Option 1 for the actual color-switching problem

### Option 3 — `prefers-color-scheme` media query only

```css
@media (prefers-color-scheme: dark) {
  :root { --brand: 167 139 250; }
}
```

**Why rejected:**
- Can't combine with a JavaScript toggle — once you add a `.dark` class for manual override, `prefers-color-scheme` and the class fight each other unless you write complex logic to suppress the media query
- Claude surfaced a specificity issue I hadn't thought through: if the `.dark` class and the `@media` query both apply, the last one in the CSS wins regardless of intent — this creates inconsistent behavior across browsers

---

## Decision

**Option 1 — `.dark` class override.**

Implementation plan:
1. Add dark-mode token overrides to `src/index.css` inside `.dark { }` (not inside `@layer base` — layer specificity would fight the class)
2. Add dark-mode entries to `tokens.json` with a `"dark"` category so the MCP can expose them: `{ "name": "color.brand.primary.dark", "value": "#A78BFA", "category": "color", ... }`
3. Update Storybook to include a dark mode toggle (Storybook's `@storybook/addon-themes` handles this)
4. Document the consumer integration: one line of JS to toggle the class

## What this means for agents

When the MCP's `list_tokens(color)` returns tokens, dark-mode tokens will have `.dark` in the name. An agent writing dark-mode-aware code queries the tokens and gets both sets. It does not hardcode hex values for either mode.

---

## Appendix: AI exploration session summary

I used Claude to pressure-test these options. The key insight that came out of the session:

> "Option 3 breaks as soon as you add manual toggle support, because you now have two conflicting dark-mode signals. The CSS specificity rules mean the last-declared one wins, but that depends on stylesheet order — which varies by bundler. `.dark` class override is the only approach that's both deterministic and supports manual toggle."

I wasn't fully aware of the specificity problem with combining `@media (prefers-color-scheme)` and a `.dark` class before this session. The AI accelerated the exploration. I made the final call.
