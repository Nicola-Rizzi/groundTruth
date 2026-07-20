/**
 * Core for the streaming "break a task into subtasks" feature.
 *
 * Unlike smart-add (structured tool-calling), this is a *text* stream: the value
 * is the UX — subtasks appearing token by token — so we want plain streamed text,
 * not a structured blob that only resolves at the end. The frontend turns the
 * growing text into discrete subtasks incrementally (src/ai/parseSubtaskStream.ts).
 */
export const BREAKDOWN_MODEL = "claude-sonnet-4-6";

export function buildBreakdownRequest(input) {
  return {
    model: BREAKDOWN_MODEL,
    max_tokens: 400,
    system:
      "Break the user's task into 3-6 concrete, actionable subtasks. " +
      "Output ONLY the subtasks, one per line, each line starting with '- '. " +
      "No preamble, no numbering, no closing remarks, no blank lines.",
    messages: [{ role: "user", content: input }],
  };
}
