# SynapseHealer: Building an Autonomous, Self-Healing Interoperability DLQ with InterSystems IRIS AI Hub

![SynapseHealer obsidian console](image_a46ca1.jpg)

Built for the InterSystems Programming Contest: AI Agents in Interoperability Workflows (2026)

## The problem: the DLQ is a graveyard

In healthcare and supply-chain integrations, the dead-letter queue is where transactions go to die. A vendor renames `client_uuid` to `customer_id` with no warning. An EHR bridge emits `1985-02-31`, an impossible calendar day. An HL7 `ADT^A01` arrives with `PV1` before `PID`. A lab note contains an unescaped pipe. The integration engine rejects the message, and it sits in the queue until an engineer opens a hex dump, decodes the schema violation, writes a one-off script, and resubmits — days later, if at all.

SynapseHealer replaces that manual bottleneck with an autonomous pipeline on InterSystems IRIS AI Hub: a custom inbound adapter, native vector search over repair runbooks, a governed `%AI.Agent`, and a tri-branch router that auto-heals, escalates to the InterSystems Workflow Engine, or quarantines.

## 1. AI Hub experience: DeadLetterHealerBP orchestrates the agent

`Synapse.Process.DeadLetterHealerBP` is the arbitrator. `OnRequest` takes a `Synapse.Msg.DeadLetterRequest` from `ChaosIngestService`, and `ProcessDeadLetter` picks the execution mode: `live` when `SYNAPSE_MODE=live` and an API key exists, otherwise `replay` — a deterministic mode that needs zero API keys.

In live mode it instantiates `Synapse.Agent.DeadLetterHealerAgent`, an `%AI.Agent` bound to `Synapse.Agent.HealerToolSet`, sends it the payload ID, source system, format, validation error, and raw body, strips any markdown fences, and parses the JSON contract: `decisionBranch`, `confidenceScore`, `riskLevel`, `matchedPatternId`, `healedPayload`, `reasoning`.

The agent cannot improvise. Its toolset — `Synapse.Agent.HealerToolSet` (`%AI.ToolSet`) wrapping `Synapse.Agent.HealerTools` (`%AI.Tool`) — exposes exactly three governed calls: `SearchRunbookRAG`, `ValidateRepairedPayload`, and `CalculateRiskScore`. It looks up the nearest verified runbook in the 384-dimensional vector index (`VECTOR_COSINE`, sub-45ms), applies the deterministic transformation, and must pass validation before anything is resubmitted.

Credentials never appear in plaintext logs. `Synapse.Config.AIHubSetup.StoreWalletSecret` writes the API key into the IRIS Wallet (`%Wallet.KeyValue`, collection `SynapseSecrets`, key `SynapseSecrets.LLMKey`) at startup, and `BuildProviderSettings` references it through `@{env:LLM_API_KEY}` indirection instead of embedding the literal key. The same setup registers `%ConfigStore` and `Ens.Config.Credentials` when those classes exist, with graceful fallback on builds that lack them.

## 2. Models and cost control

We default to `gemini-1.5-flash` (`gpt-4o-mini` is the OpenAI alternative). Heal decisions are structural, not creative, so a fast, cheap model is the right choice.

Every inference lands in `Synapse.Data.AuditTelemetry`, a persistent table storing prompt tokens, completion tokens, estimated USD cost, latency, the full tool-call trace, decision branch, risk level, and workflow status. Cost is computed from the counts — `prompt × 0.00000015 + completion × 0.0000006` — and written to the table in real time; the Next.js dashboard reads `/api/synapse/status` and shows the cumulative USD counter and auto-heal rate live.

Across our 10 regression suites: 479 prompt tokens, 176 completion tokens, $0.00018 per heal, ~145 ms end to end, 90% auto-heal rate across the seven canonical chaos scenarios. Replay mode consumes no tokens, and the telemetry table is pre-seeded with golden traces for every scenario, so the dashboard is populated from the first second.

## 3. Observability and tracing: the three-step spine

Each heal produces a governed three-step trace, stored in `ToolTraceJSON`:

