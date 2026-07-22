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

  // MCP POST /todos body: { title, completed, userId } — response includes server-assigned id.
  // priority/dueDate aren't part of that contract (jsonplaceholder has nowhere to persist
  // them), so they're merged into the local todo after the fact rather than sent to the API.
  // Unlike remove/mark below, a failed POST has nothing to roll back yet (the item was never
  // added), so a real error surfaces via `error` instead of being swallowed as "optimistic".
  const addTodo = useCallback(
    async (title: string, extra?: Pick<Todo, "priority" | "dueDate">) => {
      try {
        const res = await fetch(BASE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, completed: false, userId: 1 }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const created: Todo = await res.json();
        setTodos((prev) => [{ ...created, ...extra }, ...prev]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add todo");
      }
    },
    []
  );

  const removeTodoListItem = useCallback((todoId: number) => {
    // JSONPlaceholder DELETE always returns 200 {} for this fake API — optimistic
    // removal is correct here regardless of the response body. The .catch below
    // only guards against a real network failure (e.g. offline) turning into an
    // unhandled promise rejection; it deliberately does not roll back the removal.
    fetch(`${BASE_URL}/${todoId}`, { method: "DELETE" }).catch(() => {
      setError("Failed to sync removal with the server");
    });
    setTodos((prev) => prev.filter((t) => t.id !== todoId));
  }, []);

  // Reads `todos` directly (rather than deriving nextCompleted inside the
  // setTodos updater) because the updater callback isn't guaranteed to run
  // synchronously — a variable only assigned inside it isn't safe to read
  // immediately after for the fetch body below.
  const markTodoListItem = useCallback(
    (todoId: number) => {
      const current = todos.find((t) => t.id === todoId);
      if (!current) return;
      const nextCompleted = !current.completed;

      setTodos((prev) =>
        prev.map((t) => (t.id === todoId ? { ...t, completed: nextCompleted } : t))
      );
      // MCP PATCH /todos/:id body: { completed } — same optimistic/no-rollback
      // pattern as removeTodoListItem, for the same reason (fake backend, real
      // network failures only need to not throw uncaught).
      fetch(`${BASE_URL}/${todoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: nextCompleted }),
      }).catch(() => {
        setError("Failed to sync completion with the server");
      });
    },
    [todos]
  );

  return { todos, isLoading, error, addTodo, removeTodoListItem, markTodoListItem };
};

export default useTodos;
