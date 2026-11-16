/// Synapse.Process.DeadLetterHealerBP
/// Core Business Process orchestrating the AI Agent and Deterministic Healing Pipeline.
/// Arbitrates between live AI Hub Agent reasoning and deterministic offline replay,
/// routing payloads to ResubmitDeliveryOp, WorkflowEscalationOp, or QuarantineVaultOp.
Class Synapse.Process.DeadLetterHealerBP Extends Ens.BusinessProcess [ ProcedureBlock ]
{

Parameter SETTINGS = "ExecutionMode:Synapse,AutoHealTarget:Synapse,WorkflowTarget:Synapse,QuarantineTarget:Synapse";

/// Execution mode: "auto" (detects env and keys), "replay" (deterministic simulation), or "live" (AI Hub)
Property ExecutionMode As %String(VALUELIST = ",auto,replay,live") [ InitialExpression = "auto" ];

/// Target Operation for auto-healed payloads
Property AutoHealTarget As %String(MAXLEN = 100) [ InitialExpression = "Synapse.Operation.ResubmitDeliveryOp" ];

/// Target Operation for human approval escalations
Property WorkflowTarget As %String(MAXLEN = 100) [ InitialExpression = "Synapse.Operation.WorkflowEscalationOp" ];

/// Target Operation for quarantined unresolvable payloads
Property QuarantineTarget As %String(MAXLEN = 100) [ InitialExpression = "Synapse.Operation.QuarantineVaultOp" ];

/// Main process handler receiving DeadLetterRequest from ChaosIngestService
Method OnRequest(pRequest As Synapse.Msg.DeadLetterRequest, Output pResponse As Synapse.Msg.HealResponse) As %Status
{
    Set sc = ..ProcessDeadLetter(pRequest, .pResponse, ..ExecutionMode)
    If $$$ISOK(sc) && $IsObject(pResponse) && (..%SessionId '= "") {
        Set targetOp = $Select(pResponse.DecisionBranch="HUMAN_WORKFLOW":..WorkflowTarget, pResponse.DecisionBranch="QUARANTINE":..QuarantineTarget, 1:..AutoHealTarget)
        If targetOp '= "" Do ..SendRequestAsync(targetOp, pResponse)
    }
    Quit sc
}

/// Static triage and healing arbitrator callable directly by REST API or unit tests
ClassMethod ProcessDeadLetter(pRequest As Synapse.Msg.DeadLetterRequest, Output pResponse As Synapse.Msg.HealResponse, pExecutionMode As %String = "auto") As %Status
{
    Set tSC = $$$OK

    If '$IsObject(pRequest) Return $$$ERROR($$$GeneralError, "Null DeadLetterRequest")

    Set pResponse = ##class(Synapse.Msg.HealResponse).%New()
    Set pResponse.PayloadId = pRequest.PayloadId

    // 1. Resolve effective execution mode
    Set effMode = pExecutionMode
    If effMode = "auto" {
        Set envMode = $System.Util.GetEnviron("SYNAPSE_MODE")
        Do ##class(Synapse.Config.AIHubSetup).GetProviderConfig(.prov, .key, .mdl, .url)
        If (envMode = "live") && (key '= "") {
            Set effMode = "live"
        } Else {
            Set effMode = "replay"
        }
    }

    // 2. Execute Healing (Live Agent or Deterministic Replay)
    Set executedLive = 0
    If effMode = "live" {
        Set scLive = ..ExecuteLiveAgentStatic(pRequest, .pResponse)
        If $$$ISOK(scLive) {
            Set executedLive = 1
        }
    }

    If 'executedLive {
        Set scReplay = ##class(Synapse.Data.AuditTelemetry).ExecuteDeterministicReplay(pRequest, .pResponse)
        If $$$ISERR(scReplay) Return scReplay
    }

    // 3. Determine Routing Branch & Target Operation
    Set branch = pResponse.DecisionBranch
    Set targetOp = "Synapse.Operation.ResubmitDeliveryOp"
    Set wfStatus = "NONE"

    If branch = "HUMAN_WORKFLOW" {
        Set targetOp = "Synapse.Operation.WorkflowEscalationOp"
        Set wfStatus = "PENDING_APPROVAL"
    } ElseIf branch = "QUARANTINE" {
        Set targetOp = "Synapse.Operation.QuarantineVaultOp"
    } Else {
        Set targetOp = "Synapse.Operation.ResubmitDeliveryOp"
    }

    // 4. Persist Audit Telemetry
    Do ##class(Synapse.Data.AuditTelemetry).RecordTelemetry(pRequest, pResponse, targetOp, wfStatus)

    Quit $$$OK
}

