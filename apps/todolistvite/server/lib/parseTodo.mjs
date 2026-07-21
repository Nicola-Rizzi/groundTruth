/**
 * Shared parsing core for the smart-add feature.
 *
 * This module is the trust boundary of the feature: it owns the prompt, the
 * structured-output schema, and the validation of whatever the model returns.
 * It is deliberately runtime-agnostic — it takes a `complete` function rather
 * than importing the Anthropic SDK — so the exact same logic runs in three
 * places without drift:
 *   - the dev server (server/index.mjs) injects the real Anthropic client
 *   - the eval (eval/smart-add.eval.mjs) injects the real client + a judge
 *   - the eval self-test injects a stub, so the harness is verifiable offline
 *
 * The model is never trusted to return valid data — `validateParsed()` is the
 * gate. An LLM that returns a bad shape is a runtime reality, not an edge case.
 */

// Overridable per deploy — e.g. a public demo pins a cheaper model via env var
// without touching code, while local dev/eval keep the default.
export const MODEL = process.env.SMART_ADD_MODEL ?? "claude-sonnet-4-6";

export const MAX_INPUT_LENGTH = 500;

/**
 * The structured-output contract. We force the model to call this tool, so the
 * output is a typed object, not free text we have to parse out of prose.
 */
export const CREATE_TODO_TOOL = {
  name: "create_todo",
  description:
    "Extract a structured todo from the user's natural-language input. " +
    "Always call this tool. If the input is not an actionable task, set isTask=false.",
  input_schema: {
    type: "object",
    properties: {
      isTask: {
        type: "boolean",
        description:
          "false if the input is not an actionable task (a question, a greeting, gibberish). " +
          "When false, still provide a best-effort title but the caller will reject it.",
      },
      title: {
        type: "string",
        description:
          "A concise, imperative todo title with scheduling/priority words removed " +
          "(e.g. 'Call the dentist', not 'remind me to call the dentist next week, urgent').",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description:
          "high if the input signals urgency (urgent, asap, important, !!); low if it signals " +
          "the opposite (someday, whenever, no rush); otherwise medium.",
      },
      dueDate: {
        type: ["string", "null"],
        description:
          "The due date as an ISO 8601 calendar date (YYYY-MM-DD), resolved from relative " +
          "expressions ('tomorrow', 'next Tuesday') against the provided current date. " +
          "null if no date is mentioned.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "0-4 short lowercase topic tags inferred from the task (e.g. ['health'], ['work','email']).",
      },
    },
    required: ["isTask", "title", "priority", "dueDate", "tags"],
  },
};

const PRIORITIES = new Set(["low", "medium", "high"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ParseError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "ParseError";
    this.detail = detail;
  }
}

/**
 * Build the request. `now` is injected (not read from the clock) so the eval can
 * assert date math against a fixed reference — relative dates are only testable
 * if "today" is deterministic.
 */
export function buildRequest(input, now) {
  const today = now instanceof Date ? now : new Date(now);
  const todayIso = today.toISOString().slice(0, 10);
  const weekday = today.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

  const system =
    "You convert a user's natural-language note into a single structured todo by calling the " +
    "create_todo tool. Resolve relative dates against the current date given below. " +
    `Today is ${weekday}, ${todayIso} (UTC). Always call create_todo exactly once.`;

  return {
    model: MODEL,
    max_tokens: 512,
    system,
    tools: [CREATE_TODO_TOOL],
    tool_choice: { type: "tool", name: "create_todo" },
    messages: [{ role: "user", content: input }],
  };
}

/** Pull the create_todo tool_use input out of an Anthropic-shaped response. */
export function extractToolInput(response) {
  const blocks = response?.content ?? [];
  const toolUse = blocks.find((b) => b.type === "tool_use" && b.name === "create_todo");
  if (!toolUse) {
    throw new ParseError("Model did not call create_todo", { content: blocks });
  }
  return toolUse.input;
}

/**
 * Validate the model's output against the contract. This is the gate — never
 * trust the shape just because the schema asked for it.
 * @returns {{ isTask: boolean, title: string, priority: 'low'|'medium'|'high', dueDate: string|null, tags: string[] }}
 */
export function validateParsed(raw) {
  if (typeof raw !== "object" || raw === null) {
    throw new ParseError("Tool input is not an object", { raw });
  }
  const { isTask, title, priority, dueDate, tags } = raw;

  if (typeof isTask !== "boolean") throw new ParseError("isTask must be a boolean", { raw });
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new ParseError("title must be a non-empty string", { raw });
  }
  if (!PRIORITIES.has(priority)) throw new ParseError(`priority must be one of low|medium|high`, { raw });
  if (dueDate !== null && !(typeof dueDate === "string" && ISO_DATE.test(dueDate))) {
    throw new ParseError("dueDate must be YYYY-MM-DD or null", { raw });
  }
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) {
    throw new ParseError("tags must be an array of strings", { raw });
  }

  return {
    isTask,
    title: title.trim(),
    priority,
    dueDate: dueDate ?? null,
    tags: tags.map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 4),
  };
}

/**
 * The end-to-end parse. `complete` is injected: (request) => Promise<AnthropicResponse>.
 * @param {string} input
 * @param {(request: object) => Promise<{content: Array<object>}>} complete
 * @param {{ now?: Date | string }} [opts]
 */
export async function parseTodo(input, complete, opts = {}) {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new ParseError("Input is empty");
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new ParseError(`Input exceeds ${MAX_INPUT_LENGTH} characters`);
  }
  const now = opts.now ?? new Date();
  const response = await complete(buildRequest(input, now));
  return validateParsed(extractToolInput(response));
}
