import { useCallback, useRef, useState } from "react";
import { parseSubtaskStream, type SubtaskStreamState } from "../../ai/parseSubtaskStream";

type Status = "idle" | "streaming" | "done" | "error";

// Reads the SSE stream from /api/breakdown and turns it into live subtask state.
// The key stays server-side; this hook only consumes the text stream and parses
// it incrementally so the UI updates token by token.
export function useBreakdown() {
  const [status, setStatus] = useState<Status>("idle");
  const [state, setState] = useState<SubtaskStreamState>({ items: [], partial: "" });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (input: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setStatus("streaming");
    setError(null);
    setState({ items: [], partial: "" });

    let text = "";       // accumulated model text
    let sse = "";        // buffer for partial SSE frames across chunks

    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status}).`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sse += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line. Process complete frames,
        // keep any trailing partial frame in the buffer for the next chunk.
        const frames = sse.split("\n\n");
        sse = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "delta") {
            text += evt.text;
            setState(parseSubtaskStream(text));
          } else if (evt.type === "error") {
            throw new Error(evt.message ?? "Stream error.");
          } else if (evt.type === "done") {
            // Flush the final tail as a completed item if present.
            const finalText = text.endsWith("\n") ? text : text + "\n";
            setState(parseSubtaskStream(finalText));
            setStatus("done");
            return;
          }
        }
      }
      // Stream ended without an explicit "done" — flush what we have.
      setState(parseSubtaskStream(text.endsWith("\n") ? text : text + "\n"));
      setStatus("done");
    } catch (err) {
      if (ac.signal.aborted) return; // superseded by a newer run — stay quiet
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setState({ items: [], partial: "" });
    setError(null);
  }, []);

  return { status, items: state.items, partial: state.partial, error, run, reset };
}