/// Invokes the live %AI.Agent inside IRIS AI Hub
ClassMethod ExecuteLiveAgentStatic(pRequest As Synapse.Msg.DeadLetterRequest, Output pResponse As Synapse.Msg.HealResponse) As %Status
{
    Set tSC = $$$OK

    Try {
        If '##class(%Dictionary.CompiledClass).%ExistsId("Synapse.Agent.DeadLetterHealerAgent") {
            Return $$$ERROR($$$GeneralError, "Agent class Synapse.Agent.DeadLetterHealerAgent not compiled")
        }

        Set agent = ##class(Synapse.Agent.DeadLetterHealerAgent).%New()
        Set scInit = agent.%Init()
        If $$$ISERR(scInit) Return scInit

        Set session = agent.CreateSession()
        Set prompt = "Analyze and heal the following dead-letter payload:" _ $Char(10) _
                     "Payload ID: " _ pRequest.PayloadId _ $Char(10) _
                     "Source System: " _ pRequest.SourceSystem _ $Char(10) _
                     "Format: " _ pRequest.Format _ $Char(10) _
                     "Validation Error: " _ pRequest.ValidationError _ $Char(10) _
                     "Raw Payload:" _ $Char(10) _ pRequest.GetPayloadAsString()

        Set startTime = $Piece($ZTimestamp, ",", 2)
        Set llmResp = agent.Chat(session, prompt)
        Set elapsedMs = $Piece(($Piece($ZTimestamp, ",", 2) - startTime) * 1000, ".")

        If '$IsObject(llmResp) Return $$$ERROR($$$GeneralError, "LLM returned empty response")

        Set content = llmResp.Content
        // Extract JSON block if surrounded by markdown code fences
        If content [ "```json" {
            Set content = $Piece($Piece(content, "```json", 2), "```", 1)
        } ElseIf content [ "```" {
            Set content = $Piece($Piece(content, "```", 2), "```", 1)
        }
        Set content = $ZStrip(content, "<>W")

        Set dyn = ##class(%DynamicObject).%FromJSON(content)
        Set pResponse.PayloadId = pRequest.PayloadId
        Set pResponse.DecisionBranch = dyn."decisionBranch"
        Set pResponse.ConfidenceScore = +dyn."confidenceScore"
        Set pResponse.RiskLevel = dyn."riskLevel"
        Set pResponse.MatchedPatternId = dyn."matchedPatternId"
        Set pResponse.AgentReasoning = dyn."reasoning"
        Do pResponse.SetHealedFromString(dyn."healedPayload")
        Set pResponse.ExecutionMode = "live"
        Set pResponse.LatencyMs = elapsedMs

        // Collect usage statistics from session
        Set stats = session.GetStats()
        If $IsObject(stats) {
            Set pResponse.PromptTokens = stats.%Get("total_prompt_tokens", 520)
            Set pResponse.CompletionTokens = stats.%Get("total_completion_tokens", 185)
            Set pResponse.EstimatedCostUSD = +$Number((pResponse.PromptTokens * 0.00000015) + (pResponse.CompletionTokens * 0.0000006), 6)
        }
    } Catch ex {
        Set tSC = ex.AsStatus()
    }

    Quit tSC
}

}
