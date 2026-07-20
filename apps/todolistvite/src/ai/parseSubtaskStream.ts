// Pure incremental parser: turn a growing text stream into discrete subtasks
// plus the in-progress tail. This is the "handle partial generations" concern —
// the model emits text token by token, and the UI needs completed items now,
// not only when the whole response lands. Kept pure so it's unit-testable
// without any model (see parseSubtaskStream.test.ts).

export interface SubtaskStreamState {
  items: string[]; // fully received subtasks
  partial: string; // the line still being streamed (may be "")
}

// Strip a leading bullet/number marker: "- ", "* ", "• ", "1. ", "2) ".
const MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;

function clean(line: string): string {
  return line.replace(MARKER, "").trim();
}

export function parseSubtaskStream(buffer: string): SubtaskStreamState {
  const parts = buffer.split("\n");
  // The last segment has no trailing newline yet → it's still streaming.
  const partialRaw = parts.pop() ?? "";
  const items = parts.map(clean).filter(Boolean);
  return { items, partial: clean(partialRaw) };
}
