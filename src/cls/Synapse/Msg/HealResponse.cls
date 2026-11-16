/// Synapse.Msg.HealResponse
/// Output response message emitted by SynapseHealer AI Agent and Interoperability Business Process.
/// Contains the healed payload, the autonomous routing decision (AUTO_HEAL, HUMAN_WORKFLOW, QUARANTINE),
/// confidence and risk scores, tool execution traces, and token/cost telemetry.
Class Synapse.Msg.HealResponse Extends Ens.Response [ ProcedureBlock ]
{

/// Payload identifier matching Synapse.Msg.DeadLetterRequest
Property PayloadId As %String(MAXLEN = 100) [ Required ];

/// Routing decision: AUTO_HEAL (direct resubmit), HUMAN_WORKFLOW (escalate to human), QUARANTINE (isolate)
Property DecisionBranch As %String(VALUELIST = ",AUTO_HEAL,HUMAN_WORKFLOW,QUARANTINE") [ InitialExpression = "AUTO_HEAL" ];

/// Healed, schema-compliant payload stream ready for downstream delivery
Property HealedPayload As %Stream.GlobalCharacter;

/// Agent / RAG confidence score between 0.00 and 1.00
Property ConfidenceScore As %Double [ InitialExpression = 0.0 ];

/// Assessed clinical / operational risk: LOW, MEDIUM_HIGH, or CRITICAL
Property RiskLevel As %String(VALUELIST = ",LOW,MEDIUM_HIGH,CRITICAL") [ InitialExpression = "LOW" ];

/// Matched canonical pattern ID from Synapse_RAG.HealingRunbook
Property MatchedPatternId As %String(MAXLEN = 50);

/// Narrative reasoning explaining the root cause and applied transformation
Property AgentReasoning As %String(MAXLEN = 4000);

/// JSON array containing step-by-step tool invocation traces for governance audit
Property ToolTraceJSON As %String(MAXLEN = 8000);

/// LLM Prompt tokens consumed
Property PromptTokens As %Integer [ InitialExpression = 0 ];

/// LLM Completion tokens generated
Property CompletionTokens As %Integer [ InitialExpression = 0 ];

/// Estimated USD inference cost based on token counts
Property EstimatedCostUSD As %Double [ InitialExpression = 0.0 ];

/// Processing latency in milliseconds
Property LatencyMs As %Integer [ InitialExpression = 0 ];

/// Execution mode: "replay" (zero-API-key deterministic simulation) or "live" (LLM invocation)
Property ExecutionMode As %String(VALUELIST = ",replay,live") [ InitialExpression = "replay" ];

/// Quick helper to set healed payload from a string
Method SetHealedFromString(pContent As %String) As %Status
{
    Do ..HealedPayload.Clear()
    Do ..HealedPayload.Write(pContent)
    Quit $$$OK
}

/// Quick helper to read healed payload as string
Method GetHealedAsString() As %String
{
    If '$IsObject(..HealedPayload) Quit ""
    Do ..HealedPayload.Rewind()
    Quit ..HealedPayload.Read(32000)
}

}
