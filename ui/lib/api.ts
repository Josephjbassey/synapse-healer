export interface SystemStatus {
  mode: "replay" | "live";
  llmProvider: string;
  llmModel: string;
  hasApiKey: boolean;
  productionRunning: boolean;
  runbookCount: number;
  totalProcessed: number;
  autoHealedCount: number;
  workflowPendingCount: number;
  quarantinedCount: number;
  autoHealRate: number;
  totalTokens: number;
  estimatedCostUSD: number;
  avgLatencyMs: number;
}

export interface ToolCallTrace {
  step: number;
  tool: string;
  input: Record<string, any>;
  output: Record<string, any>;
  durationMs: number;
}

export interface HealTrace {
  payloadId: string;
  timestamp: string;
  sourceSystem: string;
  format: "HL7" | "JSON";
  validationError: string;
  rawPayload: string;
  healedPayload: string;
  decisionBranch: "AUTO_HEAL" | "HUMAN_WORKFLOW" | "QUARANTINE";
  confidenceScore: number;
  riskLevel: "LOW" | "MEDIUM_HIGH" | "CRITICAL";
  matchedPatternId: string;
  agentReasoning: string;
  toolTrace: ToolCallTrace[];
  promptTokens: number;
  completionTokens: number;
  estimatedCostUSD: number;
  latencyMs: number;
  executionMode: "replay" | "live";
  workflowStatus: "NONE" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
}

export interface Runbook {
  patternId: string;
  errorSignature: string;
  format: string;
  vendorSource: string;
  rootCause: string;
  repairStrategy: string;
  repairRule: string;
  confidenceThreshold: number;
}

export interface WorkflowTask {
  payloadId: string;
  patternId: string;
  timestamp: string;
  sourceSystem: string;
  format: string;
  confidenceScore: number;
  riskLevel: string;
  workflowStatus: "NONE" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  reasoning: string;
  rawPayload: string;
  healedPayload: string;
  operatorNotes?: string;
}

export const CANONICAL_SCENARIOS = [
  {
    id: 1,
    title: "HL7 PV1/PID Inversion",
    format: "HL7",
    errorType: "HL7_SWAPPED_FIELDS",
    badge: "Grammar Inversion",
    risk: "LOW",
    desc: "PV1 visit segment placed before PID in ADT^A01 event. Re-sequences segments to HL7 v2.5.1 grammar.",
  },
  {
    id: 2,
    title: "HL7 Invalid Calendar Date",
    format: "HL7",
    errorType: "HL7_INVALID_DATE",
    badge: "Clinical Ambiguity",
    risk: "MEDIUM_HIGH",
    desc: "PID-7 contains impossible day '1985-02-31'. Clamps to boundary and escalates to Human Workflow.",
  },
  {
    id: 3,
    title: "HL7 Unescaped Delimiter",
    format: "HL7",
    errorType: "HL7_UNESCAPED_DELIMITER",
    badge: "Field Leak",
    risk: "LOW",
    desc: "Literal '|' in OBX-5 observation narrative. Substitutes HL7 escape sequence '\\F\\'.",
  },
  {
    id: 4,
    title: "JSON Quoted Numbers",
    format: "JSON",
    errorType: "JSON_STRINGIFIED_NUMBERS",
    badge: "Type Coercion",
    risk: "LOW",
    desc: "Quoted numbers and currency symbols ('$149.99', '12'). Casts to strict numeric and boolean types.",
  },
  {
    id: 5,
    title: "JSON Schema Key Mutation",
    format: "JSON",
    errorType: "JSON_KEY_MUTATION-V2",
    badge: "API Migration",
    risk: "LOW",
    desc: "Vendor updated keys ('client_uuid' -> 'customer_id', 'line_items' -> 'order_items'). Applies aliasing map.",
  },
  {
    id: 6,
    title: "JSON Epoch Timestamp",
    format: "JSON",
    errorType: "JSON_TIMESTAMP_EPOCH_MILLIS",
    badge: "Timestamp Format",
    risk: "LOW",
    desc: "Integer epoch milliseconds (1714567890123) instead of ISO-8601 string. Converts to UTC ISO format.",
  },
  {
    id: 7,
    title: "JSON Corrupted Nesting",
    format: "JSON",
    errorType: "JSON_CORRUPTED_NESTING",
    badge: "Structural Unflatten",
    risk: "LOW",
    desc: "Flattened comma-separated order items string. Unflattens into structured array of objects.",
  },
];

