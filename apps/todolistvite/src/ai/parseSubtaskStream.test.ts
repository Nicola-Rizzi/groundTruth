import { describe, it, expect } from "vitest";
import { parseSubtaskStream } from "./parseSubtaskStream";

describe("parseSubtaskStream", () => {
  it("returns nothing for an empty buffer", () => {
    expect(parseSubtaskStream("")).toEqual({ items: [], partial: "" });
  });

  it("treats an unterminated line as the in-progress partial", () => {
    // "- buy mi" is still streaming — not a completed item yet.
    expect(parseSubtaskStream("- buy mi")).toEqual({ items: [], partial: "buy mi" });
  });

  it("promotes a line to an item once its newline arrives", () => {
    expect(parseSubtaskStream("- buy milk\n- ")).toEqual({ items: ["buy milk"], partial: "" });
  });

  it("accumulates multiple completed items with a trailing partial", () => {
    const buf = "- draft outline\n- write intro\n- edit con";
    expect(parseSubtaskStream(buf)).toEqual({
      items: ["draft outline", "write intro"],
      partial: "edit con",
    });
  });

  it("strips numbered and bulleted markers, ignores blank lines", () => {
    const buf = "1. step one\n\n2) step two\n• step three\n";
    expect(parseSubtaskStream(buf)).toEqual({
      items: ["step one", "step two", "step three"],
      partial: "",
    });
  });
});
