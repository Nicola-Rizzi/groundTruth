// Shape from MCP get_endpoint('/todos') — response items have id, userId, title, completed
export interface Todo {
  id: number;
  userId: number;
  title: string;
  completed: boolean;
}
