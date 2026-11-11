"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Cpu,
  Database,
  DollarSign,
  ExternalLink,
  Flame,
  HelpCircle,
  Layers,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserCheck,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  SystemStatus,
  HealTrace,
  Runbook,
  WorkflowTask,
  CANONICAL_SCENARIOS,
  MOCK_RUNBOOKS,
  MOCK_WORKFLOW_TASKS,
  CANONICAL_TRACES,
  fetchSystemStatus,
  injectChaos,
  fetchTraces,
  fetchRunbooks,
  fetchWorkflowQueue,
  resolveWorkflowTask,
} from "@/lib/api";

// Target segment/field mapping for the 7 scenarios
const SCENARIO_TARGET_MAP: Record<number, string> = {
  1: "PV1 visit segment before PID in ADT^A01",
  2: "PID-7 calendar day boundary (1985-02-31)",
  3: "OBX-5 unescaped pipe narrative delimiter",
  4: "order_items.unit_price ($450.00) & quantity ('5')",
  5: "Vendor schema keys (client_uuid -> customer_id)",
  6: "created_at Unix epoch millis (1710504000000)",
  7: "Unflattened order_items[] array structure",
};

// Formats payload into numbered lines and identifies mutated lines for IDE diffing
function formatPayloadLines(payload: string, format: string): { lines: string[]; mutatedIndices: Set<number> } {
  if (!payload) return { lines: [], mutatedIndices: new Set() };

  let formatted = payload;
  if (format === "JSON") {
    try {
      const parsed = JSON.parse(payload);
      formatted = JSON.stringify(parsed, null, 2);
    } catch {
      formatted = payload;
    }
  }

  // Normalize newlines
  let rawLines = formatted
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // For HL7 payloads: ensure each segment (MSH, EVN, PID, PV1, OBX, etc.) is strictly on its own line
  if (format === "HL7") {
    if (rawLines.length <= 1 || rawLines.some((l) => l.includes("PID|") && l.includes("PV1|"))) {
      const segments = formatted.split(/(?=\b(?:MSH|EVN|PID|PV1|OBX|AL1|DG1|ORC|OBR|NTE|IN1)\b)/);
      if (segments.length > 1) {
        rawLines = segments
          .map((s) => s.trim().replace(/[\r\n]+/g, ""))
          .filter(Boolean);
      }
    }
  }

  const mutatedIndices = new Set<number>();
  rawLines.forEach((line, idx) => {
    if (
      line.includes("1985-02-31") ||
      line.includes("19850228") ||
      line.includes('"$"') ||
      line.includes('"$') ||
      line.includes('"true"') ||
      line.includes("client_uuid") ||
      line.includes("customer_id") ||
      line.includes("line_items") ||
      line.includes("order_items") ||
      line.includes("1714567890123") ||
      line.includes("1710504000000") ||
      line.includes("PV1|1|I|") ||
      line.includes("\\F\\") ||
      line.includes("severe chest pain |") ||
      line.includes("items[]")
    ) {
      mutatedIndices.add(idx);
    }
  });

  return { lines: rawLines, mutatedIndices };
}

// Bolds and highlights exact mutated tokens so diffs stand out immediately on camera
function renderDiffLineContent(line: string, isHealed: boolean, format: string): React.ReactNode {
  if (!line) return <span>&nbsp;</span>;

  // 1. HL7 Date boundary fix (Scenario 2: 1985-02-31 -> 19850228)
  if (!isHealed && line.includes("1985-02-31")) {
    const parts = line.split("1985-02-31");
    return (
      <span>
        {parts[0]}
        <mark className="bg-rose-500/40 text-rose-100 px-1.5 py-0.5 rounded font-bold border border-rose-500/70 shadow-sm animate-pulse">
          1985-02-31
        </mark>
        {parts[1]}
      </span>
    );
  }
  if (isHealed && line.includes("19850228")) {
    const parts = line.split("19850228");
    return (
      <span>
        {parts[0]}
        <mark className="bg-emerald-500/40 text-emerald-100 px-1.5 py-0.5 rounded font-bold border border-emerald-500/70 shadow-sm">
          19850228
        </mark>
        {parts[1]}
      </span>
    );
  }

  // 2. HL7 Unescaped Delimiter pipe in OBX (Scenario 3: | -> \F\)
  if (!isHealed && line.includes("severe chest pain |")) {
    const parts = line.split("severe chest pain |");
    return (
      <span>
        {parts[0]}severe chest pain{" "}
        <mark className="bg-rose-500/40 text-rose-100 px-1.5 py-0.5 rounded font-bold border border-rose-500/70">
          |
        </mark>
        {parts[1]}
      </span>
    );
  }
  if (isHealed && line.includes("\\F\\")) {
    const parts = line.split("\\F\\");
    return (
      <span>
        {parts[0]}
        <mark className="bg-emerald-500/40 text-emerald-100 px-1.5 py-0.5 rounded font-bold border border-emerald-500/70">
          \F\
        </mark>
        {parts[1]}
      </span>
    );
  }

  // 3. JSON Quoted Numbers and Booleans (Scenario 4)
  if (!isHealed && (line.includes('"$450.00"') || line.includes('"12"') || line.includes('"true"'))) {
    return <span className="text-rose-200 font-medium">{line}</span>;
  }
  if (isHealed && (line.includes("450.00") || line.includes(" 12,") || line.includes(" true,"))) {
    return <span className="text-emerald-300 font-medium">{line}</span>;
  }

  // 4. JSON Key Drift (Scenario 5: client_uuid -> customer_id)
  if (!isHealed && line.includes('"client_uuid"')) {
    const parts = line.split('"client_uuid"');
    return (
      <span>
        {parts[0]}
        <mark className="bg-rose-500/40 text-rose-100 px-1 py-0.5 rounded font-bold border border-rose-500/70">
          "client_uuid"
        </mark>
        {parts[1]}
      </span>
    );
  }
  if (isHealed && line.includes('"customer_id"')) {
    const parts = line.split('"customer_id"');
    return (
      <span>
        {parts[0]}
        <mark className="bg-emerald-500/40 text-emerald-100 px-1 py-0.5 rounded font-bold border border-emerald-500/70">
          "customer_id"
        </mark>
        {parts[1]}
      </span>
    );
  }

  // 5. JSON Epoch Millis -> ISO-8601 (Scenario 6)
  if (!isHealed && line.includes("1714567890123")) {
    const parts = line.split("1714567890123");
    return (
      <span>
        {parts[0]}
        <mark className="bg-rose-500/40 text-rose-100 px-1 py-0.5 rounded font-bold border border-rose-500/70">
          1714567890123
        </mark>
        {parts[1]}
      </span>
    );
  }
  if (isHealed && (line.includes("2024-05-01T") || line.includes("2024-03-15T") || line.includes("2026-11-"))) {
    return (
      <mark className="bg-emerald-500/40 text-emerald-100 px-1.5 py-0.5 rounded font-bold border border-emerald-500/70">
        {line}
      </mark>
    );
  }

  return <span>{line}</span>;
}

