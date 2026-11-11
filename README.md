# SynapseHealer 🧠⚡

**Autonomous Dead-Letter & Schema Healer for InterSystems IRIS Interoperability**  
*InterSystems Programming Contest: AI Agents in Interoperability Workflows*

[![InterSystems IRIS](https://img.shields.io/badge/InterSystems%20IRIS-2027.1%20AI%20Hub-blue.svg)](https://evaluation.intersystems.com/Eval/early-access/AIHub)
[![IPM Package](https://img.shields.io/badge/IPM-synapse--healer%20v1.0.1-emerald.svg)](module.xml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 Executive Summary

In enterprise healthcare and commerce, the **Dead-Letter Queue (DLQ)** is notoriously known as the *graveyard of critical transactions*. When third-party vendors update formats without notice, emit malformed dates, swap HL7 segments, or stringify numeric fields, integration engines reject the messages. In traditional workflows, these messages sit in the DLQ until an engineer manually reviews, edits, and re-injects them days or weeks later.

**SynapseHealer** transforms the dead-letter queue into an **autonomous, self-healing interoperability pipeline**:
1. **Intercepts & Ingests**: A Custom Inbound Adapter with Embedded Python captures or synthetically generates realistic anomalies.
2. **Vector Similarity Diagnosis**: Native IRIS Vector Search (`VECTOR_COSINE`) queries a 384-dimensional `%AI.RAG` knowledge base of validated repair runbooks in `< 45ms`.
3. **Governed Decision Agent**: An InterSystems `%AI.Agent` with governed tools (`SearchRunbookRAG`, `ValidateRepairedPayload`, `CalculateRiskScore`) diagnoses root causes, repairs corrupted schemas, and validates compliance.
4. **Tri-Branch Delivery**: High-confidence repairs (`Confidence >= 88%`, `Risk = LOW`) are automatically dispatched downstream; ambiguous or risky payloads are escalated to the **InterSystems Workflow Engine** for Human-in-the-Loop (HITL) approval; unrecoverable corruption is safely isolated in the Quarantine Vault.
5. **Real-Time Observability**: A Next.js 14 dashboard provides live telemetry, 1-click chaos scenario injection, side-by-side diffing, and one-click operator task approvals.

---

### 🎥 Live Video Walkthrough & Interactive Demo

![SynapseHealer Live Walkthrough](docs/demo/synapse-healer-demo.gif)

> 📹 **Watch Full HD Video**: [`docs/demo/synapse-healer-walkthrough.mp4`](docs/demo/synapse-healer-walkthrough.mp4) (1080p 25fps) showing real-time chaos injection, automatic HL7 segment re-ordering, JSON type coercion, and Human Workflow task approval.

---

## 🏆 Contest Bonuses

Point values are the official ones from the [Technology Bonuses post](https://community.intersystems.com/post/technology-bonuses-intersystems-programming-contest-ai-agents-interoperability-workflows). The organisers decide what is awarded; the [bonus results table](https://community.intersystems.com/post/technology-bonus-results-intersystems-programming-contest-ai-agents-interoperability-workflows) is the source of truth.

| Bonus | Points | Where it is in SynapseHealer | Status |
| :--- | :---: | :--- | :--- |
| Custom Adapter | 2 | [`Synapse.Adapter.DeadLetterInbound`](src/Synapse/Adapter/DeadLetterInbound.cls) extends `Ens.InboundAdapter` (file drop polling plus a chaos generator) and is the adapter of [`Synapse.Service.ChaosIngestService`](src/Synapse/Service/ChaosIngestService.cls) | Awarded |
| Embedded Python | 3 | `[ Language = python ]` methods: embeddings in [`SchemaKnowledgeBase`](src/Synapse/RAG/SchemaKnowledgeBase.cls), repair routines in [`AuditTelemetry`](src/Synapse/Data/AuditTelemetry.cls), validation and risk tools in [`HealerTools`](src/Synapse/Agent/HealerTools.cls) | Awarded |
| IRIS Vector Search | 2 | `VECTOR(DOUBLE, 384)` column in [`Synapse.RAG.HealingRunbook`](src/Synapse/RAG/HealingRunbook.cls), searched with SQL `VECTOR_COSINE` | Awarded |
| Docker | 2 | [`Dockerfile`](Dockerfile) and [`docker-compose.yml`](docker-compose.yml), `docker compose up -d` | Awarded |
| First article on DC | 2 | [Building SynapseHealer: my journey creating a self-healing data pipeline](https://community.intersystems.com/post/building-synapsehealer-my-journey-creating-self-healing-data-pipeline) | Awarded |
| Video | 3 | [`docs/demo/synapse-healer-walkthrough.mp4`](docs/demo/synapse-healer-walkthrough.mp4), downloadable without signing in | Awarded |
| Workflow Engine | 2 | Escalations become `EnsLib.Workflow.TaskRequest` tasks for the **SynapseReviewers** role, delivered by the `EnsLib.Workflow.Operation` item of the same name in [`Synapse.Production`](src/Synapse/Production.cls). The role and its reviewers are created by [`Synapse.Config.WorkflowSetup`](src/Synapse/Config/WorkflowSetup.cls); Approve/Reject in the Workflow inbox is handled by [`Synapse.Workflow.ReviewTaskResponse`](src/Synapse/Workflow/ReviewTaskResponse.cls). See [Human review with the Workflow Engine](#human-review-with-the-workflow-engine) | Requested |
| ZPM / IPM package | 2 | [`module.xml`](module.xml), `zpm "install synapse-healer"` | Requested once the package is published |
| Second article on DC | 1 | _link to be added when published_ | Not yet |

Not claimed: Questionnaire, PEX, online demo, AI Hub or Embedded Python bug reports, Community Idea.

---

## 🏗️ Architecture & Pipeline Flow

```mermaid
flowchart TD
    subgraph Inbound ["1. Chaos & Dead-Letter Ingestion"]
        A["Inbound DLQ / Malformed Messages"] --> B["Synapse.Adapter.DeadLetterInbound<br/>(Custom Adapter + Embedded Python)"]
        B --> C["Synapse.Service.ChaosIngestService<br/>(Business Service)"]
        C -->|Audit to ^Synapse.DLQ| D["Synapse.Msg.DeadLetterRequest"]
    end

    subgraph Process ["2. Governed Decision & Repair"]
        D --> E["Synapse.Process.DeadLetterHealerBP<br/>(Business Process / Arbitrator)"]
        E --> F["Synapse.RAG.SchemaKnowledgeBase<br/>(IRIS Vector Search: VECTOR_COSINE)"]
        F -.->|Cosine Similarity >= 0.85| E
        E --> G["Synapse.Agent.DeadLetterHealerAgent<br/>(%AI.Agent / Replay Engine)"]
        G --> H["Synapse.Agent.HealerToolSet<br/>(Governed HealerTools)"]
        H -.->|ValidateRepairedPayload| G
        G --> I["Synapse.Msg.HealResponse"]
    end

    subgraph Outbound ["3. Tri-Branch Delivery & HITL"]
        I --> J{Confidence & Risk Evaluation}
        J -->|Confidence >= 0.88<br/>Risk LOW| K["Synapse.Operation.ResubmitDeliveryOp<br/>(Downstream Dispatch -> /tmp/synapse/delivered)"]
        J -->|Risk HIGH / Confidence < 0.88| L["Synapse.Operation.WorkflowEscalationOp<br/>(InterSystems Workflow Engine -> TaskQueue)"]
        J -->|Corrupt / Critical Risk| M["Synapse.Operation.QuarantineVaultOp<br/>(Isolated Vault -> /tmp/synapse/quarantine)"]
    end

    subgraph UI ["4. Next.js Observability & HITL Workspace"]
        N["Synapse.REST.Dispatch (/api/synapse)"] <---> O["Next.js 14 Dashboard (ui/)"]
        O -.->|Operator APPROVE / REJECT| L
        O -.->|Inject 7 Canonical Scenarios| B
    end
```

---

## ⚡ The 7 Canonical Chaos Scenarios

SynapseHealer includes ready-to-test runbooks and regression handlers for 7 canonical enterprise failure patterns:

| ID | Title | Format | Root Cause Flaw | Healed State | Decision Branch |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **1** | **Swapped PID/PV1 Segments** | `HL7` | Upstream vendor sent `PV1` visit segment before `PID` patient segment in `ADT^A01` | Segments re-ordered to strict HL7 v2.5.1 grammar (`MSH -> EVN -> PID -> PV1`) | `AUTO_HEAL` |
| **2** | **Invalid Date Format** | `HL7` | Slash format `1985/02/31` or out-of-bounds leap date rejected by strict parser | Normalized to canonical HL7 `YYYYMMDD` (`19850228`) | `AUTO_HEAL` |
| **3** | **Unescaped Delimiter** | `HL7` | Unescaped pipe delimiter `\|` inside clinical complaint notes | Escaped to standard `\F\` delimiter sequence | `AUTO_HEAL` |
| **4** | **Stringified Numbers & Currency** | `JSON` | Unit price `"$450.00"`, quantity `"5"`, and boolean `"true"` stringified | Converted to numeric floats `450.0`, integers `5`, and boolean `true` | `AUTO_HEAL` |
| **5** | **Vendor Key Drift (v2 Migration)** | `JSON` | Vendor updated schema to snake_case (`cust_id`, `trans_dt`) | Mapped to canonical enterprise schema (`customerId`, `orderDate`) | `AUTO_HEAL` |
| **6** | **Epoch Millis Timestamps** | `JSON` | Order date sent as Unix milliseconds integer `1710504000000` | Converted to ISO-8601 UTC timestamp `2024-03-15T12:00:00Z` | `AUTO_HEAL` |
| **7** | **Corrupted Array Nesting** | `JSON` | Complex order payload received with missing arrays and nested structures | Structural schema repair; flagged with `Risk: MEDIUM_HIGH` | `HUMAN_WORKFLOW` |

---

## 🚀 Quick-Start Guide for Judges

### 1. Prerequisites & InterSystems IRIS AI Hub Container Image

SynapseHealer runs on the official **InterSystems IRIS Community AI Hub Early Access Program (EAP)** build:
- **EAP Download Portal**: [https://evaluation.intersystems.com/Eval/early-access/AIHub](https://evaluation.intersystems.com/Eval/early-access/AIHub)
- Supported builds: `2027.1.0AI.109.0` or `2026.3.0AI.154.0`.

> **Why build 109?** The contest announcement asks for build 154, but by early November the EAP portal only offered the 2027.1 builds. The organisers confirmed in the announcement comments that build 109 can be used and that judges will use the build each app names. SynapseHealer is developed and tested on `2027.1.0AI.109.0`; `module.xml` keeps `Version=">=2026.3"` so it also installs on 154.

#### Loading the Docker Tarball
```bash
# For x86_64:
docker load -i iris-community-2027.1.0AI.109.0-docker.tar.gz

# (Optional) Tag image if using standard tag:
docker tag iris-community:2027.1.0AI.109.0 iris-community:2026.3.0AI.154.0

# For ARM64 (Apple Silicon):
docker load -i iris-community-arm64-2027.1.0AI.109.0-docker.tar.gz
```

---

### 2. Zero-Key Replay Mode vs. Live AI Hub Mode

SynapseHealer offers two seamless operating modes:

#### Mode A: Zero-Key Replay Mode (Default — Zero API Keys Required)
Judges can test 100% of the functionality, vector similarity search, governed tool call sequences, side-by-side payload transformations, and human workflow approvals immediately without providing an external API key:
```bash
# 1. Start the IRIS container (iris.script auto-configures SYNAPSE and starts the production)
docker compose up -d

# 2. Start the Observability UI
cd ui
npm install
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

#### Mode B: Live AI Hub Mode (Gemini or OpenAI)
To enable live LLM reasoning via `%AI.Agent`:
```bash
# Copy environment configuration
cp .env.example .env

# Edit .env:
SYNAPSE_MODE=live
LLM_PROVIDER=gemini           # or openai
LLM_API_KEY=your_gemini_or_openai_key
LLM_MODEL=gemini-1.5-flash    # or gpt-4o-mini

# Restart container
docker compose up -d
```
Credentials are saved into the secure **InterSystems IRIS Wallet (`%Wallet.KeyValue`)** without ever exposing secrets in plaintext logs.

---

## 🖥️ Next.js Observability & HITL Dashboard (`ui/`)

The web UI is built with **Next.js 14 (App Router)**, **TypeScript**, and **Tailwind CSS**:

```bash
cd ui
npm run dev
```

### Dashboard Features:
1. **Top Telemetry Ribbon**: Real-time status badge (`REPLAY MODE` vs `LIVE AI HUB`), Interoperability production online indicator, Auto-Heal Rate KPI (`90%+`), cumulative token counters, inference cost tracker (USD), and average latency monitor.
2. **Panel 1 (Chaos Injector)**: 1-click execution for all 7 canonical error scenarios, plus a **Custom Payload Injection Modal** allowing judges to paste any raw HL7 or JSON message.
3. **Panel 2 (Side-by-Side Diff & Agent Reasoning)**:
   - **Left**: Malformed inbound payload with exact validation error.
   - **Center**: Matched `%AI.RAG` runbook, narrative agent diagnosis, and step-by-step governed tool execution trace (`SearchRunbookRAG` -> `ValidateRepairedPayload` -> `CalculateRiskScore`).
   - **Right**: Schema-validated healed payload marked for automated downstream dispatch.
4. **Panel 3 (Multi-Tab Inspector)**:
   - **Human Workflow Queue**: Review pending tasks escalated by `WorkflowEscalationOp`. Click **Approve** (routes to `ResubmitDeliveryOp`) or **Reject** (routes to `QuarantineVaultOp`) with operator notes.
   - **IRIS Vector Search Runbooks**: Live inspector of all 10 vector-indexed schema repair patterns.
   - **Live Telemetry Traces**: Chronological audit ledger stored in `Synapse_Data.AuditTelemetry`.

---

## 📡 Live REST API Reference (`/api/synapse`)

All endpoints are hosted natively by [`Synapse.REST.Dispatch`](src/Synapse/REST/Dispatch.cls) under the `/api/synapse` CSP web application on port `52773`:

### 1. System Health & Aggregate Telemetry
```bash
curl -u _SYSTEM:SYS http://localhost:52773/api/synapse/status
```
**Sample Response:**
```json
{
  "mode": "replay",
  "llmProvider": "gemini",
  "llmModel": "gemini-1.5-flash",
  "hasApiKey": 0,
  "productionRunning": 1,
  "runbookCount": 10,
  "totalProcessed": 10,
  "autoHealedCount": 9,
  "workflowPendingCount": 0,
  "quarantinedCount": 0,
  "totalTokens": 6631,
  "estimatedCostUSD": 0.0018,
  "avgLatencyMs": 145,
  "autoHealRate": 90.0
}
```

### 2. Inject Chaos Scenario Live
```bash
# Inject Scenario 4 (Stringified numbers in JSON order)
curl -X POST -u _SYSTEM:SYS http://localhost:52773/api/synapse/inject \
  -H "Content-Type: application/json" \
  -d '{"scenarioId": 4}'

# Inject Scenario 1 (HL7 PID/PV1 swapped fields)
curl -X POST -u _SYSTEM:SYS http://localhost:52773/api/synapse/inject \
  -H "Content-Type: application/json" \
  -d '{"scenarioId": 1}'
```

### 3. Query Active Workflow Tasks
```bash
curl -u _SYSTEM:SYS http://localhost:52773/api/synapse/workflow/tasks
```

### 4. Approve or Reject a Workflow Task
```bash
curl -X POST -u _SYSTEM:SYS http://localhost:52773/api/synapse/workflow/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "payloadId": "SYN-HL7-D9B31D3B",
    "action": "APPROVE",
    "reviewerNotes": "Approved by contest judge"
  }'
```

---

## Human review with the Workflow Engine

When the agent's decision is `HUMAN_WORKFLOW` (medium confidence or risky repairs), the payload is not resubmitted until a person decides.

1. `Synapse.Process.DeadLetterHealerBP` sends the `HealResponse` to `Synapse.Operation.WorkflowEscalationOp`. Payloads injected through `POST /api/synapse/inject` reach the same operation through `Synapse.Service.WorkflowDispatchService`.
2. `WorkflowEscalationOp` records the task in `^Synapse.WorkflowQueue` (used by the dashboard) and sends an `EnsLib.Workflow.TaskRequest` with actions `Approve,Reject` to the production item **SynapseReviewers** (class `EnsLib.Workflow.Operation`). The Workflow Engine uses that item name as the role, so the task appears in the Workflow inbox of every member of the role.
3. `Synapse.Config.WorkflowSetup.Setup()` creates the role and adds the reviewers (default `_SYSTEM,SuperUser`; override with the `SYNAPSE_REVIEWERS` environment variable). It runs from `iris.script` during the Docker build and from `SetupAll` during an IPM install, and it is safe to run again.
4. A reviewer approves or rejects in **Management Portal > Interoperability > Workflow Inbox**. The task handler `Synapse.Workflow.ReviewTaskResponse.OnAction` calls the same `Approve()` / `Reject()` methods as the dashboard: approve resubmits through `ResubmitDeliveryOp`, reject goes to `QuarantineVaultOp`.
5. The dashboard and `POST /api/synapse/workflow/resolve` still work. A decision taken there also removes the task from the Workflow inbox, and whichever decision comes first wins; a second decision on the same payload changes nothing.

### Smoke test

With the container running:

```bash
./scripts/smoke_test.sh synapse-iris SYNAPSE
```

It runs `Synapse.Test.WorkflowSmoke.Run()`, which checks that the role and reviewers exist, that an escalation creates a Workflow task for **SynapseReviewers**, that approving it through the Workflow Engine resubmits the payload, that dashboard decisions clear the inbox, and that the seven replay scenarios still produce decisions. It prints one PASS/FAIL line per check.

---

## 📦 InterSystems Package Manager (IPM / ZPM)

- Manifest: [`module.xml`](module.xml) (module `synapse-healer`, version 1.0.1)
- Requirement: `<SystemRequirements Version=">=2026.3" Interoperability="enabled"/>`, so it needs an AI Hub build (154 or 109) and a namespace with Interoperability enabled.
- Installs the `Synapse` package, the `/api/synapse` web application, and runs `Synapse.Config.AIHubSetup.SetupAll()` (credentials, Workflow role, runbooks, replay telemetry, production start).

```objectscript
// From the community registry (after the package is published):
zpm "install synapse-healer"

// From a local clone:
zpm "load /path/to/synapse-healer -v"
```

---

## 📂 Source Code Map

| Class | Type | Purpose |
| :--- | :--- | :--- |
| [`Synapse.Adapter.DeadLetterInbound`](src/Synapse/Adapter/DeadLetterInbound.cls) | `Ens.InboundAdapter` | Custom Inbound Adapter with Embedded Python chaos generator |
| [`Synapse.Service.ChaosIngestService`](src/Synapse/Service/ChaosIngestService.cls) | `Ens.BusinessService` | Inbound Business Service auditing DLQ events to `^Synapse.DLQ` |
| [`Synapse.Msg.DeadLetterRequest`](src/Synapse/Msg/DeadLetterRequest.cls) | `Ens.Request` | Inbound payload container with global character stream helpers |
| [`Synapse.Msg.HealResponse`](src/Synapse/Msg/HealResponse.cls) | `Ens.Response` | Outbound response carrying healed content, confidence, risk, and tool traces |
| [`Synapse.RAG.HealingRunbook`](src/Synapse/RAG/HealingRunbook.cls) | `%Persistent` | IRIS Vector Search table with `VECTOR(DOUBLE, 384)` |
| [`Synapse.RAG.SchemaKnowledgeBase`](src/Synapse/RAG/SchemaKnowledgeBase.cls) | Utility | Vector embedding generator and SQL `VECTOR_COSINE` search engine |
| [`Synapse.Config.AIHubSetup`](src/Synapse/Config/AIHubSetup.cls) | Config | Secure IRIS Wallet credential manager and AI Hub configuration |
| [`Synapse.Data.AuditTelemetry`](src/Synapse/Data/AuditTelemetry.cls) | `%Persistent` | Persistent telemetry table and Deterministic Replay Engine |
| [`Synapse.Agent.HealerTools`](src/Synapse/Agent/HealerTools.cls) | `%AI.Tool` | Governed tools (`SearchRunbookRAG`, `ValidateRepairedPayload`, `CalculateRiskScore`) |
| [`Synapse.Agent.HealerToolSet`](src/Synapse/Agent/HealerToolSet.cls) | `%AI.ToolSet` | Governed toolset definition for `%AI.Agent` |
| [`Synapse.Agent.DeadLetterHealerAgent`](src/Synapse/Agent/DeadLetterHealerAgent.cls) | `%AI.Agent` | Autonomous schema diagnosis and repair agent |
| [`Synapse.Process.DeadLetterHealerBP`](src/Synapse/Process/DeadLetterHealerBP.cls) | `Ens.BusinessProcess` | Core triage coordinator and arbitrator |
| [`Synapse.Operation.ResubmitDeliveryOp`](src/Synapse/Operation/ResubmitDeliveryOp.cls) | `Ens.BusinessOperation` | Outbound delivery operation to `/tmp/synapse/delivered` |
| [`Synapse.Operation.WorkflowEscalationOp`](src/Synapse/Operation/WorkflowEscalationOp.cls) | `Ens.BusinessOperation` | Records escalations and sends Workflow tasks to the SynapseReviewers role |
| [`Synapse.Config.WorkflowSetup`](src/Synapse/Config/WorkflowSetup.cls) | Config | Creates the SynapseReviewers Workflow role and its reviewers (idempotent) |
| [`Synapse.Workflow.ReviewTaskResponse`](src/Synapse/Workflow/ReviewTaskResponse.cls) | `EnsLib.Workflow.TaskResponse` | Applies Approve/Reject from the Workflow inbox |
| [`Synapse.Service.WorkflowDispatchService`](src/Synapse/Service/WorkflowDispatchService.cls) | `Ens.BusinessService` | Sends REST-injected escalations into the production |
| [`Synapse.Test.WorkflowSmoke`](src/Synapse/Test/WorkflowSmoke.cls) | Test | Workflow and simulation smoke test |
| [`Synapse.Operation.QuarantineVaultOp`](src/Synapse/Operation/QuarantineVaultOp.cls) | `Ens.BusinessOperation` | Outbound isolation operation to `/tmp/synapse/quarantine` |
| [`Synapse.Production`](src/Synapse/Production.cls) | `Ens.Production` | Complete Interoperability pipeline wiring all services, processes, and operations |
| [`Synapse.REST.Dispatch`](src/Synapse/REST/Dispatch.cls) | `%CSP.REST` | REST dispatch handler mapped to `/api/synapse` |

---

## 📄 License & Acknowledgements

- Built for the **InterSystems Programming Contest: AI Agents in Interoperability Workflows (2026)**.
- Licensed under the [MIT License](LICENSE).
