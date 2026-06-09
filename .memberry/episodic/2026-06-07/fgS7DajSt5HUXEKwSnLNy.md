---
id: fgS7DajSt5HUXEKwSnLNy
session_id: session-20260607-model-client
agent_id: mcp
task: Build provider-agnostic model client in platform_core/credentials/model_client.py
outcome: approved
created_at: "2026-06-07T15:46:05.955Z"
---

Built model_client.py (Foundation 8.5). Public API: chat_completion(*, base_url, api_key, model_id, messages, temperature=None, max_tokens=None, stream=False, timeout=60, provider_type=None, extra_headers=None) and resolve_and_chat(session, workspace_id, model_credential_id, *, model_id=None, base_url=None, **kwargs).

Key conventions discovered/honored:
- model_credentials has a SINGLE encrypted_payload LargeBinary column and NO separate nonce column. Storage convention (matching platform_core/credentials/service.py _pack_payload/_unpack_payload) is nonce(12 bytes) || ciphertext. crypto.encrypt_value returns (ciphertext, nonce); split payload[:12]/payload[12:] on decrypt. _NONCE_BYTES=12.
- Provider.kind is the provider_type (openai_compatible|openrouter|anthropic|nous_portal|local). base_url + default_model live on ModelProvider.
- Anthropic native (base_url contains api.anthropic.com) -> translate to /v1/messages: x-api-key + anthropic-version 2023-06-01 headers, hoist system messages out, require max_tokens (default 1024), normalize response back to OpenAI choices shape. Otherwise OpenAI-compatible: POST {base_url}/chat/completions, Bearer auth.
- Stream parses SSE data: lines, choices[0].delta.content, stops on [DONE].
- Errors: 429->RateLimitError, other 4xx/5xx + transport(httpx.HTTPError)->ProviderError; missing base_url/model/empty key->secret_missing; missing credential/provider->not_found; InvalidTag->ProviderError.

Test gotcha for tests/: User model has NO 'role' column (uses 'status'); Workspace has NO 'owner_user_id'/'status' columns (uses slug/plan/settings/deleted_at). The conftest creds fixture passes role=/owner_user_id= which is actually invalid against the v2 schema. Tests mock httpx via httpx.MockTransport injected by monkeypatching model_client.httpx.AsyncClient (respx is NOT installed; httpx 0.28.1). 8/8 tests pass.