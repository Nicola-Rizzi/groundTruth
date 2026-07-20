/**
 * Golden set for the smart-add parser.
 *
 * `now` is fixed per case so relative-date assertions are deterministic.
 * Reference date 2026-06-15 is a Monday, which makes the weekday cases concrete:
 *   tomorrow = 2026-06-16 (Tue), next Tuesday = 2026-06-23.
 *
 * Each expectation is either a deterministic check (isTask, dueDate, priority,
 * tagsInclude) or a judgment the LLM judge scores (`titleConveys`).
 */
export const REF = "2026-06-15T12:00:00.000Z"; // Monday

export const CASES = [
  {
    name: "explicit date + urgency",
    input: "remind me to call the dentist next Tuesday, it's urgent",
    now: REF,
    expect: { isTask: true, dueDate: "2026-06-23", priority: "high", titleConveys: "calling the dentist" },
  },
  {
    name: "relative date 'tomorrow'",
    input: "buy oat milk tomorrow",
    now: REF,
    expect: { isTask: true, dueDate: "2026-06-16", priority: "medium", titleConveys: "buying oat milk" },
  },
  {
    name: "no date, no priority → defaults",
    input: "read the new Pynchon novel",
    now: REF,
    expect: { isTask: true, dueDate: null, titleConveys: "reading the new Pynchon novel" },
  },
  {
    name: "low-priority signal",
    input: "someday maybe reorganize the garage, no rush",
    now: REF,
    expect: { isTask: true, priority: "low", dueDate: null, titleConveys: "reorganizing the garage" },
  },
  {
    name: "implied tags from work context",
    input: "email the design team about the new logo by Friday",
    now: REF,
    expect: { isTask: true, dueDate: "2026-06-19", tagsInclude: ["work"], titleConveys: "emailing the design team about the logo" },
  },
  {
    name: "title should strip scheduling words",
    input: "i really need to finally submit the tax return before the end of the month",
    now: REF,
    expect: { isTask: true, titleConveys: "submitting the tax return" },
  },
  {
    name: "non-task: question",
    input: "what's the weather like tomorrow?",
    now: REF,
    expect: { isTask: false },
  },
  {
    name: "non-task: gibberish",
    input: "asdfjkl qwerty",
    now: REF,
    expect: { isTask: false },
  },
];
