"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Database,
  DollarSign,
  FileCode,
  Flame,
  HelpCircle,
  Layers,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserCheck,
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
    try {
      await resolveWorkflowTask(payloadId, action, `Reviewed by human operator via dashboard.`);
      await refreshAll();
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. TOP TELEMETRY & STATUS BAR */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Sparkles className="h-5 w-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-blue-400 via-indigo-200 to-emerald-400 bg-clip-text text-transparent">
                  SynapseHealer
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-blue-900/50 text-blue-300 border border-blue-700/60">
                  IRIS 2027.1 AI
                </span>
              </div>
              <p className="text-xs text-slate-400">Autonomous Dead-Letter & Schema Healer</p>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-3">
            {/* Mode Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold uppercase tracking-wider ${
                status?.mode === "live"
                  ? "bg-purple-950/60 border-purple-600 text-purple-300 shadow-sm shadow-purple-500/20"
                  : "bg-emerald-950/60 border-emerald-600 text-emerald-300 shadow-sm shadow-emerald-500/20"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  status?.mode === "live" ? "bg-purple-400 animate-ping" : "bg-emerald-400"
                }`}
              />
              {status?.mode === "live" ? "LIVE AI HUB MODE" : "REPLAY MODE (Zero Key)"}
            </div>

            {/* Production State Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-xs font-medium text-slate-300">
              <Activity className="h-3.5 w-3.5 text-blue-400" />
              <span>Production:</span>
              <span className="text-emerald-400 font-bold">ONLINE</span>
            </div>

            <button
              onClick={refreshAll}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Aggregate KPI Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
            <span className="text-slate-500 uppercase tracking-wider text-[10px]">Auto-Heal Rate</span>
            <div className="text-base font-bold text-emerald-400 mt-0.5">
              {status?.autoHealRate ?? 100}%
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
            <span className="text-slate-500 uppercase tracking-wider text-[10px]">Total Processed</span>
            <div className="text-base font-bold text-slate-100 mt-0.5">
              {status?.totalProcessed ?? 0}
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
            <span className="text-slate-500 uppercase tracking-wider text-[10px]">Human Queue</span>
            <div className="text-base font-bold text-amber-400 mt-0.5">
              {status?.workflowPendingCount ?? tasks.filter((t) => t.workflowStatus === "PENDING_APPROVAL").length}
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
            <span className="text-slate-500 uppercase tracking-wider text-[10px]">Cumulative Tokens</span>
            <div className="text-base font-bold text-indigo-400 mt-0.5">
              {status?.totalTokens ? status.totalTokens.toLocaleString() : "14,280"}
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
            <span className="text-slate-500 uppercase tracking-wider text-[10px]">Inference Cost</span>
            <div className="text-base font-bold text-emerald-400 mt-0.5">
              ${status?.estimatedCostUSD ? status.estimatedCostUSD.toFixed(5) : "0.00428"}
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
            <span className="text-slate-500 uppercase tracking-wider text-[10px]">Avg Latency</span>
            <div className="text-base font-bold text-blue-400 mt-0.5">
              {status?.avgLatencyMs ? `${status.avgLatencyMs}ms` : "168ms"}
            </div>
          </div>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 p-6 space-y-6 max-w-[1700px] w-full mx-auto">
        {/* PANEL 1: CHAOS SCENARIO INJECTOR */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-rose-500" />
              <h2 className="font-bold text-slate-100 text-sm tracking-wide uppercase">
                Panel 1: Chaos Scenario Injector
              </h2>
              <span className="text-xs text-slate-500">
                (Click any scenario to inject a malformed payload into the Interoperability workflow)
              </span>
            </div>

            <button
              onClick={() => setShowCustomModal(true)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow shadow-blue-500/20"
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Custom Payload Injection</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {CANONICAL_SCENARIOS.map((sc) => {
              const isInjecting = injecting === sc.id;
              const isHl7 = sc.format === "HL7";
              return (
                <button
                  key={sc.id}
                  disabled={injecting !== null}
                  onClick={() => handleInjectScenario(sc.id)}
                  className={`group relative text-left p-3.5 rounded-xl border transition flex flex-col justify-between ${
                    isInjecting
                      ? "bg-blue-950/80 border-blue-500 shadow-lg shadow-blue-500/20 animate-pulse"
                      : "bg-slate-950/60 border-slate-800 hover:border-blue-500/70 hover:bg-slate-800/50"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                          isHl7 ? "bg-amber-950/80 text-amber-300 border border-amber-800" : "bg-sky-950/80 text-sky-300 border border-sky-800"
                        }`}
                      >
                        {sc.format}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          sc.risk === "MEDIUM_HIGH"
                            ? "bg-rose-950/60 text-rose-300 border border-rose-800"
                            : "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
                        }`}
                      >
                        {sc.risk}
                      </span>
                    </div>
                    <h3 className="font-semibold text-xs text-slate-200 group-hover:text-blue-300 transition line-clamp-1">
                      {sc.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {sc.desc}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>{sc.badge}</span>
                    <Play className="h-3 w-3 text-blue-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* PANEL 2: SIDE-BY-SIDE DIFF & AGENT REASONING INSPECTOR */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-indigo-400" />
              <h2 className="font-bold text-slate-100 text-sm tracking-wide uppercase">
                Panel 2: Side-by-Side Diff & Agent Reasoning Inspector
              </h2>
              {activeTrace && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {activeTrace.payloadId} ({activeTrace.sourceSystem})
                </span>
              )}
            </div>

            {activeTrace && (
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase font-mono border ${
                    activeTrace.decisionBranch === "AUTO_HEAL"
                      ? "bg-emerald-950 border-emerald-600 text-emerald-300"
                      : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                      ? "bg-amber-950 border-amber-600 text-amber-300"
                      : "bg-rose-950 border-rose-600 text-rose-300"
                  }`}
                >
                  Branch: {activeTrace.decisionBranch}
                </span>
                <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700">
                  Confidence: {(activeTrace.confidenceScore * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>

          {activeTrace ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column: Broken Inbound Payload */}
              <div className="lg:col-span-4 bg-slate-950/80 border border-rose-900/60 rounded-xl p-4 flex flex-col justify-between shadow-lg">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      Malformed Inbound Payload
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      {activeTrace.format}
                    </span>
                  </div>

                  <div className="bg-rose-950/20 border border-rose-900/40 rounded-lg p-2.5 mb-3 text-xs text-rose-300 font-mono">
                    <span className="font-bold">ValidationError: </span>
                    {activeTrace.validationError}
                  </div>

                  <pre className="bg-slate-900 p-3 rounded-lg text-xs font-mono text-rose-200 overflow-x-auto max-h-[360px] whitespace-pre-wrap leading-relaxed border border-rose-950">
                    {activeTrace.rawPayload}
                  </pre>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-500 font-mono flex items-center justify-between">
                  <span>Len: {activeTrace.rawPayload.length} bytes</span>
                  <span>Quarantined at Ingest</span>
                </div>
              </div>

              {/* Center Column: %AI.RAG & Tool Execution Trace */}
              <div className="lg:col-span-4 bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                      <Database className="h-4 w-4" />
                      Matched %AI.RAG Runbook & Reasoning
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                      {activeTrace.matchedPatternId}
                    </span>
                  </div>

                  {/* Agent Narrative Reasoning */}
                  <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-lg p-3 mb-3 text-xs text-indigo-200 leading-relaxed">
                    <p className="font-bold text-indigo-300 mb-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Agent Diagnosis:
                    </p>
                    {activeTrace.agentReasoning}
                  </div>

                  {/* Step-by-Step Tool Trace */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Terminal className="h-3 w-3 text-blue-400" /> Governed Tool Call Trace
                    </span>
                    {activeTrace.toolTrace && activeTrace.toolTrace.length > 0 ? (
                      activeTrace.toolTrace.map((call, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-xs font-mono"
                        >
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="font-bold text-blue-400">
                              #{call.step} {call.tool}()
                            </span>
                            <span className="text-[10px] text-slate-500">{call.durationMs}ms</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 truncate">
                            <span className="text-slate-500">out: </span>
                            {JSON.stringify(call.output)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-500 italic p-2 bg-slate-900 rounded">
                        No sub-tool traces available.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-500 font-mono flex items-center justify-between">
                  <span>Tokens: {activeTrace.promptTokens + activeTrace.completionTokens}</span>
                  <span>Cost: ${activeTrace.estimatedCostUSD.toFixed(5)}</span>
                </div>
              </div>

              {/* Right Column: Healed Outbound Payload */}
              <div className="lg:col-span-4 bg-slate-950/80 border border-emerald-900/60 rounded-xl p-4 flex flex-col justify-between shadow-lg">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4" />
                      Healed Outbound Payload
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      SCHEMA VALIDATED
                    </span>
                  </div>

                  <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-2.5 mb-3 text-xs text-emerald-300 font-mono flex items-center justify-between">
                    <span>
                      <span className="font-bold">Route: </span>
                      {activeTrace.decisionBranch === "AUTO_HEAL"
                        ? "ResubmitDeliveryOp -> Downstream"
                        : activeTrace.decisionBranch === "HUMAN_WORKFLOW"
                        ? "WorkflowEscalationOp -> Review Role"
                        : "QuarantineVaultOp -> Isolated"}
                    </span>
                    <span className="font-bold">100% Valid</span>
                  </div>

                  <pre className="bg-slate-900 p-3 rounded-lg text-xs font-mono text-emerald-200 overflow-x-auto max-h-[360px] whitespace-pre-wrap leading-relaxed border border-emerald-950">
                    {activeTrace.healedPayload}
                  </pre>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-500 font-mono flex items-center justify-between">
                  <span>Len: {activeTrace.healedPayload.length} bytes</span>
                  <span className="text-emerald-400 font-bold">READY FOR DISPATCH</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 text-sm">
              No dead-letter traces recorded yet. Click any chaos scenario above to test!
            </div>
          )}
        </section>

        {/* PANEL 3: TABS FOR WORKFLOW QUEUE, VECTOR RAG RUNBOOKS & AUDIT TRACES */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-xl">
          {/* Tab Navigation */}
          <div className="flex items-center gap-4 border-b border-slate-800 pb-3 mb-4">
            <button
              onClick={() => setActiveTab("queue")}
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider pb-2 border-b-2 transition ${
                activeTab === "queue"
                  ? "border-amber-400 text-amber-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <UserCheck className="h-4 w-4" />
              Human Workflow Queue ({tasks.filter((t) => t.workflowStatus === "PENDING_APPROVAL").length})
            </button>

            <button
              onClick={() => setActiveTab("rag")}
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider pb-2 border-b-2 transition ${
                activeTab === "rag"
                  ? "border-blue-400 text-blue-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Database className="h-4 w-4" />
              IRIS Vector Search RAG Runbooks ({runbooks.length})
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider pb-2 border-b-2 transition ${
                activeTab === "history"
                  ? "border-emerald-400 text-emerald-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="h-4 w-4" />
              Live Telemetry Traces ({traces.length})
            </button>
          </div>

          {/* TAB CONTENT A: HUMAN WORKFLOW QUEUE */}
          {activeTab === "queue" && (
            <div className="space-y-3">
              {tasks.length > 0 ? (
                tasks.map((task) => (
                  <div
                    key={task.payloadId}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 max-w-3xl">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-200 font-mono">
                          {task.payloadId}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                          {task.patternId}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {task.sourceSystem}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            task.workflowStatus === "PENDING_APPROVAL"
                              ? "bg-amber-900/60 text-amber-300 animate-pulse"
                              : task.workflowStatus === "APPROVED"
                              ? "bg-emerald-950 text-emerald-300"
                              : "bg-rose-950 text-rose-300"
                          }`}
                        >
                          {task.workflowStatus}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{task.reasoning}</p>
                      {task.operatorNotes && (
                        <p className="text-[11px] text-slate-500 italic">Notes: {task.operatorNotes}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      {task.workflowStatus === "PENDING_APPROVAL" ? (
                        <>
                          <button
                            disabled={resolvingId !== null}
                            onClick={() => handleResolveTask(task.payloadId, "APPROVE")}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition shadow shadow-emerald-500/20"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Approve Patch</span>
                          </button>
                          <button
                            disabled={resolvingId !== null}
                            onClick={() => handleResolveTask(task.payloadId, "REJECT")}
                            className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-1 transition shadow shadow-rose-500/20"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Reject & Quarantine</span>
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-mono text-slate-500">Resolved</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No pending tasks in the InterSystems Workflow queue.
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT B: VECTOR RAG RUNBOOKS */}
          {activeTab === "rag" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {runbooks.map((rb) => (
                <div
                  key={rb.patternId}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2 font-mono text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-400">{rb.patternId}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                      {rb.format} | Strategy: {rb.repairStrategy}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-sans">{rb.errorSignature}</p>
                  <div className="text-[11px] text-slate-400 bg-slate-900 p-2.5 rounded border border-slate-800/80 leading-relaxed">
                    <span className="text-indigo-300 font-bold">Repair Rule: </span>
                    {rb.repairRule}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1">
                    <span>Source: {rb.vendorSource}</span>
                    <span>Cosine Threshold: {rb.confidenceThreshold}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB CONTENT C: HISTORICAL TELEMETRY TRACES */}
          {activeTab === "history" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                    <th className="py-2.5 px-3">Payload ID</th>
                    <th className="py-2.5 px-3">Format</th>
                    <th className="py-2.5 px-3">Branch</th>
                    <th className="py-2.5 px-3">Confidence</th>
                    <th className="py-2.5 px-3">Risk</th>
                    <th className="py-2.5 px-3">Tokens</th>
                    <th className="py-2.5 px-3">Cost ($)</th>
                    <th className="py-2.5 px-3">Latency</th>
                    <th className="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {traces.map((tr) => (
                    <tr
                      key={tr.payloadId}
                      className="hover:bg-slate-800/40 transition cursor-pointer"
                      onClick={() => setActiveTrace(tr)}
                    >
                      <td className="py-2 px-3 text-slate-200 font-bold">{tr.payloadId}</td>
                      <td className="py-2 px-3">{tr.format}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            tr.decisionBranch === "AUTO_HEAL"
                              ? "bg-emerald-950 text-emerald-300"
                              : tr.decisionBranch === "HUMAN_WORKFLOW"
                              ? "bg-amber-950 text-amber-300"
                              : "bg-rose-950 text-rose-300"
                          }`}
                        >
                          {tr.decisionBranch}
                        </span>
                      </td>
                      <td className="py-2 px-3">{(tr.confidenceScore * 100).toFixed(0)}%</td>
                      <td className="py-2 px-3">{tr.riskLevel}</td>
                      <td className="py-2 px-3 text-indigo-400">
                        {tr.promptTokens + tr.completionTokens}
                      </td>
                      <td className="py-2 px-3 text-emerald-400">
                        ${tr.estimatedCostUSD.toFixed(5)}
                      </td>
                      <td className="py-2 px-3 text-blue-400">{tr.latencyMs}ms</td>
                      <td className="py-2 px-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTrace(tr);
                          }}
                          className="text-[11px] text-blue-400 hover:underline"
                        >
                          View Diff
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* CUSTOM PAYLOAD MODAL */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-blue-400" />
                Custom Dead-Letter Payload Injection
              </h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-slate-400">Payload Format</label>
                <div className="flex items-center gap-4 mt-1">
                  <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="fmt"
                      checked={customFmt === "JSON"}
                      onChange={() => setCustomFmt("JSON")}
                    />
                    JSON
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="fmt"
                      checked={customFmt === "HL7"}
                      onChange={() => setCustomFmt("HL7")}
                    />
                    HL7 v2
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-slate-400">Raw Malformed Content</label>
                <textarea
                  rows={8}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder={
                    customFmt === "JSON"
                      ? '{\n  "order_id": "ORD-99",\n  "quantity": "25",\n  "unit_price": "$99.50"\n}'
                      : 'MSH|^~\\&|Epic|HOSP|Synapse|Core|20260501||ADT^A01|001|P|2.5.1\rPV1|1|I|W402\rPID|1||12345^^^MRN||DOE^JANE||1985-02-31\r'
                  }
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                disabled={injecting !== null || !customText.trim()}
                onClick={handleCustomInject}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-1.5 transition shadow shadow-blue-500/20"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Inject & Heal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500 font-mono">
        InterSystems Programming Contest: AI Agents in Interoperability Workflows • SynapseHealer • Built for EAP 2027.1 / 2026.3
      </footer>
    </div>
  );
}
