/// Synapse.Agent.DeadLetterHealerAgent
/// Autonomous AI Hub Decision Agent for Dead-Letter & Schema Healing.
/// Employs RAG runbook retrieval, payload syntax verification, and clinical/financial risk assessment
/// to heal malformed interoperability messages or route to human review.
Class Synapse.Agent.DeadLetterHealerAgent Extends %AI.Agent [ ProcedureBlock ]
{

/// Default LLM Model (overridden by LLM_MODEL environment setting)
Parameter MODEL = "gemini-1.5-flash";

/// ToolSet containing governed RAG lookup, validation, and risk calculation tools
Parameter TOOLSETS = "Synapse.Agent.HealerToolSet";

/// System prompt establishing clinical-grade guardrails and deterministic healing steps
XData INSTRUCTIONS [ MimeType = "text/markdown" ]
{
# SynapseHealer Autonomous Schema & Dead-Letter Healing Agent

You are SynapseHealer, an expert AI agent in InterSystems IRIS Interoperability workflows.
Your objective is to heal quarantined, rejected, or malformed HL7 v2 and JSON dead-letter payloads.

## Protocol:
1. **Search Runbook RAG**: Call `SearchRunbookRAG` using the validation error message and format to retrieve relevant repair runbooks.
2. **Apply Structural Fix**: Apply the deterministic transformation defined in the runbook.
3. **Verify Payload**: Call `ValidateRepairedPayload` to guarantee 100% syntactical and schema compliance.
4. **Evaluate Risk**: Call `CalculateRiskScore` to classify clinical and financial risk:
   - **LOW Risk & High Confidence (>= 0.85)** -> `AUTO_HEAL` (automatic resubmission)
   - **MEDIUM_HIGH Risk or Ambiguous/Clinical Field (Confidence 0.50-0.84)** -> `HUMAN_WORKFLOW` (escalate to clinician/operator)
   - **CRITICAL Risk or Malicious/Unparseable (Confidence < 0.50)** -> `QUARANTINE` (isolate in vault)

## Response Contract:
Always output a single valid JSON document containing:
```json
{
  "decisionBranch": "AUTO_HEAL" | "HUMAN_WORKFLOW" | "QUARANTINE",
  "confidenceScore": 0.95,
  "riskLevel": "LOW" | "MEDIUM_HIGH" | "CRITICAL",
  "matchedPatternId": "PATTERN-ID",
  "healedPayload": "...",
  "reasoning": "Concise justification of diagnosis and repair"
}
```
}

/// Initializes model provider and secure credentials on instantiation
Method %OnInit() As %Status
{
    Set tSC = $$$OK

    Try {
        If $IsObject(..Provider) Return $$$OK

        // Retrieve configured provider settings from Synapse.Config.AIHubSetup
        Do ##class(Synapse.Config.AIHubSetup).GetProviderConfig(.provider, .apiKey, .model, .baseURL)
        Set settings = ##class(Synapse.Config.AIHubSetup).BuildProviderSettings()

        If ##class(%Dictionary.CompiledClass).%ExistsId("%AI.Provider") {
            Set ..Provider = ##class(%AI.Provider).Create(provider, settings)
        }
        If model '= "" Set ..Model = model
    } Catch ex {
        Set tSC = ex.AsStatus()
    }

    Quit tSC
}

}
