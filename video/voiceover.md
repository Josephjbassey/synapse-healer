# SynapseHealer Demo — Voiceover Script

**Target:** ~120 seconds  
**Voice:** Senior systems engineer. Direct, dry, no marketing hype. Occasional dark humor.  
**Pacing:** Pause after numbers. Let technical terms land.

---

**[0:00–0:10] Scene 1 — Title**  
"Dead letters don't stay dead. Not anymore."

**[0:10–0:25] Scene 2 — The Problem**  
"A vendor renames a field with no warning. An EHR emits February 31st. HL7 segments arrive out of order. The integration engine rejects them all. They sit in the dead-letter queue until someone opens a hex dump and writes a one-off script — days later, if at all."

**[0:25–0:40] Scene 3 — The Pipeline**  
"SynapseHealer replaces that with an autonomous pipeline: a custom inbound adapter, native vector search over repair runbooks, a governed AI agent, and a tri-branch router that auto-heals, escalates, or quarantines."

**[0:40–0:75] Scene 4 — The Three-Step Spine**  
"The agent can't improvise. It runs exactly three governed calls: search the runbook RAG index, validate the repair against strict schema rules, then calculate risk. Sub-45ms per lookup. Every step is verified before anything is resubmitted."

**[0:75–1:00] Scene 5 — Tri-Branch Routing**  
"High confidence, low risk goes to auto-heal. Ambiguous clinical data like an impossible date goes to human workflow for operator approval. Corrupted or malicious payload goes to the quarantine vault."

**[1:00–1:10] Scene 6 — IRIS Wallet**  
"API keys never touch plaintext logs. They're written into the IRIS Wallet at startup and referenced through env indirection, not embedded literals."

**[1:10–1:20] Scene 7 — Cost & Telemetry**  
"Four hundred seventy-nine prompt tokens, one seventy-six completion, zero point zero zero zero one eight dollars per heal. Less than one-fiftieth of a cent. Replay mode costs zero tokens."

**[1:20–1:30] Scene 8 — Closing**  
"It's not magic. It's governed tool calls, deterministic validation, and a telemetry table that actually gets read."

**[1:30–1:40] Scene 9 — Outro**  
(Music only — GitHub and Open Exchange URLs on screen)
