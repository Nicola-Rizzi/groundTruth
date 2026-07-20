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