// Fallback mock data ensuring seamless UI operation when API is unreachable
const MOCK_STATUS: SystemStatus = {
  mode: "replay",
  llmProvider: "gemini",
  llmModel: "gemini-1.5-flash",
  hasApiKey: false,
  productionRunning: true,
  runbookCount: 10,
  totalProcessed: 28,
  autoHealedCount: 23,
  workflowPendingCount: 3,
  quarantinedCount: 2,
  autoHealRate: 82.1,
  totalTokens: 14280,
  estimatedCostUSD: 0.00428,
  avgLatencyMs: 168,
};

const MOCK_RUNBOOKS: Runbook[] = [
  {
    patternId: "HL7-PID-PV1-INVERSION",
    errorSignature: "Segment out of grammatical order: PV1 visit segment received prior to PID patient identification",
    format: "HL7",
    vendorSource: "Epic ADT Gateway / Legacy Cloverleaf",
    rootCause: "HL7 v2 specification mandates PID precede PV1. Upstream multiplexer swapped sequence during batching.",
    repairStrategy: "REORDER_SEGMENTS",
    repairRule: "Re-sequence segments: MSH -> EVN -> PID -> PV1 maintaining sub-segment relative order.",
    confidenceThreshold: 0.90,
  },
  {
    patternId: "HL7-DATE-FORMAT-INVALID",
    errorSignature: "HL7 DataType Error: PID-7 Date/Time of Birth contains invalid date format (hyphenated or Feb 31)",
    format: "HL7",
    vendorSource: "AthenaHealth Ambulatory EHR Bridge",
    rootCause: "REST-to-HL7 bridge serialized date as ISO-8601 string with hyphens rather than HL7 TS YYYYMMDD.",
    repairStrategy: "REGEX_TRANSFORM",
    repairRule: "Strip hyphens; validate calendar boundary. Escalate impossible days (Feb 31) to Human Workflow.",
    confidenceThreshold: 0.88,
  },
  {
    patternId: "HL7-ESCAPE-DELIMITER-LEAK",
    errorSignature: "HL7 Tokenizer Error: Unescaped field delimiter pipe character '|' inside textual OBX-5 observation",
    format: "HL7",
    vendorSource: "Roche Cobas LIS Interface",
    rootCause: "Lab comment contains unescaped vertical bar '|' which corrupts segment field alignment.",
    repairStrategy: "ESCAPE_DELIMITERS",
    repairRule: "Scan OBX textual observation fields. Substitute literal '|' with HL7 escape sequence '\\F\\'.",
    confidenceThreshold: 0.92,
  },
  {
    patternId: "JSON-STRINGIFIED-NUMBERS",
    errorSignature: "JSON Schema Type Error: Properties expected numeric types but received quoted strings with currency symbols",
    format: "JSON",
    vendorSource: "Shopify Medical Store / NetSuite ERP Webhook",
    rootCause: "Financial export system quoted high-precision numbers to avoid JavaScript 64-bit float precision loss.",
    repairStrategy: "CAST_NUMERIC_AND_BOOLEAN",
    repairRule: "Strip currency symbols ('$', '€') and cast to float/int. Cast boolean strings to boolean true/false.",
    confidenceThreshold: 0.95,
  },
  {
    patternId: "JSON-KEY-MUTATION-V2",
    errorSignature: "JSON Schema Key Violation: Missing mandatory properties ['customer_id', 'order_items']; unexpected vendor keys ['client_uuid']",
    format: "JSON",
    vendorSource: "Salesforce Commerce Cloud API v2 Migration",
    rootCause: "Vendor upgraded upstream API payload schema without version negotiation.",
    repairStrategy: "SCHEMA_KEY_ALIAS_MAP",
    repairRule: "Apply bidirectional key aliasing dictionary: {'client_uuid': 'customer_id', 'line_items': 'order_items'}.",
    confidenceThreshold: 0.93,
  },
  {
    patternId: "JSON-TIMESTAMP-EPOCH-MILLIS",
    errorSignature: "JSON Schema Format Error: Property 'created_at' expected RFC3339/ISO-8601 string, received integer Unix epoch",
    format: "JSON",
    vendorSource: "Kafka CDC Debezium Connector",
    rootCause: "Database change-data-capture stream serialized SQL timestamp column as UTC epoch milliseconds.",
    repairStrategy: "CONVERT_EPOCH_TO_ISO",
    repairRule: "Convert Unix epoch integer/float timestamp to UTC RFC3339/ISO-8601 string '%Y-%m-%dT%H:%M:%SZ'.",
    confidenceThreshold: 0.91,
  },
  {
    patternId: "JSON-CORRUPTED-NESTING",
    errorSignature: "JSON Schema Structural Error: Expected array of objects for 'order_items', received flat comma-delimited string",
    format: "JSON",
    vendorSource: "Mirth Legacy JSON Bridge",
    rootCause: "Legacy middleware flattened repeating XML records into a single concatenated string.",
    repairStrategy: "UNFLATTEN_STRING_TO_ARRAY",
    repairRule: "Parse delimited substring 'SKU:QTY:PRICE'; map each element to object {'item_sku', 'quantity', 'unit_price'}.",
    confidenceThreshold: 0.89,
  },
];