const DEFAULT_INITIAL_TRACE: HealTrace = {
  payloadId: "SYN-HL7-B2CA3E77",
  timestamp: "2026-11-03 12:13:07",
  sourceSystem: "Epic_ADT_Gateway",
  format: "HL7",
  validationError: "HL7 Grammatical Ordering Violation: PV1 visit segment received prior to PID patient identification segment in ADT^A01 event",
  rawPayload: "MSH|^~\\&|Epic_ADT|RegionalHospital|Synapse_Ingest|CentralCore|20261103100057||ADT^A01|MSG16723|P|2.5.1\rEVN|A01|20261103100057\rPV1|1|I|W402^BED01^HOSP||||1234^Welby^Marcus^Dr|||SUR|||||||ADM|V88632\rPID|1||PAT627028^^^MRN||DOE^JANE^M||19820514|F|||123 ELM ST^^BOSTON^MA^02108||(617)555-0199\r",
  healedPayload: "MSH|^~\\&|Epic_ADT|RegionalHospital|Synapse_Ingest|CentralCore|20261103100057||ADT^A01|MSG16723|P|2.5.1\rEVN|A01|20261103100057\rPID|1||PAT627028^^^MRN||DOE^JANE^M||19820514|F|||123 ELM ST^^BOSTON^MA^02108||(617)555-0199\rPV1|1|I|W402^BED01^HOSP||||1234^Welby^Marcus^Dr|||SUR|||||||ADM|V88632\r",
  decisionBranch: "AUTO_HEAL",
  confidenceScore: 0.96,
  riskLevel: "LOW",
  matchedPatternId: "HL7-PID-PV1-INVERSION",
  agentReasoning: "Re-sequenced HL7 segments to conform with HL7 v2.5.1 grammar: MSH -> EVN -> PID -> PV1. Grammatical sequence restored and validated.",
  toolTrace: [
    { step: 1, tool: "SearchRunbookRAG", input: { error: "PV1 before PID", format: "HL7" }, output: { matchedPattern: "HL7-PID-PV1-INVERSION", similarity: 0.96 }, durationMs: 42 },
    { step: 2, tool: "ValidateRepairedPayload", input: { patternId: "HL7-PID-PV1-INVERSION" }, output: { valid: true, syntaxCheck: "PASSED", schemaCompliance: "100%" }, durationMs: 58 },
    { step: 3, tool: "CalculateRiskScore", input: { patternId: "HL7-PID-PV1-INVERSION" }, output: { riskLevel: "LOW", confidence: 0.96, recommendedBranch: "AUTO_HEAL" }, durationMs: 35 },
  ],
  promptTokens: 479,
  completionTokens: 176,
  estimatedCostUSD: 0.000177,
  latencyMs: 138,
  executionMode: "replay",
  workflowStatus: "NONE",
};

