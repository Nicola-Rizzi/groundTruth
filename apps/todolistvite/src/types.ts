// Shape from MCP get_endpoint('/todos') — response items have id, userId, title, completed.
// priority/dueDate are NOT part of that contract — jsonplaceholder has nowhere to persist
// them. They're attached client-side only, when a todo comes from the smart-add parser.
export interface Todo {
  id: number;
  userId: number;
  title: string;
  completed: boolean;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
}
