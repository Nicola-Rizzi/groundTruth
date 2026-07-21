#!/usr/bin/env bash
# Before/after storyboard for the asciinema recording — run this UNDER asciinema,
# not standalone: `asciinema rec demo.cast -c "./scripts/demo-storyboard.sh"`
# then convert with `agg demo.cast demo.gif`.
#
# It's fully scripted (no live typing) so the recording is reproducible and
# exactly ~60-70s every time. Requires: packages/groundtruth-mcp already built
# (`cd packages/groundtruth-mcp && npm run build`).
set -euo pipefail
cd "$(dirname "$0")/.."

pause() { sleep "${1:-1.4}"; }
beat()  { echo; sleep "${1:-0.6}"; }

clear 2>/dev/null || true
echo "# Task: add a delete button with the error color."
pause 2

echo
echo "## Without groundTruth — an agent guessing from training data:"
beat
cat <<'EOF'
<Button variant="danger" style={{ color: "#B91C1C" }}>
  Delete
</Button>
EOF
pause 2.5

echo
echo "## Two guesses, two wrong values. Compiles. Renders. Silently broken:"
echo '   - variant="danger"        -> not a real variant on this Button'
pause 1.2
echo '   - style={{ color: "#B91C1C" }} -> hardcoded hex, drifts the moment the token changes'
pause 3

echo
echo "----------------------------------------------------------------------"
pause 1.5

echo
echo "## With groundTruth — same task, agent asks first:"
beat
echo '$ get_component_api("button")'
pause 0.8
node packages/groundtruth-mcp/dist/index.js <<'RPC' 2>/dev/null | node -e '
  let data = "";
  process.stdin.on("data", d => data += d);
  process.stdin.on("end", () => {
    const msg = JSON.parse(data);
    console.log(msg.result.content[0].text);
  });
'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_component_api","arguments":{"name":"Button"}}}
RPC
pause 2.5

echo
echo '$ get_token("color.feedback.error")'
pause 0.8
node packages/groundtruth-mcp/dist/index.js <<'RPC' 2>/dev/null | node -e '
  let data = "";
  process.stdin.on("data", d => data += d);
  process.stdin.on("end", () => {
    const msg = JSON.parse(data);
    console.log(msg.result.content[0].text);
  });
'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_token","arguments":{"name":"color.feedback.error"}}}
RPC
pause 3

echo
echo "## Real values in hand — correct on the first try:"
beat
cat <<'EOF'
<Button variant="destructive" style={{ color: "rgb(var(--feedback-error))" }}>
  Delete
</Button>
EOF
pause 3

echo
echo "# No guessing. No drift. Grounded in the actual source of truth."
pause 2