let localTraces: HealTrace[] = [];
let localTasks: WorkflowTask[] = [];

export async function fetchSystemStatus(): Promise<SystemStatus> {
  try {
    const res = await fetch("/api/synapse/status", { cache: "no-store" });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Return fallback state
  }
  return MOCK_STATUS;
}

export async function injectChaos(params: {
  scenarioId?: number;
  format?: string;
  errorType?: string;
  customPayload?: string;
}): Promise<HealTrace> {
  try {
    const res = await fetch("/api/synapse/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      localTraces.unshift(data);
      if (data.decisionBranch === "HUMAN_WORKFLOW") {
        localTasks.unshift({
          payloadId: data.payloadId,
          patternId: data.matchedPatternId,
          timestamp: data.timestamp,
          sourceSystem: data.sourceSystem,
          format: data.format,
          confidenceScore: data.confidenceScore,
          riskLevel: data.riskLevel,
          workflowStatus: "PENDING_APPROVAL",
          reasoning: data.agentReasoning,
          rawPayload: data.rawPayload,
          healedPayload: data.healedPayload,
        });
      }
      return data;
    }
  } catch (err) {
    // Fallback simulation
  }

  // Local simulated fallback
  const sc = CANONICAL_SCENARIOS.find((s) => s.id === params.scenarioId) || CANONICAL_SCENARIOS[0];
  const now = new Date().toISOString();
  const pid = `SYN-${sc.format}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const trace: HealTrace = {
    payloadId: pid,
    timestamp: now,
    sourceSystem: sc.format === "HL7" ? "Epic_ADT_Gateway" : "Shopify_Medical_Webhook",
    format: sc.format as any,
    validationError: sc.desc,
    rawPayload: sc.format === "HL7" 
      ? `MSH|^~\\&|Epic|HOSP|Synapse|Core|20260501||ADT^A01|001|P|2.5.1\rPV1|1|I|W402\rPID|1||12345^^^MRN||DOE^JANE||1985-02-31|F\r`
      : `{\n  "quantity": "12",\n  "unit_price": "$149.99",\n  "is_urgent": "true"\n}`,
    healedPayload: sc.format === "HL7"
      ? `MSH|^~\\&|Epic|HOSP|Synapse|Core|20260501||ADT^A01|001|P|2.5.1\rPID|1||12345^^^MRN||DOE^JANE||19850228|F\rPV1|1|I|W402\r`
      : `{\n  "quantity": 12,\n  "unit_price": 149.99,\n  "is_urgent": true\n}`,
    decisionBranch: sc.risk === "MEDIUM_HIGH" ? "HUMAN_WORKFLOW" : "AUTO_HEAL",
    confidenceScore: sc.risk === "MEDIUM_HIGH" ? 0.74 : 0.96,
    riskLevel: sc.risk as any,
    matchedPatternId: sc.errorType,
    agentReasoning: `Identified canonical pattern ${sc.errorType}. Applied deterministic schema transformation. ${sc.risk === 'MEDIUM_HIGH' ? 'Escalated to human review due to clinical date ambiguity.' : 'Auto-healed and queued for immediate delivery.'}`,
    toolTrace: [
      { step: 1, tool: "SearchRunbookRAG", input: { error: sc.errorType }, output: { similarity: 0.95 }, durationMs: 44 },
      { step: 2, tool: "ValidateRepairedPayload", input: { format: sc.format }, output: { valid: true }, durationMs: 56 },
      { step: 3, tool: "CalculateRiskScore", input: { patternId: sc.errorType }, output: { risk: sc.risk }, durationMs: 32 },
    ],
    promptTokens: 485,
    completionTokens: 180,
    estimatedCostUSD: 0.000185,
    latencyMs: 148,
    executionMode: "replay",
    workflowStatus: sc.risk === "MEDIUM_HIGH" ? "PENDING_APPROVAL" : "NONE",
  };

  localTraces.unshift(trace);
  if (trace.decisionBranch === "HUMAN_WORKFLOW") {
    localTasks.unshift({
      payloadId: trace.payloadId,
      patternId: trace.matchedPatternId,
      timestamp: trace.timestamp,
      sourceSystem: trace.sourceSystem,
      format: trace.format,
      confidenceScore: trace.confidenceScore,
      riskLevel: trace.riskLevel,
      workflowStatus: "PENDING_APPROVAL",
      reasoning: trace.agentReasoning,
      rawPayload: trace.rawPayload,
      healedPayload: trace.healedPayload,
    });
  }

  return trace;
}

export async function fetchTraces(): Promise<HealTrace[]> {
  try {
    const res = await fetch("/api/synapse/traces", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (err) {}
  return localTraces;
}

export async function fetchRunbooks(): Promise<Runbook[]> {
  try {
    const res = await fetch("/api/synapse/runbooks", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (err) {}
  return MOCK_RUNBOOKS;
}

export async function fetchWorkflowQueue(): Promise<WorkflowTask[]> {
  try {
    const res = await fetch("/api/synapse/workflow", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (err) {}
  return localTasks;
}

export async function resolveWorkflowTask(
  payloadId: string,
  action: "APPROVE" | "REJECT",
  reviewerNotes: string = ""
): Promise<boolean> {
  try {
    const res = await fetch("/api/synapse/workflow/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payloadId, action, reviewerNotes }),
    });
    if (res.ok) {
      const data = await res.json();
      return !!data.ok;
    }
  } catch (err) {}

  // Local state resolution
  const task = localTasks.find((t) => t.payloadId === payloadId);
  if (task) {
    task.workflowStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
    task.operatorNotes = reviewerNotes;
  }
  const trace = localTraces.find((t) => t.payloadId === payloadId);
  if (trace) {
    trace.workflowStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
  }
  return true;
}
