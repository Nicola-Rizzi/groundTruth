# @acme/ui

A React component library built on Tailwind CSS + shadcn patterns with a custom brand token set.

> **Note:** This README is generated automatically from the live MCP tool output.
> Run `node scripts/generate-docs.js` from the monorepo root to regenerate.

## Installation

```bash
npm install @acme/ui
```

Add to `vite.config.ts`:
```ts
resolve: { alias: { "@acme/ui": resolve(__dirname, "../acme-ui/src/components/ui") } }
```

Add to `tsconfig.json`:
```json
"paths": { "@acme/ui/*": ["../acme-ui/src/components/ui/*"] }
```

## Design Tokens

### Color

| Token                         | Value   | Description                            |
| ----------------------------- | ------- | -------------------------------------- |
| color.brand.primary           | #6D28D9 | Acme primary brand color — deep violet |
| color.brand.primaryHover      | #5B21B6 | Hover state for primary brand color    |
| color.brand.primaryForeground | #FFFFFF | Text on primary brand surfaces         |
| color.brand.accent            | #D97706 | Warm amber accent                      |
| color.text.default            | #1C1917 | Default body text — warm near-black    |
| color.text.muted              | #78716C | Muted / secondary text                 |
| color.surface.default         | #FAFAF9 | Page background — warm off-white       |
| color.surface.card            | #FFFFFF | Card surface                           |
| color.surface.subtle          | #F5F5F4 | Subtle background for ghost elements   |
| color.border.default          | #D6D3D1 | Default border                         |
| color.border.focus            | #6D28D9 | Focus ring — matches brand primary     |
| color.feedback.error          | #B91C1C | Error states                           |
| color.feedback.success        | #15803D | Success states                         |

### Spacing

| Token   | Value | Description           |
| ------- | ----- | --------------------- |
| space.1 | 4px   | 4px base unit         |
| space.2 | 8px   | Tight spacing         |
| space.3 | 12px  | Compact spacing       |
| space.4 | 16px  | Default block spacing |
| space.6 | 24px  | Section spacing       |
| space.8 | 32px  | Large section spacing |

### Typography

| Token                | Value | Description              |
| -------------------- | ----- | ------------------------ |
| font.size.sm         | 14px  | Small text / captions    |
| font.size.base       | 16px  | Body text                |
| font.size.lg         | 18px  | Large body / subheadings |
| font.size.xl         | 20px  | Headings                 |
| font.weight.medium   | 500   | Medium weight            |
| font.weight.semibold | 600   | Semibold for UI labels   |
| font.weight.bold     | 700   | Bold headings            |

### Radius

| Token       | Value  | Description               |
| ----------- | ------ | ------------------------- |
| radius.sm   | 6px    | Small — tags, chips       |
| radius.md   | 10px   | Default — inputs, buttons |
| radius.lg   | 14px   | Cards and dialogs         |
| radius.full | 9999px | Pills                     |

### Shadow

| Token     | Value                                                  | Description      |
| --------- | ------------------------------------------------------ | ---------------- |
| shadow.sm | 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06) | Subtle elevation |
| shadow.md | 0 4px 8px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06) | Card elevation   |
| shadow.lg | 0 10px 24px rgba(0,0,0,0.12)                           | Modal elevation  |

## Components

### Badge

```tsx
import badge from "@acme/ui/badge";
```

| Prop    | Type                                                             | Notes                       |
| ------- | ---------------------------------------------------------------- | --------------------------- |
| variant | 'default' | 'outline' | 'success' | 'error' | 'accent' | 'muted' | optional, default 'default' |

**Example:**
```tsx
<badge variant="default" />
```

---

### Button

```tsx
import button from "@acme/ui/button";
```

| Prop    | Type                                                       | Notes                       |
| ------- | ---------------------------------------------------------- | --------------------------- |
| variant | 'default' | 'outline' | 'ghost' | 'destructive' | 'accent' | optional, default 'default' |
| size    | 'sm' | 'md' | 'lg' | 'icon'                                | optional, default 'md'      |

**Example:**
```tsx
<button variant="default" size="md" />
```

---

### Card

```tsx
import card from "@acme/ui/card";
```

| Prop    | Type                                          | Notes                       |
| ------- | --------------------------------------------- | --------------------------- |
| variant | 'default' | 'elevated' | 'ghost' | 'outlined' | optional, default 'default' |
| padding | 'none' | 'sm' | 'md' | 'lg'                   | optional, default 'md'      |

**Example:**
```tsx
<card variant="default" padding="md" />
```

---

### Input

```tsx
import input from "@acme/ui/input";
```

| Prop    | Type                          | Notes                       |
| ------- | ----------------------------- | --------------------------- |
| variant | 'default' | 'error' | 'ghost' | optional, default 'default' |
| size    | 'sm' | 'md' | 'lg'            | optional, default 'md'      |

**Example:**
```tsx
<input variant="default" size="md" />
```
