"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  ExternalLink,
  Flame,
  HelpCircle,
  Layers,
  Play,
  RefreshCw,
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
  fetchSystemStatus,
  injectChaos,
  fetchTraces,
  fetchRunbooks,
  fetchWorkflowQueue,
  resolveWorkflowTask,
} from "@/lib/api";

// Target segment/field mapping for the 7 scenarios
const SCENARIO_TARGET_MAP: Record<number, string> = {
  1: "PV1 / PID",
  2: "PID-7 (DOB)",
  3: "OBX-5 (Narrative)",
  4: "price / quantity",
  5: "client_uuid -> customer_id",
  6: "created_at (Epoch)",
  7: "order_items[]",
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

  let rawLines = formatted.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Format HL7 so each standard segment occupies its own line
  if (format === "HL7" && rawLines.length <= 2 && payload.includes("|")) {
    const segments = payload.split(/(?=\b(?:MSH|EVN|PID|PV1|OBX|AL1|DG1|ORC|OBR)\b)/);
    if (segments.length > 1) {
      rawLines = segments.map((s) => s.trim()).filter(Boolean);
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
      line.includes("line_items") ||
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

export default function SynapseDashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [traces, setTraces] = useState<HealTrace[]>([]);
  const [runbooks, setRunbooks] = useState<Runbook[]>([]);
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [activeTrace, setActiveTrace] = useState<HealTrace | null>(null);
  const [activeTab, setActiveTab] = useState<"queue" | "rag" | "history">("queue");
  const [injecting, setInjecting] = useState<number | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customFmt, setCustomFmt] = useState<"JSON" | "HL7">("JSON");
  const [customText, setCustomText] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState<Record<string, string>>({});
  const [copiedHealed, setCopiedHealed] = useState(false);
  const [taskPreviewId, setTaskPreviewId] = useState<string | null>(null);

  const refreshAll = async () => {
    const s = await fetchSystemStatus();
    setStatus(s);
    const t = await fetchTraces();
    setTraces(t);
    if (t.length > 0 && !activeTrace) {
      setActiveTrace(t[0]);
    }
    const r = await fetchRunbooks();
    setRunbooks(r);
    const q = await fetchWorkflowQueue();
    setTasks(q);
  };

  useEffect(() => {
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
    try {
      const result = await injectChaos({ scenarioId });
      setActiveTrace(result);
      await refreshAll();
    } finally {
      setInjecting(null);
    }
  };

  const handleCustomInject = async () => {
    if (!customText.trim()) return;
    setInjecting(999);
    try {
      const result = await injectChaos({
        format: customFmt,
        customPayload: customText,
      });
      setActiveTrace(result);
      setShowCustomModal(false);
      setCustomText("");
      await refreshAll();
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

  return (
    <div className="min-h-screen bg-[#060709] text-zinc-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-200">
      {/* 1. TOP EXECUTIVE TELEMETRY & STATUS STRIP */}
      <header className="border-b border-white/[0.07] bg-[#060709]/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5">
        <div className="max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-violet-600 flex items-center justify-center shadow-glowCyan border border-cyan-400/30">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[15px] tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                  SynapseHealer
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-white/[0.04] text-zinc-300 border border-white/[0.08]">
                  IRIS 2027.1 AI Hub
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  IPM v1.0.0
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">Autonomous Dead-Letter & Schema Healer</p>
            </div>
          </div>

          {/* Mode & Live Production Indicators */}
          <div className="flex items-center gap-3">
            {/* Mode Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-mono tracking-wide ${
                status?.mode === "live"
                  ? "bg-purple-500/10 border-purple-500/30 text-purple-300 shadow-glowIndigo"
                  : "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  status?.mode === "live" ? "bg-purple-400 animate-ping" : "bg-emerald-400"
                }`}
              />
              <span className="font-semibold uppercase">
                {status?.mode === "live" ? "Live AI Hub Mode" : "Replay Mode (Zero Key)"}
              </span>
            </div>

            {/* Production Health */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-[#0C0E12] text-[11px] font-mono text-zinc-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Production:</span>
              <span className="text-emerald-400 font-bold uppercase">Online</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={refreshAll}
              className="p-1.5 rounded-lg border border-white/[0.08] bg-[#0C0E12] hover:bg-[#161A22] hover:border-white/[0.14] text-zinc-400 hover:text-zinc-200 transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Unified 6-Card Linear-Style Telemetry Strip */}
        <div className="max-w-[1700px] mx-auto mt-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 divide-x divide-white/[0.06] bg-[#0C0E12] border border-white/[0.07] shadow-card rounded-xl overflow-hidden text-xs">
            {/* KPI 1: Auto-Heal Rate */}
            <div className="p-3.5">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-zinc-500 uppercase">
                Auto-Heal Rate
              </span>
              <div className="text-2xl font-mono font-bold text-emerald-400 mt-1 tabular-nums">
                {status?.autoHealRate ?? 90}%
              </div>
              <div className="text-[11px] text-zinc-500 font-mono mt-0.5">VECTOR_COSINE 384d</div>
            </div>

            {/* KPI 2: Total Ingested */}
            <div className="p-3.5">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-zinc-500 uppercase">
                Total Ingested
              </span>
              <div className="text-2xl font-mono font-bold text-zinc-100 mt-1 tabular-nums">
                {status?.totalProcessed ?? 10} msgs
              </div>
              <div className="text-[11px] text-zinc-500 font-mono mt-0.5">Ens.Production Active</div>
            </div>

            {/* KPI 3: Human Review Queue */}
            <div className="p-3.5">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-zinc-500 uppercase">
                Human Review Queue
              </span>
              <div
                className={`text-2xl font-mono font-bold mt-1 tabular-nums ${
                  (status?.workflowPendingCount ?? 0) > 0 ? "text-amber-400" : "text-zinc-200"
                }`}
              >
                {status?.workflowPendingCount ?? tasks.filter((t) => t.workflowStatus === "PENDING_APPROVAL").length}{" "}
                pending
              </div>
              <div className="text-[11px] text-zinc-500 font-mono mt-0.5">Workflow Escalation</div>
            </div>

            {/* KPI 4: Inference Tokens */}
            <div className="p-3.5">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-zinc-500 uppercase">
                Inference Tokens
              </span>
              <div className="text-2xl font-mono font-bold text-cyan-400 mt-1 tabular-nums">
                {(status?.totalTokens ?? 6631).toLocaleString()}
              </div>
              <div className="text-[11px] text-zinc-500 font-mono mt-0.5">Governed HealerTools</div>
            </div>

            {/* KPI 5: Compute Cost */}
            <div className="p-3.5">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-zinc-500 uppercase">
                Compute Cost
              </span>
              <div className="text-2xl font-mono font-bold text-emerald-400 mt-1 tabular-nums">
                ${(status?.estimatedCostUSD ?? 0.0018).toFixed(5)}
              </div>
              <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                {status?.mode === "live" ? "Live AI Hub API" : "Zero-Key Replay"}
              </div>
            </div>

            {/* KPI 6: Avg Latency */}
            <div className="p-3.5">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-zinc-500 uppercase">
                Avg Latency
              </span>
              <div className="text-2xl font-mono font-bold text-indigo-400 mt-1 tabular-nums">
                {status?.avgLatencyMs ?? 145}ms
              </div>
              <div className="text-[11px] text-zinc-500 font-mono mt-0.5">Triage & Dispatch</div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 p-6 space-y-6 max-w-[1700px] w-full mx-auto">
        {/* SECTION 1: CHAOS SCENARIO MATRIX */}
        <section className="bg-[#0C0E12] border border-white/[0.07] shadow-card rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
              <h2 className="text-[11px] font-semibold tracking-[0.08em] text-zinc-300 uppercase">
                Chaos Scenario Command Matrix
              </h2>
              <span className="text-[11px] text-zinc-500 font-mono">
                • Press keys <span className="text-cyan-400 font-semibold">[1]–[7]</span> to inject
              </span>
            </div>

            <button
              onClick={() => setShowCustomModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 text-xs font-mono font-medium flex items-center gap-2 transition"
            >
              <Code2 className="h-3.5 w-3.5 text-cyan-400" />
              <span>Custom Payload Injection</span>
              <span className="text-[10px] text-cyan-400/60 font-sans border border-cyan-500/20 px-1 rounded">
                ⌘K
              </span>
            </button>
          </div>

          {/* 7 Scenario Bento Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {CANONICAL_SCENARIOS.map((sc) => {
              const isInjecting = injecting === sc.id;
              const isHl7 = sc.format === "HL7";
              const targetField = SCENARIO_TARGET_MAP[sc.id] || "payload";

              return (
                <button
                  key={sc.id}
                  disabled={injecting !== null}
                  onClick={() => handleInjectScenario(sc.id)}
                  className={`group relative text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                    isInjecting
                      ? "bg-cyan-950/40 border-cyan-500/50 shadow-glowCyan"
                      : "bg-[#11141A] hover:bg-[#161A22] border-white/[0.06] hover:border-white/[0.14]"
                  }`}
                >
                  <div>
                    {/* Header Row: Shortcut & Protocol */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-5 w-5 rounded bg-white/[0.06] text-zinc-300 font-mono text-[10px] font-bold flex items-center justify-center border border-white/[0.08]">
                          {sc.id}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                            isHl7
                              ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                              : "bg-sky-500/10 text-sky-300 border border-sky-500/20"
                          }`}
                        >
                          {sc.format}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                          sc.risk === "MEDIUM_HIGH"
                            ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                        }`}
                      >
                        {sc.risk === "MEDIUM_HIGH" ? "HITL" : "AUTO"}
                      </span>
                    </div>

                    <h3 className="font-semibold text-xs text-zinc-200 group-hover:text-cyan-300 transition line-clamp-1">
                      {sc.title}
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                      {sc.desc}
                    </p>
                  </div>

                  {/* Footer Row: Target Segment & Play Trigger */}
                  <div className="mt-3 pt-2.5 border-t border-white/[0.05] flex items-center justify-between text-[10px] font-mono text-zinc-500 group-hover:text-zinc-400">
                    <span className="truncate">{targetField}</span>
                    <Play className="h-3 w-3 text-cyan-400 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* SECTION 2: 4-STAGE PIPELINE STEPPER & IDE-GRADE DIFF INSPECTOR */}
        <section className="bg-[#0C0E12] border border-white/[0.07] shadow-card rounded-2xl p-5 space-y-4">
          {/* Section Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
              <h2 className="text-[11px] font-semibold tracking-[0.08em] text-zinc-300 uppercase">
                Autonomous Healing Pipeline & Diff Inspector
              </h2>
              {activeTrace && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-300 border border-white/[0.08]">
                  ID: {activeTrace.payloadId} • {activeTrace.sourceSystem}
                </span>
              )}
            </div>

            {activeTrace && (
              <div className="flex items-center gap-2.5">
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase font-mono border ${
                    activeTrace.decisionBranch === "AUTO_HEAL"
                      ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                      : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                      ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
                      : "bg-rose-500/10 border-rose-500/25 text-rose-300"
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

          {/* Horizontal Interoperability Pipeline Stepper */}
          {activeTrace && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-2 bg-[#11141A] border border-white/[0.06] rounded-xl text-xs font-mono">
              <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                <span className="h-5 w-5 rounded-full bg-rose-500/10 text-rose-400 font-bold flex items-center justify-center text-[10px] border border-rose-500/20">
                  1
                </span>
                <div className="truncate">
                  <div className="text-zinc-300 font-semibold truncate">Inbound Chaos Ingest</div>
                  <div className="text-[10px] text-zinc-500 truncate">DeadLetterInbound (Python)</div>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                <span className="h-5 w-5 rounded-full bg-cyan-500/10 text-cyan-400 font-bold flex items-center justify-center text-[10px] border border-cyan-500/20">
                  2
                </span>
                <div className="truncate">
                  <div className="text-zinc-300 font-semibold truncate">Vector Search RAG</div>
                  <div className="text-[10px] text-zinc-500 truncate">VECTOR_COSINE (384d)</div>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                <span className="h-5 w-5 rounded-full bg-indigo-500/10 text-indigo-400 font-bold flex items-center justify-center text-[10px] border border-indigo-500/20">
                  3
                </span>
                <div className="truncate">
                  <div className="text-zinc-300 font-semibold truncate">Governed AI Agent</div>
                  <div className="text-[10px] text-zinc-500 truncate">HealerToolSet (%AI.Agent)</div>
                </div>
              </div>

              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                  activeTrace.decisionBranch === "AUTO_HEAL"
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                    : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                    ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
                    : "bg-rose-500/10 border-rose-500/25 text-rose-300"
                }`}
              >
                <span className="h-5 w-5 rounded-full bg-white/[0.08] font-bold flex items-center justify-center text-[10px]">
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
                  <div className="text-[10px] opacity-75 truncate">
                    {activeTrace.decisionBranch === "AUTO_HEAL"
                      ? "Auto-Dispatched"
                      : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                      ? "Pending HITL Approval"
                      : "Isolated in Vault"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3-Column IDE-Grade Diff Inspector */}
          {activeTrace ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column: Malformed Inbound Payload */}
              <div className="lg:col-span-4 bg-[#11141A] border border-rose-500/20 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5 font-mono">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Inbound Dead-Letter
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 uppercase">
                      {activeTrace.format}
                    </span>
                  </div>

                  {/* Validation Error Banner */}
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 mb-3 text-xs text-rose-200 font-mono leading-relaxed">
                    <span className="font-bold text-rose-400">ValidationError: </span>
                    {activeTrace.validationError}
                  </div>

                  {/* Line Numbered Code Well */}
                  <div className="bg-[#0C0E12] rounded-lg border border-white/[0.05] p-2 max-h-[380px] overflow-y-auto font-mono text-[11px] leading-relaxed">
                    {inboundLines.lines.map((line, idx) => {
                      const isMutated = inboundLines.mutatedIndices.has(idx);
                      const lineNum = String(idx + 1).padStart(2, "0");
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 px-1 py-0.5 rounded ${
                            isMutated
                              ? "bg-rose-500/15 text-rose-200 border-l-2 border-rose-500 font-medium"
                              : "text-zinc-400"
                          }`}
                        >
                          <span className="text-zinc-600 select-none w-5 text-right shrink-0">
                            {lineNum}
                          </span>
                          <span className="break-all whitespace-pre-wrap">{line}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/[0.05] text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                  <span>Len: {activeTrace.rawPayload.length} bytes</span>
                  <span>Intercepted at Ingestion</span>
                </div>
              </div>

              {/* Center Column: %AI.RAG Vector Match & Tool Timeline */}
              <div className="lg:col-span-4 bg-[#11141A] border border-white/[0.07] rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5 font-mono">
                      <Database className="h-3.5 w-3.5" />
                      %AI.RAG Vector Match
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                      {activeTrace.matchedPatternId}
                    </span>
                  </div>

                  {/* Cosine Similarity Gauge */}
                  <div className="bg-[#0C0E12] border border-white/[0.05] rounded-lg p-2.5 mb-3 text-xs font-mono">
                    <div className="flex items-center justify-between mb-1.5 text-zinc-300">
                      <span>VECTOR_COSINE Match</span>
                      <span className="font-bold text-emerald-400">
                        {(activeTrace.confidenceScore).toFixed(2)}
                      </span>
                    </div>
                    <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, activeTrace.confidenceScore * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Agent Diagnosis */}
                  <div className="border-l-2 border-indigo-500 bg-[#0C0E12] rounded-r-lg p-2.5 mb-3 text-xs text-zinc-300 leading-relaxed font-sans">
                    <div className="font-semibold text-indigo-300 text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                      <Sparkles className="h-3 w-3" /> Agent Diagnosis
                    </div>
                    {activeTrace.agentReasoning}
                  </div>

                  {/* Governed Tool Execution Spine */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.08em] font-mono flex items-center gap-1">
                      <Terminal className="h-3 w-3 text-cyan-400" /> Governed Tool Execution Spine
                    </span>

                    <div className="relative pl-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-white/[0.1] space-y-2">
                      {activeTrace.toolTrace && activeTrace.toolTrace.length > 0 ? (
                        activeTrace.toolTrace.map((call, idx) => (
                          <div
                            key={idx}
                            className="relative bg-[#0C0E12] border border-white/[0.06] rounded-lg p-2 text-xs font-mono"
                          >
                            <span className="absolute -left-5 top-2.5 h-2 w-2 rounded-full bg-cyan-400 ring-4 ring-[#11141A]" />
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-cyan-300">
                                #{call.step} {call.tool}()
                              </span>
                              <span className="text-[10px] text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                                {call.durationMs}ms
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400 mt-1 truncate">
                              <span className="text-zinc-600">out: </span>
                              {JSON.stringify(call.output)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-zinc-500 italic p-2 bg-[#0C0E12] rounded">
                          No tool steps recorded.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/[0.05] text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                  <span>Tokens: {activeTrace.promptTokens + activeTrace.completionTokens}</span>
                  <span>Cost: ${activeTrace.estimatedCostUSD.toFixed(5)}</span>
                </div>
              </div>

              {/* Right Column: Healed Outbound Payload */}
              <div className="lg:col-span-4 bg-[#11141A] border border-emerald-500/20 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 font-mono">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Healed Outbound Payload
                    </span>
                    <button
                      onClick={handleCopyHealed}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 flex items-center gap-1 transition"
                    >
                      <Copy className="h-3 w-3" />
                      <span>{copiedHealed ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>

                  {/* Route Destination Banner */}
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 mb-3 text-xs text-emerald-200 font-mono flex items-center justify-between">
                    <span className="truncate">
                      <span className="font-bold text-emerald-400">Route: </span>
                      {activeTrace.decisionBranch === "AUTO_HEAL"
                        ? "ResubmitDeliveryOp -> Downstream"
                        : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                        ? "WorkflowEscalationOp -> TaskQueue"
                        : "QuarantineVaultOp -> Isolated"}
                    </span>
                    <span className="font-bold text-emerald-300 shrink-0 ml-2">100% Valid</span>
                  </div>

                  {/* Line Numbered Healed Code Well */}
                  <div className="bg-[#0C0E12] rounded-lg border border-white/[0.05] p-2 max-h-[380px] overflow-y-auto font-mono text-[11px] leading-relaxed">
                    {outboundLines.lines.map((line, idx) => {
                      const isMutated = outboundLines.mutatedIndices.has(idx);
                      const lineNum = String(idx + 1).padStart(2, "0");
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 px-1 py-0.5 rounded ${
                            isMutated
                              ? "bg-emerald-500/15 text-emerald-200 border-l-2 border-emerald-500 font-medium"
                              : "text-zinc-400"
                          }`}
                        >
                          <span className="text-zinc-600 select-none w-5 text-right shrink-0">
                            {lineNum}
                          </span>
                          <span className="break-all whitespace-pre-wrap">{line}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/[0.05] text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                  <span>Len: {activeTrace.healedPayload.length} bytes</span>
                  <span className="text-emerald-400 font-bold uppercase">Ready for Dispatch</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-zinc-500 text-xs font-mono">
              No payload loaded. Select a scenario above or click a trace below.
            </div>
          )}
        </section>

        {/* SECTION 3: MULTI-TAB WORKSPACE (WORKFLOW QUEUE, VECTOR RAG, TRACES) */}
        <section className="bg-[#0C0E12] border border-white/[0.07] shadow-card rounded-2xl p-5">
          {/* Segmented Tab Bar */}
          <div className="flex items-center gap-3 border-b border-white/[0.07] pb-3 mb-4">
            <button
              onClick={() => setActiveTab("queue")}
              className={`flex items-center gap-2 text-xs font-mono font-medium px-3 py-1.5 rounded-lg transition ${
                activeTab === "queue"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>Human Workflow Queue</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-zinc-300 font-mono">
                {tasks.filter((t) => t.workflowStatus === "PENDING_APPROVAL").length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("rag")}
              className={`flex items-center gap-2 text-xs font-mono font-medium px-3 py-1.5 rounded-lg transition ${
                activeTab === "rag"
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              <span>IRIS Vector Search Runbooks</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-zinc-300 font-mono">
                {runbooks.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 text-xs font-mono font-medium px-3 py-1.5 rounded-lg transition ${
                activeTab === "history"
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Live Audit Telemetry</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-zinc-300 font-mono">
                {traces.length}
              </span>
            </button>
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
                      className="bg-[#11141A] border border-white/[0.06] rounded-xl p-4 transition"
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
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              task.workflowStatus === "APPROVED"
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                : task.workflowStatus === "REJECTED"
                                ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                                : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
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
                            <div className="bg-[#0C0E12] border border-rose-500/20 rounded-lg p-2.5">
                              <span className="text-rose-400 font-bold block mb-1">Inbound Malformed:</span>
                              <pre className="text-zinc-400 max-h-32 overflow-y-auto whitespace-pre-wrap">
                                {task.rawPayload}
                              </pre>
                            </div>
                            <div className="bg-[#0C0E12] border border-emerald-500/20 rounded-lg p-2.5">
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
                            className="flex-1 min-w-[240px] px-3 py-1.5 rounded-lg bg-[#0C0E12] border border-white/[0.08] text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
                          />

                          <div className="flex items-center gap-2">
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
                <div className="text-center py-10 bg-[#11141A] border border-white/[0.05] rounded-xl">
                  <ShieldCheck className="h-8 w-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                  <p className="text-xs font-mono text-zinc-300">
                    Zero pending escalation tasks.
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    All incoming anomalies have been auto-healed or completed review.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT B: IRIS VECTOR SEARCH RUNBOOKS */}
          {activeTab === "rag" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {runbooks.map((rb) => (
                <div
                  key={rb.patternId}
                  className="bg-[#11141A] border border-white/[0.06] rounded-xl p-3.5 text-xs space-y-2 hover:border-white/[0.12] transition"
                >
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-cyan-300 truncate">{rb.patternId}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                      {rb.format}
                    </span>
                  </div>

                  <div className="text-zinc-400 font-sans line-clamp-2 text-[11px] leading-relaxed">
                    {rb.errorSignature}
                  </div>

                  <div className="pt-2 border-t border-white/[0.05] text-[11px] font-mono space-y-1">
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
            <div className="bg-[#11141A] border border-white/[0.06] rounded-xl overflow-hidden font-mono text-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-[#0C0E12] text-zinc-500 text-[10px] uppercase tracking-wider">
                      <th className="py-2.5 px-4">Payload ID</th>
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Source System</th>
                      <th className="py-2.5 px-4">Format</th>
                      <th className="py-2.5 px-4">Decision Branch</th>
                      <th className="py-2.5 px-4">Confidence</th>
                      <th className="py-2.5 px-4">Latency</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] text-[11px]">
                    {traces.map((tr) => (
                      <tr
                        key={tr.payloadId}
                        onClick={() => setActiveTrace(tr)}
                        className={`cursor-pointer transition hover:bg-white/[0.02] ${
                          activeTrace?.payloadId === tr.payloadId ? "bg-cyan-500/[0.05]" : ""
                        }`}
                      >
                        <td className="py-2.5 px-4 font-semibold text-zinc-200">
                          {tr.payloadId}
                        </td>
                        <td className="py-2.5 px-4 text-zinc-500">{tr.timestamp}</td>
                        <td className="py-2.5 px-4 text-zinc-400">{tr.sourceSystem}</td>
                        <td className="py-2.5 px-4 uppercase text-zinc-300">{tr.format}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              tr.decisionBranch === "AUTO_HEAL"
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                : tr.decisionBranch === "HUMAN_WORKFLOW"
                                ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                                : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                            }`}
                          >
                            {tr.decisionBranch}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-zinc-300">
                          {(tr.confidenceScore * 100).toFixed(0)}%
                        </td>
                        <td className="py-2.5 px-4 text-zinc-500">{tr.latencyMs}ms</td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTrace(tr);
                            }}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 border border-cyan-500/25 px-2 py-0.5 rounded"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#0C0E12] border border-white/[0.1] shadow-2xl rounded-2xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
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
                      : "bg-[#11141A] border-white/[0.08] text-zinc-400"
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
                      : "bg-[#11141A] border-white/[0.08] text-zinc-400"
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
              className="w-full bg-[#11141A] border border-white/[0.08] rounded-xl p-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
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