1. `SearchRunbookRAG` — error and format in, matched runbook and similarity out (~42 ms)
2. `ValidateRepairedPayload` — strict HL7 v2 / JSON syntax and schema check (~56 ms)
3. `CalculateRiskScore` — clinical and financial risk classification (~35 ms)

The trace is surfaced live in the Next.js console: a step gauge per call, side-by-side diff of the corrupted and healed payloads, and the agent's reasoning. `HUMAN_WORKFLOW` messages land in the workflow queue where an operator Approves (→ `ResubmitDeliveryOp`) or Rejects (→ `QuarantineVaultOp`) with reviewer notes. Everything is queryable via `/api/synapse/workflow/tasks` and the persistent audit ledger.

## 4. IRIS agentic development: MCP build tooling, guardrails, %AI syntax, and IPM packaging

We separated development-time agentic tooling from runtime governance. During development, we paired our IDE with the `iris-agentic-dev` MCP toolkit (`iris_symbols_local` for local AST verification across 150+ symbols and `objectscript-guardrails` to enforce method-scoped `Quit` rules and `$IsObject` checks before container compilation). At runtime inside the container, governance is 100% native to IRIS AI Hub—powered by an `%AI.ToolSet` of `%AI.Tool` methods rather than an external sidecar.

The ObjectScript guardrails are the part I trust most:

- Every class is `ProcedureBlock`, and the business process checks `%Dictionary.CompiledClass.%ExistsId` before instantiating the agent, so a missing compile fails closed instead of guessing.
- The agent's system prompt enforces a response contract: one JSON document with fixed fields, no prose.
- `ValidateRepairedPayload` rejects messages that don't start with `MSH`, put `PV1` before `PID`, use non-`YYYYMMDD` dates in `PID-7`, leave unescaped pipes in `OBX`, or retain legacy keys like `client_uuid` after a v2 migration. `CalculateRiskScore` quarantines anything matching `<script`, `eval(`, `union select`, `drop table`, `--`, or `javascript:`, and escalates impossible dates like February 31 to human review.
- We learned the container-startup `<DIRECTORY>` bug the hard way: `Config.Databases.Create` registers the database in `iris.cpf` but does not format the physical `IRIS.DAT` file, crashing auto-start on restart. The fix: a declarative `merge.cpf` (`[Actions]`: `CreateDatabase`, `CreateNamespace`, `Interop=1`) plus an `iris.script` fallback that initializes `IRIS.DAT` via `SYS.Database` when absent.

For %AI syntax, the agent resolves its provider via `AIHubSetup.GetProviderConfig` and `BuildProviderSettings`, creates `%AI.Provider`, calls `agent.CreateSession()` then `agent.Chat(session, prompt)`, and parses the result with `%DynamicObject.%FromJSON`. It compiled cleanly on the IRIS 2027.1 AI Hub EAP build.

Packaging is automated: `module.xml` declares `<SystemRequirements Version=">=2026.3" Interoperability="enabled"/>`, and `SetupAll` — run by IPM on install — executes `Configure()` (Wallet, config store, credentials), seeds the runbooks and replay telemetry, then starts `Synapse.Production`. `zpm install synapse-healer` or `zpm load /opt/irisapp -v` gives you a running production with a seeded dashboard. The module shipped with +11 contest bonus points across the custom adapter, embedded Python, vector search, workflow engine, and IPM integration.

## Try it

```bash
# Prerequisite: Load the InterSystems AI Hub EAP tarball (Build 109 or 154)
# docker image load -i iris-community-2027.1.0AI.109.0-docker.tar.gz

git clone https://github.com/josephjbassey/synapse-healer.git
cd synapse-healer
docker compose up -d
cd ui && npm install && npm run dev
```

Open `http://localhost:3000`, press 1–7 to inject chaos payloads, and watch the pipeline heal them. No API key required; set `SYNAPSE_MODE=live` with an `LLM_API_KEY` for live AI Hub inference.

It's not magic. It's governed tool calls, deterministic validation, and a telemetry table that actually gets read.
