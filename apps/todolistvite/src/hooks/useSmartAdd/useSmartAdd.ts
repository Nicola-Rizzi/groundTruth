import { useCallback, useState } from "react";
import type { ParsedTodo } from "../../ai/types";

type Status = "idle" | "parsing" | "error";

// Calls the server-side parser. The Anthropic key never reaches the browser —
// this hook only knows about the /api/parse-todo endpoint.
export function useSmartAdd() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ParsedTodo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parse = useCallback(async (input: string) => {
    setStatus("parsing");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/parse-todo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (!res.ok) {
        // 502 = the model returned something we wouldn't trust; 4xx/5xx otherwise.
        throw new Error(res.status === 502 ? "Couldn't read a task from that." : `Request failed (${res.status}).`);
      }
      const parsed: ParsedTodo = await res.json();
      setResult(parsed);
      setStatus("idle");
      return parsed;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, parse, reset };
}
