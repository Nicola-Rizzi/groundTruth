// The structured result returned by POST /api/parse-todo.
// The server owns the parsing + validation (server/lib/parseTodo.mjs); the
// frontend only consumes this shape. Mirrors the validated server output.
export interface ParsedTodo {
  isTask: boolean;
  title: string;
  priority: "low" | "medium" | "high";
  dueDate: string | null; // ISO YYYY-MM-DD
  tags: string[];
}

// Shared across SmartAddTodo's preview and TodoListItem's display, so the two
// never drift on what a priority looks like. Variant names come straight from
// the design system (get_component_api("Badge")): high→accent (amber,
// attention), medium→default, low→muted.
export const PRIORITY_VARIANT: Record<ParsedTodo["priority"], "accent" | "default" | "muted"> = {
  high: "accent",
  medium: "default",
  low: "muted",
};
