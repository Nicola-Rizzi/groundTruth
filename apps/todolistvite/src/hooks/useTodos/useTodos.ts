import { useCallback, useEffect, useState } from "react";
import type { Todo } from "../../types";

// MCP get_endpoint('/todos'): response is a flat array, NOT wrapped in an object
// MCP get_endpoint('/todos') POST body: { title: string, completed: boolean, userId: number }
const BASE_URL = "https://jsonplaceholder.typicode.com/todos";

const useTodos = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTodos = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(BASE_URL);
        if (!res.ok) throw new Error(`${res.status}`);
        // MCP: returns a flat array — setTodos(data) directly, not data.items or data.todos
        const data: Todo[] = await res.json();
        setTodos(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTodos();
  }, []);

  // MCP POST /todos body: { title, completed, userId } — response includes server-assigned id
  const addTodo = useCallback(async (title: string) => {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, completed: false, userId: 1 }),
    });
    const created: Todo = await res.json();
    setTodos((prev) => [created, ...prev]);
  }, []);

  const removeTodoListItem = useCallback((todoId: number) => {
    // JSONPlaceholder DELETE returns {} — optimistic removal is correct here
    fetch(`${BASE_URL}/${todoId}`, { method: "DELETE" });
    setTodos((prev) => prev.filter((t) => t.id !== todoId));
  }, []);

  const markTodoListItem = useCallback((todoId: number) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, completed: !t.completed } : t))
    );
  }, []);

  return { todos, isLoading, error, addTodo, removeTodoListItem, markTodoListItem };
};

export default useTodos;
