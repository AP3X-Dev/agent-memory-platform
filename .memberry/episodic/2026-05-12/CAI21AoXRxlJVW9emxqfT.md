---
id: CAI21AoXRxlJVW9emxqfT
session_id: session-20260512-080500
agent_id: mcp
task: [project:oni-grid] optimization session 14: Item #13 agentDetector line-count cap
outcome: approved
created_at: "2026-05-12T15:10:06.200Z"
---

[project:oni-grid] Session 14 in `beedb56`. Added `bufferMaxLines` (default 500) as a third optional constructor arg to AgentDetector, alongside the existing `bufferMaxSize` (chars, default 2000). detect() counts newlines after the char-trim and walks past extras to keep the tail.

Convention established:
- **Two caps, two failure modes.** Char cap defends against dense long output; line cap defends against newline-spam that defeats the char cap. Both run in the same detect() call. Either can trigger first depending on the input shape. Realistic agent output averages 30-80 chars/line so char-cap fires first; line-cap is defense-in-depth.
- **Lines = newlines + (non-empty ? 1 : 0).** Off-by-one matters: a buffer ending without a trailing newline still has N+1 lines where N is the newline count. My first pass used pure newline-count and was off by one when trimming. Linter caught and fixed via the +1 rule. Trim-loop semantic: walk past `(currentLines - maxLines)` newlines, slice from the byte after the last walked newline.
- **String-walk over split.** `charCodeAt(i) === 10` is O(n) no-alloc; `text.split('\n').length` allocates an array proportional to line count. detect() runs on every PTY data chunk so the hot path matters. The trim itself is conditional on `lineCount > maxLines` — when under cap (the common case), only the count loop runs.
- **Constructor arg additions are append-only.** Added bufferMaxLines as the third positional rather than restructuring to an options object because no callers override the existing second arg. If a fourth cap is added later, switching to an options object is a cleaner break point.

Verification: TS 1487/1487 (+3), all checks green. 90-line diff.

Status of optimization run so far this conversation:
- Session 11: Item #30 first pass (coordinator blocked-question routing)
- Session 12: Item #11 EventTimeline
- Session 13: Item #12 + 2 discovery caps (pane.output, chatMessages, costAlerts)
- Session 14: Item #13 agentDetector line cap

11/30 backlog items now complete plus 3 discovery items. Next: #14 (configurable cost tracker / detector constants).