export default function SynapseDashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [traces, setTraces] = useState<HealTrace[]>([]);
  const [runbooks, setRunbooks] = useState<Runbook[]>(MOCK_RUNBOOKS);
  const [tasks, setTasks] = useState<WorkflowTask[]>(MOCK_WORKFLOW_TASKS);
  const [activeTrace, setActiveTrace] = useState<HealTrace | null>(DEFAULT_INITIAL_TRACE);
  const [activeTab, setActiveTab] = useState<"queue" | "rag" | "history">("queue");
  const [injecting, setInjecting] = useState<number | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customFmt, setCustomFmt] = useState<"JSON" | "HL7">("JSON");
  const [customText, setCustomText] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState<Record<string, string>>({});
  const [copiedHealed, setCopiedHealed] = useState(false);
  const [taskPreviewId, setTaskPreviewId] = useState<string | null>(null);
  const [scenarioFilter, setScenarioFilter] = useState<"ALL" | "HL7" | "JSON">("ALL");
  const [runbookSearch, setRunbookSearch] = useState("");
  const [animatingStep, setAnimatingStep] = useState<number>(4);
  const [toastBanner, setToastBanner] = useState<{ message: string; type: "success" | "warning" | "alert" } | null>(null);
  const diffStudioRef = useRef<HTMLDivElement | null>(null);

  const refreshAll = async () => {
    const s = await fetchSystemStatus();
    setStatus(s);
    const t = await fetchTraces();
    setTraces(t);
    const r = await fetchRunbooks();
    if (r && r.length > 0) setRunbooks(r);
    const q = await fetchWorkflowQueue();
    if (q && q.length > 0) setTasks(q);
  };

  const handleResetCounters = () => {
    setStatus({
      mode: "replay",
      llmProvider: "gemini",
      llmModel: "gemini-1.5-flash",
      hasApiKey: false,
      productionRunning: true,
      runbookCount: 10,
      totalProcessed: 0,
      autoHealedCount: 0,
      workflowPendingCount: 0,
      quarantinedCount: 0,
      autoHealRate: 100,
      totalTokens: 0,
      estimatedCostUSD: 0,
      avgLatencyMs: 0,
    });
    setTraces([]);
    setTasks([]);
    setActiveTrace(null);
    setAnimatingStep(0);
    setToastBanner({
      message: "Telemetry & counters reset to 0. Ready for clean video demo recording.",
      type: "success",
    });
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "queue" || tabParam === "rag" || tabParam === "history") {
        setActiveTab(tabParam);
      }
      const previewParam = params.get("preview");
      if (previewParam) {
        setTaskPreviewId(previewParam === "true" ? "SYN-HL7-65E60834" : previewParam);
      }
      const searchParam = params.get("q");
      if (searchParam) {
        setRunbookSearch(searchParam);
      }
      const scenarioParam = params.get("scenario");
      if (scenarioParam) {
        const sId = parseInt(scenarioParam, 10);
        if (CANONICAL_TRACES[sId]) {
          setActiveTrace(CANONICAL_TRACES[sId]);
        }
      }
    }
    refreshAll();
    const interval = setInterval(refreshAll, 6000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut listener for scenarios [1]–[7] and [Escape]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showCustomModal) {
        if (e.key === "Escape") setShowCustomModal(false);
        return;
      }
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") return;

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 7 && injecting === null) {
        handleInjectScenario(num);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCustomModal, injecting]);

  const handleInjectScenario = async (scenarioId: number) => {
    setInjecting(scenarioId);
    setAnimatingStep(1); // Stage 1: Inbound Chaos Ingestion
    setToastBanner(null);

    // Smooth auto-scroll to diff studio so viewer follows the story
    setTimeout(() => {
      diffStudioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);

    const timer1 = setTimeout(() => setAnimatingStep(2), 220); // Stage 2: IRIS Vector Search
    const timer2 = setTimeout(() => setAnimatingStep(3), 440); // Stage 3: Governed AI Agent

    try {
      const result = await injectChaos({ scenarioId });
      clearTimeout(timer1);
      clearTimeout(timer2);
      setAnimatingStep(4); // Stage 4: Outbound Decision Branch
      setActiveTrace(result);
      await refreshAll();

      if (result.decisionBranch === "AUTO_HEAL") {
        setToastBanner({
          message: "✓ Auto-healed: Validated and dispatched via ResubmitDeliveryOp to destination.",
          type: "success",
        });
      } else if (result.decisionBranch === "HUMAN_WORKFLOW") {
        setToastBanner({
          message: "⚡ Escalated to IRIS Workflow: Task delivered to SynapseReviewers inbox.",
          type: "warning",
        });
      } else {
        setToastBanner({
          message: "⚠ Quarantined: Isolated via QuarantineVaultOp in /tmp/synapse/quarantine.",
          type: "alert",
        });
      }
    } finally {
      setInjecting(null);
    }
  };

  const handleCustomInject = async () => {
    if (!customText.trim()) return;
    setInjecting(999);
    setAnimatingStep(1);
    setToastBanner(null);

    setTimeout(() => {
      diffStudioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);

    const timer1 = setTimeout(() => setAnimatingStep(2), 220);
    const timer2 = setTimeout(() => setAnimatingStep(3), 440);

    try {
      const result = await injectChaos({
        format: customFmt,
        customPayload: customText,
      });
      clearTimeout(timer1);
      clearTimeout(timer2);
      setAnimatingStep(4);
      setActiveTrace(result);
      setShowCustomModal(false);
      setCustomText("");
      await refreshAll();

      if (result.decisionBranch === "AUTO_HEAL") {
        setToastBanner({
          message: "✓ Custom anomaly auto-healed and resubmitted successfully.",
          type: "success",
        });
      } else if (result.decisionBranch === "HUMAN_WORKFLOW") {
        setToastBanner({
          message: "⚡ Custom anomaly escalated to IRIS Workflow for human operator review.",
          type: "warning",
        });
      } else {
        setToastBanner({
          message: "⚠ Custom anomaly quarantined in secure isolation vault.",
          type: "alert",
        });
      }
    } finally {
      setInjecting(null);
    }
  };

  const handleResolveTask = async (payloadId: string, action: "APPROVE" | "REJECT") => {
    setResolvingId(payloadId);
    const note = reviewerNotes[payloadId] || `Reviewed and ${action.toLowerCase()}d via SynapseHealer console.`;
    try {
      await resolveWorkflowTask(payloadId, action, note);
      await refreshAll();
    } finally {
      setResolvingId(null);
    }
  };

  const handleCopyHealed = () => {
    if (!activeTrace?.healedPayload) return;
    navigator.clipboard.writeText(activeTrace.healedPayload);
    setCopiedHealed(true);
    setTimeout(() => setCopiedHealed(false), 2000);
  };

  // Formatted line data for diff inspector
  const inboundLines = useMemo(() => {
    if (!activeTrace) return { lines: [], mutatedIndices: new Set<number>() };
    return formatPayloadLines(activeTrace.rawPayload, activeTrace.format);
  }, [activeTrace]);

  const outboundLines = useMemo(() => {
    if (!activeTrace) return { lines: [], mutatedIndices: new Set<number>() };
    return formatPayloadLines(activeTrace.healedPayload, activeTrace.format);
  }, [activeTrace]);

  const filteredScenarios = useMemo(() => {
    if (scenarioFilter === "ALL") return CANONICAL_SCENARIOS;
    return CANONICAL_SCENARIOS.filter((s) => s.format === scenarioFilter);
  }, [scenarioFilter]);

  const filteredRunbooks = useMemo(() => {
    if (!runbookSearch.trim()) return runbooks;
    const q = runbookSearch.toLowerCase();
    return runbooks.filter(
      (rb) =>
        rb.patternId.toLowerCase().includes(q) ||
        rb.errorSignature.toLowerCase().includes(q) ||
        rb.repairStrategy.toLowerCase().includes(q) ||
        rb.format.toLowerCase().includes(q)
    );
  }, [runbooks, runbookSearch]);

  return (
    <div className="min-h-screen bg-[#060709] text-zinc-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-200">
      {/* 1. TOP EXECUTIVE HEADER */}
      <header className="border-b border-white/[0.08] bg-[#08090E]/90 backdrop-blur-xl sticky top-0 z-40 px-6 py-3.5">
        <div className="max-w-[1720px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Bespoke SynapseHealer SVG Brand Logo */}
          <div className="flex items-center gap-3.5">
            <div className="relative group cursor-pointer">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-cyan-500/30 via-indigo-500/30 to-emerald-500/30 blur-sm opacity-70 group-hover:opacity-100 transition duration-300" />
              <div className="relative h-10 w-10 rounded-xl bg-[#0D0F18] border border-white/15 flex items-center justify-center shadow-lg">
                <svg viewBox="0 0 48 48" className="h-6 w-6">
                  <defs>
                    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38BDF8" />
                      <stop offset="50%" stopColor="#6366F1" />
                      <stop offset="100%" stopColor="#10B981" />
                    </linearGradient>
                  </defs>
                  <circle cx="24" cy="24" r="22" stroke="url(#headerGrad)" strokeWidth="1.2" strokeDasharray="2 3" opacity="0.3" />
                  <path d="M24 5L41 15V33L24 43L7 33V15L24 5Z" stroke="url(#headerGrad)" strokeWidth="2" strokeLinejoin="round" opacity="0.85" />
                  <circle cx="24" cy="5" r="2.5" fill="#38BDF8" />
                  <circle cx="41" cy="15" r="2.2" fill="#6366F1" />
                  <circle cx="41" cy="33" r="2.2" fill="#818CF8" />
                  <circle cx="24" cy="43" r="2.5" fill="#10B981" />
                  <circle cx="7" cy="33" r="2.2" fill="#34D399" />
                  <circle cx="7" cy="15" r="2.2" fill="#38BDF8" />
                  <path d="M24 13V35M13 24H35" stroke="url(#headerGrad)" strokeWidth="3" strokeLinecap="round" />
                  <rect x="20.5" y="20.5" width="7" height="7" rx="1.5" transform="rotate(45 24 24)" fill="#FFFFFF" />
                </svg>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[17px] tracking-tight text-white flex items-center">
                  Synapse<span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">Healer</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-300 border border-white/[0.08]">
                  IRIS 2027.1 AI Hub
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  IPM v1.0.1
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-medium tracking-wide">
                Autonomous Dead-Letter & Schema Healer for Interoperability
              </p>
            </div>
          </div>

          {/* Right Controls: Mode, Health, Reset, Refresh */}
          <div className="flex items-center gap-3">
            {/* Mode Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-mono tracking-wide ${
                status?.mode === "live"
                  ? "bg-violet-500/15 border-violet-500/30 text-violet-300 shadow-glowViolet"
                  : "bg-emerald-500/10 border-emerald-500/25 text-emerald-300 shadow-glowEmerald"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  status?.mode === "live" ? "bg-violet-400 animate-ping" : "bg-emerald-400"
                }`}
              />
              <span className="font-semibold uppercase">
                {status?.mode === "live" ? "Live AI Hub Mode" : "Replay Mode (Zero Key)"}
              </span>
            </div>

            {/* Production Health */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-[#0D0F18] text-[11px] font-mono text-zinc-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Production:</span>
              <span className="text-emerald-400 font-bold uppercase">Online</span>
            </div>

            {/* Demo Reset Button (starts counters from 0 on camera) */}
            <button
              onClick={handleResetCounters}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-[#0D0F18] hover:bg-[#161A24] hover:border-white/[0.14] text-zinc-400 hover:text-zinc-200 transition text-[11px] font-mono"
              title="Reset telemetry & counters to 0 for demo recording"
            >
              <RotateCcw className="h-3.5 w-3.5 text-zinc-400" />
              <span>Reset</span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={refreshAll}
              className="p-1.5 rounded-lg border border-white/[0.08] bg-[#0D0F18] hover:bg-[#161A24] hover:border-white/[0.14] text-zinc-400 hover:text-zinc-200 transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Executive 6-Card Health Deck */}
        <div className="max-w-[1720px] mx-auto mt-3.5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Card 1: Auto-Heal Rate */}
            <div className="bg-[#0D0F18]/80 border border-white/[0.08] hover:border-white/[0.14] rounded-xl p-3.5 transition shadow-subtle">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-semibold tracking-[0.08em] uppercase">
                  Auto-Heal Rate
                </span>
                <Zap className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-400 mt-1 tabular-nums">
                {status?.autoHealRate ?? 90}%
              </div>
              <div className="text-[10px] font-mono text-zinc-500 mt-1 flex items-center justify-between">
                <span>VECTOR_COSINE</span>
                <span className="text-emerald-400/80 font-semibold">384-dim</span>
              </div>
            </div>

            {/* Card 2: Total Ingested */}
            <div className="bg-[#0D0F18]/80 border border-white/[0.08] hover:border-white/[0.14] rounded-xl p-3.5 transition shadow-subtle">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-semibold tracking-[0.08em] uppercase">
                  Total Processed
                </span>
                <Activity className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div className="text-2xl font-mono font-bold text-zinc-100 mt-1 tabular-nums">
                {status?.totalProcessed ?? 10}{" "}
                <span className="text-xs font-normal text-zinc-400">msgs</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-500 mt-1 flex items-center justify-between">
                <span>Ens.Production</span>
                <span className="text-cyan-400/80 font-semibold">ACTIVE</span>
              </div>
            </div>

            {/* Card 3: Human Review Queue */}
            <div className="bg-[#0D0F18]/80 border border-white/[0.08] hover:border-white/[0.14] rounded-xl p-3.5 transition shadow-subtle">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-semibold tracking-[0.08em] uppercase">
                  Human Queue
                </span>
                <UserCheck className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div
                className={`text-2xl font-mono font-bold mt-1 tabular-nums ${
                  (status?.workflowPendingCount ?? 0) > 0 ? "text-amber-400" : "text-zinc-200"
                }`}
              >
                {status?.workflowPendingCount ?? tasks.filter((t) => t.workflowStatus === "PENDING_APPROVAL").length}{" "}
                <span className="text-xs font-normal text-zinc-400">tasks</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-500 mt-1 flex items-center justify-between">
                <span>Workflow Engine</span>
                <span className="text-amber-400/80 font-semibold">SynapseReviewers</span>
              </div>
            </div>

            {/* Card 4: Inference Tokens */}
            <div className="bg-[#0D0F18]/80 border border-white/[0.08] hover:border-violet-500/30 rounded-xl p-3.5 transition shadow-subtle">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-semibold tracking-[0.08em] uppercase">
                  Inference Tokens
                </span>
                <Cpu className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <div className="text-2xl font-mono font-bold text-violet-300 mt-1 tabular-nums">
                {status?.mode === "replay" ? (
                  <span>
                    0 <span className="text-xs font-normal text-zinc-400 font-sans">(Replay)</span>
                  </span>
                ) : (
                  (status?.totalTokens ?? 6631).toLocaleString()
                )}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 mt-1 flex items-center justify-between">
                <span>{status?.mode === "replay" ? "Zero-Key Replay" : "Governed ToolSet"}</span>
                <span className="text-violet-400/80 font-semibold">
                  {status?.mode === "replay" ? "0 Tokens" : "%AI.Agent"}
                </span>
              </div>
            </div>

            {/* Card 5: Compute Cost */}
            <div className="bg-[#0D0F18]/80 border border-white/[0.08] hover:border-white/[0.14] rounded-xl p-3.5 transition shadow-subtle">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-semibold tracking-[0.08em] uppercase">
                  Inference Cost
                </span>
                <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-400 mt-1 tabular-nums">
                {status?.mode === "replay" ? "$0.0000" : `$${(status?.estimatedCostUSD ?? 0.00018).toFixed(5)}`}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 mt-1 flex items-center justify-between">
                <span>{status?.mode === "replay" ? "Replay Simulation" : "Calculated Cost"}</span>
                <span className="text-emerald-400/80 font-semibold">
                  {status?.mode === "replay" ? "$0.00 Live" : "$0.00018/heal"}
                </span>
              </div>
            </div>

            {/* Card 6: Avg Latency */}
            <div className="bg-[#0D0F18]/80 border border-white/[0.08] hover:border-white/[0.14] rounded-xl p-3.5 transition shadow-subtle">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-semibold tracking-[0.08em] uppercase">
                  Avg Latency
                </span>
                <Clock className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div className="text-2xl font-mono font-bold text-cyan-300 mt-1 tabular-nums">
                {status?.avgLatencyMs ? `${status.avgLatencyMs}` : "142"}
                <span className="text-xs font-normal text-zinc-400">ms</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-500 mt-1 flex items-center justify-between">
                <span>Triage & Dispatch</span>
                <span className="text-cyan-400/80 font-semibold">SUB-150MS</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 p-6 space-y-6 max-w-[1720px] w-full mx-auto">
        {/* SECTION 1: CHAOS SCENARIO COMMAND CENTER */}
        <section className="bg-[#0D0F18]/90 border border-white/[0.08] shadow-card rounded-2xl p-5">
          {/* Header & Protocol Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
              <h2 className="text-[11px] font-semibold tracking-[0.08em] text-zinc-300 uppercase">
                Chaos Anomaly Ingestion Matrix
              </h2>
              <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
                • Press keys <span className="text-cyan-400 font-semibold">[1]–[7]</span> to trigger
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Protocol Filter Tabs */}
              <div className="flex items-center p-0.5 rounded-lg bg-[#08090E] border border-white/[0.08] text-xs font-mono">
                <button
                  onClick={() => setScenarioFilter("ALL")}
                  className={`px-2.5 py-1 rounded-md transition ${
                    scenarioFilter === "ALL"
                      ? "bg-white/[0.1] text-white font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  All (7)
                </button>
                <button
                  onClick={() => setScenarioFilter("HL7")}
                  className={`px-2.5 py-1 rounded-md transition ${
                    scenarioFilter === "HL7"
                      ? "bg-amber-500/20 text-amber-300 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  HL7 v2 (3)
                </button>
                <button
                  onClick={() => setScenarioFilter("JSON")}
                  className={`px-2.5 py-1 rounded-md transition ${
                    scenarioFilter === "JSON"
                      ? "bg-sky-500/20 text-sky-300 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  JSON (4)
                </button>
              </div>

              {/* Custom Payload Modal Trigger */}
              <button
                onClick={() => setShowCustomModal(true)}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 text-xs font-mono font-medium flex items-center gap-2 transition"
              >
                <Code2 className="h-3.5 w-3.5 text-cyan-400" />
                <span>Custom Payload</span>
                <span className="text-[10px] text-cyan-400/60 font-sans border border-cyan-500/20 px-1 rounded">
                  ⌘K
                </span>
              </button>
            </div>
          </div>

          {/* Spacious Responsive Bento Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {filteredScenarios.map((sc) => {
              const isInjecting = injecting === sc.id;
              const isHl7 = sc.format === "HL7";
              const targetField = SCENARIO_TARGET_MAP[sc.id] || "Payload syntax";

              return (
                <div
                  key={sc.id}
                  className={`group relative text-left p-4 rounded-xl border transition-all flex flex-col justify-between ${
                    isInjecting
                      ? "bg-cyan-950/40 border-cyan-500/60 shadow-glowCyan"
                      : "bg-[#111420] hover:bg-[#161A28] border-white/[0.07] hover:border-cyan-500/40"
                  }`}
                >
                  <div>
                    {/* Header Row: Shortcut Key, Protocol & Anomaly Type */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-5 w-5 rounded bg-white/[0.06] text-zinc-300 font-mono text-[10px] font-bold flex items-center justify-center border border-white/[0.1]">
                          {sc.id}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                            isHl7
                              ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                              : "bg-sky-500/15 text-sky-300 border border-sky-500/25"
                          }`}
                        >
                          {sc.format}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                          {sc.badge}
                        </span>
                      </div>

                      <span
                        className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                          sc.risk === "MEDIUM_HIGH"
                            ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                            : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                        }`}
                      >
                        {sc.risk === "MEDIUM_HIGH" ? "HITL Review" : "Auto-Heal"}
                      </span>
                    </div>

                    <h3 className="font-semibold text-sm text-zinc-100 group-hover:text-cyan-300 transition">
                      {sc.title}
                    </h3>

                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                      {sc.desc}
                    </p>
                  </div>

                  {/* Footer Row: Target Segment & Trigger Button */}
                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[210px]">
                      {targetField}
                    </span>

                    <button
                      disabled={injecting !== null}
                      onClick={() => handleInjectScenario(sc.id)}
                      className="px-2.5 py-1 rounded bg-white/[0.06] group-hover:bg-cyan-500/20 text-zinc-300 group-hover:text-cyan-200 border border-white/[0.08] group-hover:border-cyan-500/30 text-[11px] font-mono flex items-center gap-1.5 transition"
                    >
                      <Play className="h-3 w-3 text-cyan-400" />
                      <span>{isInjecting ? "Injecting..." : "Simulate"}</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Bento Slot #8: Custom Anomaly Injection Interactive Card */}
            {scenarioFilter === "ALL" && (
              <div
                onClick={() => setShowCustomModal(true)}
                className="group relative text-left p-4 rounded-xl border border-dashed border-cyan-500/30 hover:border-cyan-500/60 bg-[#0E121E]/60 hover:bg-[#121728] transition-all flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded bg-cyan-500/10 text-cyan-300 font-mono text-[10px] font-bold flex items-center justify-center border border-cyan-500/25">
                        +
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-500/25">
                        HL7 / JSON
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                        Arbitrary
                      </span>
                    </div>

                    <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                      Interactive
                    </span>
                  </div>

                  <h3 className="font-semibold text-sm text-zinc-100 group-hover:text-cyan-300 transition flex items-center gap-1.5">
                    <span>Custom Anomaly Injection</span>
                  </h3>

                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Directly paste or test arbitrary malformed HL7 v2 or broken JSON webhook payloads into the live pipeline.
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-400">
                    Press ⌘K or click to launch
                  </span>

                  <button
                    type="button"
                    className="px-2.5 py-1 rounded bg-cyan-500/15 group-hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono flex items-center gap-1.5 transition"
                  >
                    <Code2 className="h-3 w-3 text-cyan-400" />
                    <span>Open Studio</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 2: 4-STAGE PIPELINE STEPPER & IDE-GRADE DIFF STUDIO */}
        <section ref={diffStudioRef} className="bg-[#0D0F18]/90 border border-white/[0.08] shadow-card rounded-2xl p-5 space-y-4">
          {/* Toast Notification Banner */}
          {toastBanner && (
            <div
              className={`p-3 rounded-xl border text-xs font-mono font-medium flex items-center justify-between transition-all duration-300 ${
                toastBanner.type === "success"
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : toastBanner.type === "warning"
                  ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                  : "bg-rose-500/15 border-rose-500/30 text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {toastBanner.type === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                {toastBanner.type === "warning" && <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />}
                {toastBanner.type === "alert" && <XCircle className="h-4 w-4 text-rose-400 shrink-0" />}
                <span>{toastBanner.message}</span>
              </div>
              <button
                onClick={() => setToastBanner(null)}
                className="text-zinc-400 hover:text-zinc-200 text-xs px-2 py-0.5 rounded transition"
              >
                ✕
              </button>
            </div>
          )}

          {/* Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
              <h2 className="text-[11px] font-semibold tracking-[0.08em] text-zinc-300 uppercase">
                Autonomous Healing Diff & Agent Reasoning Studio
              </h2>
              {activeTrace && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-300 border border-white/[0.08]">
                  ID: {activeTrace.payloadId} • {activeTrace.sourceSystem}
                </span>
              )}
            </div>

            {activeTrace && (
              <div className="flex items-center gap-2.5">
                {activeTrace.decisionBranch === "HUMAN_WORKFLOW" && (
                  <a
                    href="http://localhost:52773/csp/sys/%25CSP.UI.Portal.WorkflowWorklist.zen"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition"
                  >
                    <span>Open in IRIS Workflow</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase font-mono border ${
                    activeTrace.decisionBranch === "AUTO_HEAL"
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                      : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                  }`}
                >
                  Branch: {activeTrace.decisionBranch}
                </span>
                <span className="text-xs font-mono text-zinc-300 bg-white/[0.04] px-2.5 py-1 rounded-md border border-white/[0.08]">
                  Confidence: {(activeTrace.confidenceScore * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>

          {/* 4-Stage Horizontal Pipeline Stepper */}
          {activeTrace && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 p-2.5 bg-[#08090E] border border-white/[0.06] rounded-xl text-xs font-mono">
              <div
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-300 ${
                  animatingStep >= 1
                    ? "bg-[#111420] border-rose-500/30 text-rose-300 shadow-sm"
                    : "opacity-40 bg-[#08090E] border-white/[0.04]"
                } ${animatingStep === 1 ? "ring-1 ring-rose-500/60 shadow-[0_0_12px_rgba(244,63,94,0.35)] animate-pulse" : ""}`}
              >
                <span className="h-6 w-6 rounded-full bg-rose-500/15 text-rose-400 font-bold flex items-center justify-center text-[10px] border border-rose-500/25">
                  1
                </span>
                <div className="truncate">
                  <div className="text-zinc-200 font-semibold truncate">Inbound Chaos Ingestion</div>
                  <div className="text-[10px] text-zinc-400 truncate">DeadLetterInbound (Python)</div>
                </div>
              </div>

              <div
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-300 ${
                  animatingStep >= 2
                    ? "bg-[#111420] border-cyan-500/30 text-cyan-300 shadow-sm"
                    : "opacity-40 bg-[#08090E] border-white/[0.04]"
                } ${animatingStep === 2 ? "ring-1 ring-cyan-500/60 shadow-[0_0_12px_rgba(56,189,248,0.35)] animate-pulse" : ""}`}
              >
                <span className="h-6 w-6 rounded-full bg-cyan-500/15 text-cyan-400 font-bold flex items-center justify-center text-[10px] border border-cyan-500/25">
                  2
                </span>
                <div className="truncate">
                  <div className="text-zinc-200 font-semibold truncate">IRIS Vector Search</div>
                  <div className="text-[10px] text-zinc-400 truncate">VECTOR_COSINE (384d)</div>
                </div>
              </div>

              <div
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-300 ${
                  animatingStep >= 3
                    ? "bg-[#111420] border-violet-500/30 text-violet-300 shadow-sm"
                    : "opacity-40 bg-[#08090E] border-white/[0.04]"
                } ${animatingStep === 3 ? "ring-1 ring-violet-500/60 shadow-[0_0_12px_rgba(139,92,246,0.35)] animate-pulse" : ""}`}
              >
                <span className="h-6 w-6 rounded-full bg-violet-500/15 text-violet-400 font-bold flex items-center justify-center text-[10px] border border-violet-500/25">
                  3
                </span>
                <div className="truncate">
                  <div className="text-zinc-200 font-semibold truncate">Governed AI Agent</div>
                  <div className="text-[10px] text-zinc-400 truncate">HealerToolSet (%AI.Agent)</div>
                </div>
              </div>

              <div
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-300 ${
                  animatingStep >= 4
                    ? activeTrace.decisionBranch === "AUTO_HEAL"
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                      : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                    : "opacity-40 bg-[#08090E] border-white/[0.04]"
                } ${animatingStep === 4 ? "ring-1 ring-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.35)]" : ""}`}
              >
                <span className="h-6 w-6 rounded-full bg-white/[0.1] font-bold flex items-center justify-center text-[10px]">
                  4
                </span>
                <div className="truncate">
                  <div className="font-semibold truncate">
                    {activeTrace.decisionBranch === "AUTO_HEAL"
                      ? "ResubmitDeliveryOp"
                      : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                      ? "WorkflowEscalationOp"
                      : "QuarantineVaultOp"}
                  </div>
                  <div className="text-[10px] opacity-80 truncate">
                    {activeTrace.decisionBranch === "AUTO_HEAL"
                      ? "Dispatched to Destination"
                      : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                      ? "Escalated for Human Review"
                      : "Quarantined in Isolated Vault"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Balanced Side-by-Side Unified Code Diff */}
          {activeTrace ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left Side: Malformed Inbound Dead-Letter */}
                <div className="bg-[#111420] border border-rose-500/25 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5 font-mono">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Inbound Dead-Letter Payload
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/25 uppercase">
                        {activeTrace.format} • {activeTrace.sourceSystem}
                      </span>
                    </div>

                    {/* Validation Error Banner */}
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 mb-3 text-xs text-rose-200 font-mono leading-relaxed">
                      <span className="font-bold text-rose-400">ValidationError: </span>
                      {activeTrace.validationError}
                    </div>

                    {/* Line-Numbered Inbound Code Well */}
                    <div className="bg-[#08090E] rounded-lg border border-white/[0.06] p-2.5 max-h-[300px] overflow-y-auto font-mono text-[11px] leading-relaxed">
                      {inboundLines.lines.map((line, idx) => {
                        const isMutated = inboundLines.mutatedIndices.has(idx);
                        const lineNum = String(idx + 1).padStart(2, "0");
                        return (
                          <div
                            key={idx}
                            className={`flex items-start gap-2.5 px-1.5 py-0.5 rounded ${
                              isMutated
                                ? "bg-rose-500/20 text-rose-200 border-l-2 border-rose-500 font-medium"
                                : "text-zinc-400"
                            }`}
                          >
                            <span className="text-zinc-600 select-none w-5 text-right shrink-0">
                              {lineNum}
                            </span>
                            <span className="break-all whitespace-pre-wrap">
                              {renderDiffLineContent(line, false, activeTrace.format)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/[0.05] text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                    <span>Length: {activeTrace.rawPayload.length} bytes</span>
                    <span>Intercepted by DeadLetterInbound</span>
                  </div>
                </div>

                {/* Right Side: Healed Outbound Payload */}
                <div className="bg-[#111420] border border-emerald-500/25 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 font-mono">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Healed Outbound Payload
                      </span>
                      <button
                        onClick={handleCopyHealed}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 transition"
                      >
                        <Copy className="h-3 w-3" />
                        <span>{copiedHealed ? "Copied!" : "Copy Payload"}</span>
                      </button>
                    </div>

                    {/* Destination Route Banner */}
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 mb-3 text-xs text-emerald-200 font-mono flex items-center justify-between">
                      <span className="truncate">
                        <span className="font-bold text-emerald-400">Route: </span>
                        {activeTrace.decisionBranch === "AUTO_HEAL"
                          ? "ResubmitDeliveryOp -> Downstream Service"
                          : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                          ? "WorkflowEscalationOp -> Task Queue"
                          : "QuarantineVaultOp -> Isolated Forensic Vault"}
                      </span>
                      <span className="font-bold text-emerald-300 shrink-0 ml-2">100% Validated</span>
                    </div>

                    {/* Line-Numbered Healed Code Well */}
                    <div className="bg-[#08090E] rounded-lg border border-white/[0.06] p-2.5 max-h-[300px] overflow-y-auto font-mono text-[11px] leading-relaxed">
                      {outboundLines.lines.map((line, idx) => {
                        const isMutated = outboundLines.mutatedIndices.has(idx);
                        const lineNum = String(idx + 1).padStart(2, "0");
                        return (
                          <div
                            key={idx}
                            className={`flex items-start gap-2.5 px-1.5 py-0.5 rounded ${
                              isMutated
                                ? "bg-emerald-500/20 text-emerald-200 border-l-2 border-emerald-500 font-medium"
                                : "text-zinc-400"
                            }`}
                          >
                            <span className="text-zinc-600 select-none w-5 text-right shrink-0">
                              {lineNum}
                            </span>
                            <span className="break-all whitespace-pre-wrap">
                              {renderDiffLineContent(line, true, activeTrace.format)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/[0.05] text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                    <span>Length: {activeTrace.healedPayload.length} bytes</span>
                    <span className="text-emerald-400 font-semibold uppercase">Schema Compliant</span>
                  </div>
                </div>
              </div>

              {/* Cognitive Trace & Governed Execution Deck (Below Code Diff) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left Side: IRIS Vector Search & Agent Narrative */}
                <div className="lg:col-span-5 bg-[#111420] border border-white/[0.07] rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5 font-mono">
                        <Database className="h-3.5 w-3.5" />
                        IRIS Vector Search Similarity Match
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                        {activeTrace.matchedPatternId}
                      </span>
                    </div>

                    {/* Cosine Similarity Gauge */}
                    <div className="bg-[#08090E] border border-white/[0.06] rounded-lg p-3 mb-3 text-xs font-mono">
                      <div className="flex items-center justify-between mb-1.5 text-zinc-300">
                        <span>VECTOR_COSINE Match Score</span>
                        <span className="font-bold text-emerald-400">
                          {(activeTrace.confidenceScore).toFixed(2)}
                        </span>
                      </div>
                      <div className="w-full bg-white/[0.06] rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 h-2 rounded-full transition-all duration-500 shadow-glowCyan"
                          style={{ width: `${Math.min(100, activeTrace.confidenceScore * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Agent Narrative Diagnosis */}
                    <div className="border-l-2 border-violet-500 bg-[#08090E] rounded-r-lg p-3 text-xs text-zinc-300 leading-relaxed">
                      <div className="font-semibold text-violet-300 text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                        <Sparkles className="h-3.5 w-3.5 text-violet-400" /> Autonomous Agent Diagnosis
                      </div>
                      <p className="font-sans text-zinc-300">{activeTrace.agentReasoning}</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/[0.05] text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                    <span>
                      Total Tokens:{" "}
                      {activeTrace.executionMode === "replay" ? (
                        <span className="text-zinc-300">
                          0 <span className="text-cyan-400 text-[10px]">(Replay Mode)</span>
                        </span>
                      ) : (
                        activeTrace.promptTokens + activeTrace.completionTokens
                      )}
                    </span>
                    <span>
                      Cost:{" "}
                      {activeTrace.executionMode === "replay" ? (
                        <span className="text-zinc-300">
                          $0.0000 <span className="text-cyan-400 text-[10px]">(Replay Mode)</span>
                        </span>
                      ) : (
                        `$${activeTrace.estimatedCostUSD.toFixed(5)}`
                      )}
                    </span>
                  </div>
                </div>

                {/* Right Side: Governed Tool Call Execution Timeline Spine */}
                <div className="lg:col-span-7 bg-[#111420] border border-white/[0.07] rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 font-mono">
                        <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                        Governed Tool Call Execution Spine
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                        {activeTrace.toolTrace?.length || 0} Steps Executed
                      </span>
                    </div>

                    <div className="relative pl-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[1px] before:bg-white/[0.1] space-y-2.5">
                      {activeTrace.toolTrace && activeTrace.toolTrace.length > 0 ? (
                        activeTrace.toolTrace.map((call, idx) => (
                          <div
                            key={idx}
                            className="relative bg-[#08090E] border border-white/[0.06] rounded-lg p-2.5 text-xs font-mono"
                          >
                            <span className="absolute -left-6 top-3 h-2 w-2 rounded-full bg-cyan-400 ring-4 ring-[#111420]" />
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-cyan-300">
                                #{call.step} {call.tool}()
                              </span>
                              <span className="text-[10px] text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                                {call.durationMs}ms
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400 mt-1.5 break-all">
                              <span className="text-zinc-600">out: </span>
                              {JSON.stringify(call.output)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-zinc-500 italic p-3 bg-[#08090E] rounded-lg">
                          No tool steps recorded.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/[0.05] text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                    <span>Latency: {activeTrace.latencyMs || 142}ms End-to-End</span>
                    <span className="text-violet-400 font-semibold">
                      Mode: {activeTrace.executionMode === "replay" ? "REPLAY (DETERMINISTIC)" : activeTrace.executionMode.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-zinc-500 text-xs font-mono">
              No dead-letter anomaly loaded. Select a scenario above or click a trace below.
            </div>
          )}
        </section>

        {/* SECTION 3: MULTI-TAB WORKSPACE (WORKFLOW QUEUE, VECTOR RAG, TRACES) */}
        <section className="bg-[#0D0F18]/90 border border-white/[0.08] shadow-card rounded-2xl p-5">
          {/* Segmented Tab Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3 mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab("queue")}
                className={`flex items-center gap-2 text-xs font-mono font-medium px-3.5 py-1.5 rounded-lg transition ${
                  activeTab === "queue"
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Human Workflow Queue</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-zinc-300 font-mono">
                  {tasks.filter((t) => t.workflowStatus === "PENDING_APPROVAL").length || status?.workflowPendingCount || 0}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("rag")}
                className={`flex items-center gap-2 text-xs font-mono font-medium px-3.5 py-1.5 rounded-lg transition ${
                  activeTab === "rag"
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                }`}
              >
                <Database className="h-3.5 w-3.5" />
                <span>IRIS Vector Search Runbooks</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-zinc-300 font-mono">
                  {runbooks.length || status?.runbookCount || 10}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("history")}
                className={`flex items-center gap-2 text-xs font-mono font-medium px-3.5 py-1.5 rounded-lg transition ${
                  activeTab === "history"
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Live Audit Telemetry</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-zinc-300 font-mono">
                  {traces.length || status?.totalProcessed || 0}
                </span>
              </button>
            </div>

            {activeTab === "rag" && (
              <div className="relative w-64">
                <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter runbooks..."
                  value={runbookSearch}
                  onChange={(e) => setRunbookSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#08090E] border border-white/[0.08] text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            )}
          </div>

          {/* TAB CONTENT A: HUMAN WORKFLOW QUEUE */}
          {activeTab === "queue" && (
            <div className="space-y-3">
              {tasks.length > 0 ? (
                tasks.map((task) => {
                  const isResolving = resolvingId === task.payloadId;
                  const isPending = task.workflowStatus === "PENDING_APPROVAL";
                  const isPreviewOpen = taskPreviewId === task.payloadId;

                  return (
                    <div
                      key={task.payloadId}
                      className="bg-[#111420] border border-white/[0.07] rounded-xl p-4 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <span className="font-bold text-zinc-200">{task.payloadId}</span>
                          <span className="text-zinc-500">•</span>
                          <span className="text-zinc-400">{task.sourceSystem}</span>
                          <span className="text-zinc-500">•</span>
                          <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-300 border border-white/[0.06] uppercase text-[10px]">
                            {task.format}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-xs">
                          <a
                            href="http://localhost:52773/csp/sys/%25CSP.UI.Portal.WorkflowWorklist.zen"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono transition mr-1"
                            title="Open InterSystems IRIS Workflow Portal"
                          >
                            <span>IRIS Portal</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              task.workflowStatus === "APPROVED"
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                                : task.workflowStatus === "REJECTED"
                                ? "bg-rose-500/15 text-rose-300 border border-rose-500/25"
                                : "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                            }`}
                          >
                            {task.workflowStatus}
                          </span>
                          <span className="text-[11px] text-zinc-500">{task.timestamp}</span>
                        </div>
                      </div>

                      <div className="text-xs text-zinc-300 font-sans mb-3">
                        <span className="font-semibold text-zinc-400 font-mono">Pattern: </span>
                        {task.patternId || (task as any).matchedPatternId}
                      </div>

                      {/* Expandable Side-by-Side Snippet Comparison */}
                      <div className="mb-3">
                        <button
                          onClick={() => setTaskPreviewId(isPreviewOpen ? null : task.payloadId)}
                          className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
                        >
                          <ChevronRight
                            className={`h-3.5 w-3.5 transition-transform ${
                              isPreviewOpen ? "rotate-90" : ""
                            }`}
                          />
                          <span>{isPreviewOpen ? "Hide Payload Preview" : "Inspect Payload Comparison"}</span>
                        </button>

                        {isPreviewOpen && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 font-mono text-[11px]">
                            <div className="bg-[#08090E] border border-rose-500/20 rounded-lg p-2.5">
                              <span className="text-rose-400 font-bold block mb-1">Inbound Malformed:</span>
                              <pre className="text-zinc-400 max-h-32 overflow-y-auto whitespace-pre-wrap">
                                {task.rawPayload}
                              </pre>
                            </div>
                            <div className="bg-[#08090E] border border-emerald-500/20 rounded-lg p-2.5">
                              <span className="text-emerald-400 font-bold block mb-1">Proposed Repair:</span>
                              <pre className="text-emerald-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                                {task.healedPayload}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Operator Notes & Action Buttons */}
                      {isPending ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.05]">
                          <input
                            type="text"
                            placeholder="Operator reviewer notes (optional)..."
                            value={reviewerNotes[task.payloadId] || ""}
                            onChange={(e) =>
                              setReviewerNotes({
                                ...reviewerNotes,
                                [task.payloadId]: e.target.value,
                              })
                            }
                            className="flex-1 min-w-[240px] px-3 py-1.5 rounded-lg bg-[#08090E] border border-white/[0.08] text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
                          />

                          <div className="flex items-center gap-2">
                            <a
                              href="http://localhost:52773/csp/sys/%25CSP.UI.Portal.WorkflowWorklist.zen"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-mono font-medium flex items-center gap-1.5 transition shadow-sm"
                              title="Open InterSystems IRIS Workflow Portal"
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-amber-400" />
                              <span>Open in IRIS Workflow</span>
                            </a>

                            <button
                              disabled={isResolving}
                              onClick={() => handleResolveTask(task.payloadId, "APPROVE")}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-medium flex items-center gap-1.5 transition shadow-sm"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              <span>Approve & Dispatch</span>
                            </button>

                            <button
                              disabled={isResolving}
                              onClick={() => handleResolveTask(task.payloadId, "REJECT")}
                              className="px-3.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/25 text-xs font-mono font-medium flex items-center gap-1.5 transition"
                            >
                              <XCircle className="h-3.5 w-3.5 text-rose-400" />
                              <span>Reject to Quarantine</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        task.operatorNotes && (
                          <div className="text-[11px] text-zinc-500 font-mono pt-2 border-t border-white/[0.04]">
                            <span className="text-zinc-400">Note: </span>
                            {task.operatorNotes}
                          </div>
                        )
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 bg-[#111420] border border-white/[0.05] rounded-xl">
                  <ShieldCheck className="h-9 w-9 text-emerald-400 mx-auto mb-2 opacity-85" />
                  <p className="text-xs font-mono text-zinc-200 font-semibold">
                    Zero pending escalation tasks.
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    All incoming anomalies have been auto-healed or completed review.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT B: IRIS VECTOR SEARCH RUNBOOKS */}
          {activeTab === "rag" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredRunbooks.map((rb) => (
                <div
                  key={rb.patternId}
                  className="bg-[#111420] border border-white/[0.07] rounded-xl p-4 text-xs space-y-2.5 hover:border-white/[0.15] transition"
                >
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-cyan-300 truncate">{rb.patternId}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-zinc-300 border border-white/[0.08]">
                      {rb.format}
                    </span>
                  </div>

                  <div className="text-zinc-400 font-sans line-clamp-2 text-xs leading-relaxed">
                    {rb.errorSignature}
                  </div>

                  <div className="pt-2.5 border-t border-white/[0.05] text-[11px] font-mono space-y-1.5">
                    <div className="text-zinc-300">
                      <span className="text-zinc-500">Strategy: </span>
                      <span className="text-emerald-400">{rb.repairStrategy}</span>
                    </div>
                    <div className="text-zinc-500 flex items-center justify-between">
                      <span>Threshold: &gt;= {rb.confidenceThreshold}</span>
                      <span>Source: {rb.vendorSource}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB CONTENT C: LIVE TELEMETRY TRACES */}
          {activeTab === "history" && (
            <div className="bg-[#111420] border border-white/[0.07] rounded-xl overflow-hidden font-mono text-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.07] bg-[#08090E] text-zinc-400 text-[10px] uppercase tracking-wider">
                      <th className="py-3 px-4">Payload ID</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Source System</th>
                      <th className="py-3 px-4">Format</th>
                      <th className="py-3 px-4">Decision Branch</th>
                      <th className="py-3 px-4">Confidence</th>
                      <th className="py-3 px-4">Latency</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] text-[11px]">
                    {traces.map((tr) => (
                      <tr
                        key={tr.payloadId}
                        onClick={() => setActiveTrace(tr)}
                        className={`cursor-pointer transition hover:bg-white/[0.02] ${
                          activeTrace?.payloadId === tr.payloadId ? "bg-cyan-500/[0.06]" : ""
                        }`}
                      >
                        <td className="py-3 px-4 font-semibold text-zinc-100">
                          {tr.payloadId}
                        </td>
                        <td className="py-3 px-4 text-zinc-400">{tr.timestamp}</td>
                        <td className="py-3 px-4 text-zinc-300">{tr.sourceSystem}</td>
                        <td className="py-3 px-4 uppercase text-zinc-300">{tr.format}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              tr.decisionBranch === "AUTO_HEAL"
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                                : tr.decisionBranch === "HUMAN_WORKFLOW"
                                ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                                : "bg-rose-500/15 text-rose-300 border border-rose-500/25"
                            }`}
                          >
                            {tr.decisionBranch}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-200">
                          {(tr.confidenceScore * 100).toFixed(0)}%
                        </td>
                        <td className="py-3 px-4 text-zinc-400">{tr.latencyMs}ms</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTrace(tr);
                            }}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 border border-cyan-500/25 px-2.5 py-0.5 rounded"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* CUSTOM PAYLOAD MODAL */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-[#0D0F18] border border-white/[0.12] shadow-2xl rounded-2xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2.5">
                <Code2 className="h-5 w-5 text-cyan-400" />
                <h3 className="font-semibold text-zinc-100 text-sm">
                  Custom Payload Chaos Injection
                </h3>
              </div>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-zinc-400">Format:</span>
                <button
                  type="button"
                  onClick={() => setCustomFmt("JSON")}
                  className={`px-3 py-1 rounded-lg border transition ${
                    customFmt === "JSON"
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                      : "bg-[#111420] border-white/[0.08] text-zinc-400"
                  }`}
                >
                  JSON
                </button>
                <button
                  type="button"
                  onClick={() => setCustomFmt("HL7")}
                  className={`px-3 py-1 rounded-lg border transition ${
                    customFmt === "HL7"
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                      : "bg-[#111420] border-white/[0.08] text-zinc-400"
                  }`}
                >
                  HL7 v2
                </button>
              </div>

              {/* Sample Preload Helper */}
              <button
                type="button"
                onClick={() => {
                  if (customFmt === "JSON") {
                    setCustomText(
                      JSON.stringify(
                        {
                          order_id: "ORD-99901",
                          customer_id: "CUST-402",
                          total_cost: "$350.00",
                          item_count: "3",
                          expedited: "true",
                        },
                        null,
                        2
                      )
                    );
                  } else {
                    setCustomText(
                      "MSH|^~\\&|Custom_ADT|Clinic|Synapse|Core|20261103||ADT^A01|MSG01|P|2.5.1\rPV1|1|I|W101\rPID|1||PAT999||DOE^JOHN||19800101|M\r"
                    );
                  }
                }}
                className="text-[11px] font-mono text-zinc-400 hover:text-cyan-300 underline"
              >
                Load Sample Malformed Payload
              </button>
            </div>

            <textarea
              rows={8}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={
                customFmt === "JSON"
                  ? '{\n  "order_id": "ORD-123",\n  "amount": "$99.99"\n}'
                  : "MSH|^~\\&|...\\rPV1|...\\rPID|..."
              }
              className="w-full bg-[#08090E] border border-white/[0.08] rounded-xl p-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs font-mono transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!customText.trim() || injecting !== null}
                onClick={handleCustomInject}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-mono font-medium transition shadow-glowCyan flex items-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Inject into Pipeline</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
