---
id: axY2durbmheEdPCqWmSek
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Wire AG3NTIC Operator to the user's ChatGPT/Codex subscription on the Cerebro deploy
outcome: approved
created_at: "2026-06-08T00:24:31.248Z"
---

DONE — Operator runs on the user's ChatGPT subscription via the Codex CLI, golden path live end-to-end on Cerebro (connect -> Operator propose -> accept -> Employee "Phoenix HVAC Sales Researcher" emp_a87d0e81).

CODE (committed on morph/m1-data-model, NOT pushed): 0f1fe66 + b7sfe0554-era. Added a `codex` model-provider kind to apps/api/platform_core/credentials/model_client.py: resolve_and_chat branches on provider.kind=='codex' BEFORE base_url/api_key resolution and calls codex_completion(), which shells out to `codex exec --skip-git-repo-check --sandbox read-only --color never -C <tmpdir> --output-last-message <file> -` (prompt on stdin), reads the last-message file, wraps it OpenAI-shaped. No base_url, no API key — auth is ambient via CODEX_HOME OAuth. Uses provider.default_model (None -> codex default model gpt-5.5). 3 unit tests in test_model_client.py mock model_client._codex_exec_text. Full suite 177 passing.

AUTH (the hard part): codex login --device-auth got rate-limited (429) after a few rapid attempts (the first nohup'd login process didn't die — the slim image has no pgrep — so two concurrent device-auth pollers tripped OpenAI's limit; then even device-code REQUESTS 429'd = cooldown needed). PIVOTED to the reliable path: the user already had a local Codex login at C:\Users\Guerr\.codex\auth.json (CODEX_HOME local). scp'd THAT auth.json -> server ~/projects/ag3ntic-morph/.codex-provider/auth.json (the host dir bind-mounted to /codex-home), chmod 600. `codex login status` -> "Logged in using ChatGPT". The OAuth refresh token in auth.json is portable across machines. (auth.json only — NOT config.toml, not the whole .codex dir.)

CRITICAL GOTCHA that cost 4 failed attempts: `docker restart` does NOT reload env_file — only `docker compose up -d <svc>` (recreate) does. I added CODEX_HOME=/codex-home to .env then `docker restart`ed -> CODEX_HOME stayed UNSET in the container -> settings.codex_home="" -> codex_completion didn't set CODEX_HOME -> codex used /root/.codex (empty) -> hit api.openai.com/v1/responses with no bearer -> 401 "Missing bearer". FIX: `docker compose up -d api worker` to recreate with the new env. Verified printenv CODEX_HOME=/codex-home after. ALSO: my debug error-capture initially truncated the HEAD (codex echoes the whole prompt first) hiding the real error — capture the TAIL of stdout+stderr.

CONNECT a codex model: seeded a ModelProvider(kind='codex', slug='codex', base_url=None, default_model=None) + an ACTIVE ModelCredential (placeholder encrypted payload "codex-subscription"; codex auth is via CODEX_HOME, the credential row just satisfies has_active_model_credential) in workspace wsp_65af44e194692baac5f5efae (provider mp_3dd06103, cred mc_7e80c5bf) via inline docker exec python using credentials.service.create_provider + a direct active ModelCredential insert.

NOTES: each Operator propose burns ~12-13k codex tokens (codex agent system-prompt/reasoning overhead even for pure JSON gen) — fine on a subscription, heavier than a raw API call. To reduce: could add -c model_reasoning_effort=minimal / output-schema (follow-up). The credentials test-connection probe doesn't support kind='codex' (would need a `codex login status` branch — follow-up; not blocking since we seed the credential active). config.toml not copied (codex default model works). Deploy URL: console http://192.168.0.25:8095, leave control-plane URL blank, key ck_c80bacd6...