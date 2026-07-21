import { describe, it, expect } from "vitest";
import { parseTodo, ParseError, MAX_INPUT_LENGTH } from "./parseTodo.mjs";

describe("parseTodo input cap", () => {
  it("rejects input over MAX_INPUT_LENGTH before calling the model", async () => {
    const complete = async () => {
      throw new Error("should not be called");
    };
    const tooLong = "a".repeat(MAX_INPUT_LENGTH + 1);
    await expect(parseTodo(tooLong, complete)).rejects.toThrow(ParseError);
  });

  it("accepts input at exactly MAX_INPUT_LENGTH", async () => {
    const complete = async () => ({
      content: [
        {
          type: "tool_use",
          name: "create_todo",
          input: { isTask: true, title: "x", priority: "low", dueDate: null, tags: [] },
        },
      ],
    });
    const atLimit = "a".repeat(MAX_INPUT_LENGTH);
    await expect(parseTodo(atLimit, complete)).resolves.toMatchObject({ title: "x" });
  });
});
