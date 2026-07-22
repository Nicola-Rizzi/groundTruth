// A stand-in for pre-groundTruth code: colors copy-pasted from a design mock
// instead of resolved from the token system. This is what the auditor agent
// is for — finding files exactly like this one and fixing them, one hex at a
// time, with a human approving each replacement before it's applied.
export const LegacyAlert = ({ kind }: { kind: "error" | "success" }) => (
  <div
    className={kind === "error" ? "bg-[#B91C1C] text-white" : "bg-[#15803D] text-white"}
  >
    {kind === "error" ? "Something went wrong." : "Saved."}
  </div>
);
