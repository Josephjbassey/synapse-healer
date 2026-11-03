# SynapseHealer Demo Video — Scene Plan

**Target length:** ~2 minutes (120s)
**Aspect:** 16:9, 1920x1080
**Palette:** Neon tech (`#0A0A0A` bg, `#00F5FF` primary, `#FF00FF` secondary, `#39FF14` accent)
**Font:** Menlo (monospace throughout)
**Voice:** Senior systems engineer — direct, no marketing fluff, occasional dry humor

---

## Scene 1 — Title (0:00–0:10)
- Background: `#0A0A0A`
- Title: "SynapseHealer" (48px, `#00F5FF`, BOLD)
- Subtitle: "Autonomous Self-Healing DLQ on InterSystems IRIS AI Hub" (24px, `#888888`)
- One line below: "Dead letters don't stay dead." (20px, `#39FF14`, italic feel via weight)
- VO: "Dead letters don't stay dead. Not anymore."

## Scene 2 — The Problem: DLQ Graveyard (0:10–0:25)
- Visual: A vertical queue on the left labeled "DLQ"
- Seven message boxes stack up, each labeled with a chaos scenario:
  1. PID/PV1 swapped (HL7)
  2. Invalid date `1985-02-31` (HL7)
  3. Unescaped pipe `\|` (HL7)
  4. Stringified `"$450.00"` (JSON)
  5. `client_uuid` → `customer_id` drift (JSON)
  6. Epoch millis timestamp (JSON)
  7. Corrupted array nesting (JSON)
- Each box pulses red, then freezes
- An engineer icon appears with a hex dump, scratching head
- VO: "A vendor renames a field with no warning. An EHR emits February 31st. HL7 segments arrive out of order. The integration engine rejects them all. They sit in the dead-letter queue until someone opens a hex dump and writes a one-off script — days later."

## Scene 3 — The Pipeline (0:25–0:40)
- Visual: Left-to-right flow, boxes building up one at a time
  1. `Synapse.Adapter.DeadLetterInbound` (Embedded Python chaos generator)
  2. `Synapse.Process.DeadLetterHealerBP` (the arbitrator)
  3. `Synapse.Agent.DeadLetterHealerAgent` (%AI.Agent + HealerToolSet)
  4. Tri-branch router → AUTO_HEAL / HUMAN_WORKFLOW / QUARANTINE
- Arrows appear between boxes as each node is introduced
- VO: "SynapseHealer replaces that with an autonomous pipeline: a custom inbound adapter, native vector search over repair runbooks, a governed AI agent, and a tri-branch router that auto-heals, escalates, or quarantines."

## Scene 4 — The Three-Step Spine (0:40–0:75)
- Visual: Three numbered steps, left to right, each with icon + duration
  1. `SearchRunbookRAG` — VECTOR_COSINE, 384-dim, ~42ms
  2. `ValidateRepairedPayload` — HL7 v2 / JSON syntax check, ~56ms
  3. `CalculateRiskScore` — clinical/financial risk, ~35ms
- Each step highlights in sequence with a sub-45ms timer badge
- VO: "The agent can't improvise. It runs exactly three governed calls: search the runbook RAG index, validate the repair against strict schema rules, then calculate risk. Sub-45ms per lookup. Every step is verified before anything is resubmitted."

## Scene 5 — Tri-Branch Routing (0:75–1:00)
- Visual: Three paths diverge from the agent box
  - Green path: `AUTO_HEAL` → `ResubmitDeliveryOp` → `/tmp/synapse/delivered`
  - Amber path: `HUMAN_WORKFLOW` → `WorkflowEscalationOp` → operator Approve/Reject
  - Red path: `QUARANTINE` → `QuarantineVaultOp` → `/tmp/synapse/quarantine`
- Example: invalid date `1985-02-31` clamps to `19850228`, goes amber (HUMAN_WORKFLOW)
- VO: "High confidence, low risk → auto-heal. Ambiguous clinical data like an impossible date → human workflow for operator approval. Corrupted or malicious payload → quarantine vault."

## Scene 6 — Credentials: IRIS Wallet (1:00–1:10)
- Visual: `.env` file → arrow → `Synapse.Config.AIHubSetup.StoreWalletSecret` → IRIS Wallet vault (`%Wallet.KeyValue`, collection `SynapseSecrets`, key `SynapseSecrets.LLMKey`) → `@{env:LLM_API_KEY}` indirection
- No plaintext keys shown — redacted with `████`
- VO: "API keys never touch plaintext logs. They're written into the IRIS Wallet at startup and referenced through env indirection, not embedded literals."

## Scene 7 — Cost & Telemetry (1:10–1:20)
- Visual: `Synapse.Data.AuditTelemetry` table filling row by row
  - Prompt tokens: 479
  - Completion tokens: 176
  - Cost: $0.00018 per heal
  - Latency: ~145ms
  - Auto-heal rate: 90%
- Cumulative USD counter ticks up
- VO: "Every inference lands in the audit telemetry table — 479 prompt tokens, 176 completion, $0.00018 per heal. Less than one-fiftieth of a cent. Replay mode costs zero tokens."

## Scene 8 — Closing (1:20–1:30)
- Visual: `module.xml` IPM manifest, `zpm install synapse-healer`, dashboard at `localhost:3000`
- Final line: "It's not magic. It's governed tool calls, deterministic validation, and a telemetry table that actually gets read." (24px, `#00F5FF`)
- VO: "It's not magic. It's governed tool calls, deterministic validation, and a telemetry table that actually gets read."

## Scene 9 — Outro Card (1:30–1:40)
- GitHub repo URL, Open Exchange link, contest badge (+11 pts)
- VO: (optional music only)
