---
id: H-SR7GaVRSvAg1ev4CiKZ
session_id: drain-method-task3-2026-04-07
agent_id: mcp
task: [project:agent-assist-cr] Task 3: Add drain() method to DeepgramStreamClient
outcome: approved
created_at: "2026-04-07T23:45:55.360Z"
---

[project:agent-assist-cr] Added drain() method to DeepgramStreamClient for graceful WebSocket shutdown. The method sends finish() on each connection (mic, system) to tell DeepGram to flush its buffer, then waits up to a configurable timeout for both connections to close via threading.Event coordination. The _on_close callback now signals _drain_events[name].set() so drain() can unblock. If timeout expires, hard-closes remaining connections. Also added _drain_events Dict[str, threading.Event] to __init__. Created 5 tests in tests/test_deepgram_drain.py covering: both connections closing cleanly, timeout behavior, dead connections, stop_event being set, and late transcript delivery during drain window. All 5 new tests pass plus all 7 existing stream client tests.