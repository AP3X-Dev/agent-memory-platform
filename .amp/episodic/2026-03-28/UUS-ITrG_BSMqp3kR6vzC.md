---
id: UUS-ITrG_BSMqp3kR6vzC
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Silent chunk detection (2d)
outcome: approved
created_at: "2026-03-28T08:38:27.449Z"
---

[project:cic2] Ported CIC1's is_silent() from stt_openai.py to runtime/audio/silence.py. Uses RMS + peak detection on WAV PCM data (threshold 0.015, peak threshold 5x). Integrated into PipelineOrchestrator.process_audio_frame() — silent chunks return [] immediately, skipping the Whisper API call. This saves API cost and processing time. Also updated all test WAV fixtures (in test_pipeline_orchestrator.py, test_pipeline_integration.py, test_session_pipeline_manager.py, test_e2e_pipeline_smoke.py) from all-zero silence to speech-level 440Hz tone so they pass silence detection. 7 new detection tests added. Note: test_e2e_pipeline_smoke.py has pre-existing pyaudiowpatch segfault on this machine's audio drivers.