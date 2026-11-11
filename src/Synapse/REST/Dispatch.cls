/// Synapse.REST.Dispatch
/// REST Dispatch Handler for SynapseHealer.
/// Exposes endpoints under /api/synapse for telemetry monitoring, chaos injection,
/// workflow task approvals, and RAG runbook inspection.
Class Synapse.REST.Dispatch Extends %CSP.REST [ ProcedureBlock ]
{

Parameter HandleCorsRequest = 1;

Parameter CONTENTTYPE = "application/json";

Parameter CHARSET = "utf-8";

XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
    <Route Url="/status" Method="GET" Call="GetSystemStatus" />
    <Route Url="/inject" Method="POST" Call="InjectChaos" />
    <Route Url="/traces" Method="GET" Call="GetTraces" />
    <Route Url="/runbooks" Method="GET" Call="GetRunbooks" />
    <Route Url="/workflow" Method="GET" Call="GetWorkflowQueue" />
    <Route Url="/workflow/tasks" Method="GET" Call="GetWorkflowQueue" />
    <Route Url="/workflow/resolve" Method="POST" Call="ResolveWorkflowTask" />
</Routes>
}

/// GET /api/synapse/status
/// Returns overall system state, active execution mode, production health, and aggregate metrics.
ClassMethod GetSystemStatus() As %Status
{
    Set %response.ContentType = "application/json"
    Set out = {}

    Set mode = $System.Util.GetEnviron("SYNAPSE_MODE")
    If mode = "" Set mode = "replay"
    Set out.mode = mode

    Do ##class(Synapse.Config.AIHubSetup).GetProviderConfig(.provider, .apiKey, .model, .baseURL)
    Set out.llmProvider = provider
    Set out.llmModel = model
    Set out.hasApiKey = (apiKey '= "")
    Set out.productionRunning = ##class(Ens.Director).IsProductionRunning()

    // Count seeded runbooks
    Set runbookCount = 0
    &sql(SELECT COUNT(*) INTO :runbookCount FROM Synapse_RAG.HealingRunbook)
    Set out.runbookCount = +runbookCount

    // Aggregate telemetry metrics
    Set totalProcessed = 0
    Set autoHealedCount = 0
    Set workflowPendingCount = 0
    Set quarantinedCount = 0
    Set totalTokens = 0
    Set totalCostUSD = 0.0
    Set avgLatencyMs = 0

    &sql(SELECT 
            COUNT(*),
            SUM(CASE WHEN DecisionBranch = 'AUTO_HEAL' THEN 1 ELSE 0 END),
            SUM(CASE WHEN DecisionBranch = 'HUMAN_WORKFLOW' AND WorkflowStatus = 'PENDING_APPROVAL' THEN 1 ELSE 0 END),
            SUM(CASE WHEN DecisionBranch = 'QUARANTINE' THEN 1 ELSE 0 END),
            SUM(PromptTokens + CompletionTokens),
            SUM(EstimatedCostUSD),
            AVG(LatencyMs)
         INTO :totalProcessed, :autoHealedCount, :workflowPendingCount, :quarantinedCount, :totalTokens, :totalCostUSD, :avgLatencyMs
         FROM Synapse_Data.AuditTelemetry)

    Set out.totalProcessed = +totalProcessed
    Set out.autoHealedCount = +autoHealedCount
    Set out.workflowPendingCount = +workflowPendingCount
    Set out.quarantinedCount = +quarantinedCount
    Set out.totalTokens = +totalTokens
    Set out.estimatedCostUSD = +$Number(totalCostUSD, 6)
    Set out.avgLatencyMs = +$Piece(avgLatencyMs, ".")

    If out.totalProcessed > 0 {
        Set out.autoHealRate = +$Number((out.autoHealedCount / out.totalProcessed) * 100, 1)
    } Else {
        Set out.autoHealRate = 100.0
    }

    Write out.%ToJSON()
    Quit $$$OK
}

/// POST /api/synapse/inject
/// Ingests a synthetic or custom malformed payload and returns the full healing decision immediately.
ClassMethod InjectChaos() As %Status
{
    Set %response.ContentType = "application/json"
    Set reqBody = %request.Content

    Set inputObj = {}
    If $IsObject(reqBody) {
        Set bodyStr = ""
        While 'reqBody.AtEnd {
            Set bodyStr = bodyStr _ reqBody.Read(8000)
        }
        If bodyStr '= "" Set inputObj = ##class(%DynamicObject).%FromJSON(bodyStr)
    }

    Set scenarioId = inputObj."scenarioId"
    Set fmt = inputObj."format"
    Set errType = inputObj."errorType"
    Set customPayload = inputObj."customPayload"

    // Map scenarioId (1..7) to canonical format and error type
    If scenarioId '= "" {
        Set scMap = {
            "1": {"format": "HL7", "error": "HL7_SWAPPED_FIELDS"},
            "2": {"format": "HL7", "error": "HL7_INVALID_DATE"},
            "3": {"format": "HL7", "error": "HL7_UNESCAPED_DELIMITER"},
            "4": {"format": "JSON", "error": "JSON_STRINGIFIED_NUMBERS"},
            "5": {"format": "JSON", "error": "JSON_KEY_MUTATION-V2"},
            "6": {"format": "JSON", "error": "JSON_TIMESTAMP_EPOCH_MILLIS"},
            "7": {"format": "JSON", "error": "JSON_CORRUPTED_NESTING"}
        }
        Set scItem = scMap.%Get(scenarioId)
        If $IsObject(scItem) {
            Set fmt = scItem.format
            Set errType = scItem.error
        }
    }

    // Build DeadLetterRequest
    If customPayload '= "" {
        Set req = ##class(Synapse.Msg.DeadLetterRequest).%New()
        Set req.PayloadId = "CUSTOM-" _ $Piece($ZTimestamp, ",", 2)
        Set req.Format = $Select(fmt'="":fmt, customPayload["MSH":"HL7", 1:"JSON")
        Set req.SourceSystem = "REST_Client"
        Set req.ValidationError = $Select(errType'="":errType, 1:"Custom payload injection via REST API")
        Set req.Timestamp = $ZDateTime($Horolog, 3)
        Do req.SetPayloadFromString(customPayload)
    } Else {
        If fmt = "" Set fmt = "JSON"
        If errType = "" Set errType = "AUTO"
        Set req = ##class(Synapse.Adapter.DeadLetterInbound).CreateDeadLetterFromChaos(fmt, errType)
    }

    If '$IsObject(req) {
        Set err = {"ok": false, "error": "Failed to create dead-letter request"}
        Write err.%ToJSON()
        Return $$$OK
    }

    // Execute through Business Process Triage Arbitrator
    Set sc = ##class(Synapse.Process.DeadLetterHealerBP).ProcessDeadLetter(req, .resp)

    If $$$ISERR(sc) || '$IsObject(resp) {
        Set err = {"ok": false, "error": ($System.Status.GetErrorText(sc))}
        Write err.%ToJSON()
        Return $$$OK
    }

    // Retrieve tool trace as JSON array
    Set traceArray = []
    If resp.ToolTraceJSON '= "" {
        Try {
            Set traceArray = ##class(%DynamicArray).%FromJSON(resp.ToolTraceJSON)
        } Catch ex {}
    }

    Set result = {}
    Set result.ok = 1
    Set result.payloadId = resp.PayloadId
    Set result.format = req.Format
    Set result.sourceSystem = req.SourceSystem
    Set result.validationError = req.ValidationError
    Set result.rawPayload = req.GetPayloadAsString()
    Set result.healedPayload = resp.GetHealedAsString()
    Set result.decisionBranch = resp.DecisionBranch
    Set result.confidenceScore = resp.ConfidenceScore
    Set result.riskLevel = resp.RiskLevel
    Set result.matchedPatternId = resp.MatchedPatternId
    Set result.agentReasoning = resp.AgentReasoning
    Set result.toolTrace = traceArray
    Set result.promptTokens = resp.PromptTokens
    Set result.completionTokens = resp.CompletionTokens
    Set result.estimatedCostUSD = resp.EstimatedCostUSD
    Set result.latencyMs = resp.LatencyMs
    Set result.executionMode = resp.ExecutionMode
    Set result.timestamp = $ZDateTime($Horolog, 3)

    // HUMAN_WORKFLOW: also send the escalation through the production so a real
    // InterSystems Workflow task is created for the SynapseReviewers role (best effort)
    Set result.workflowTaskQueued = 0
    If resp.DecisionBranch = "HUMAN_WORKFLOW" {
        Do ##class(Synapse.Service.WorkflowDispatchService).Dispatch(resp, .queued)
        Set result.workflowTaskQueued = +$Get(queued)
    }

    Write result.%ToJSON()
    Quit $$$OK
}

/// GET /api/synapse/traces
/// Returns recent audit telemetry traces ordered newest to oldest.
ClassMethod GetTraces() As %Status
{
    Set %response.ContentType = "application/json"
    Set list = []

    Set stmt = ##class(%SQL.Statement).%New()
    Set sql = "SELECT TOP 50 PayloadId, Timestamp, SourceSystem, Format, " _
              "RawPayloadSummary, HealedPayloadSummary, MatchedPatternId, " _
              "DecisionBranch, ConfidenceScore, RiskLevel, ToolTraceJSON, " _
              "PromptTokens, CompletionTokens, EstimatedCostUSD, LatencyMs, " _
              "FinalRoute, WorkflowStatus, ExecutionMode " _
              "FROM Synapse_Data.AuditTelemetry ORDER BY ID DESC"

    Set sc = stmt.%Prepare(sql)
    If $$$ISOK(sc) {
        Set rs = stmt.%Execute()
        While rs.%Next() {
            Set row = {}
            Set row.payloadId = rs.%Get("PayloadId")
            Set row.timestamp = rs.%Get("Timestamp")
            Set row.sourceSystem = rs.%Get("SourceSystem")
            Set row.format = rs.%Get("Format")

            // Prefer full payload from global if present, otherwise summary
            Set fullRaw = $Get(^Synapse.DLQ("payload", row.payloadId))
            Set row.rawPayload = $Select(fullRaw'="":fullRaw, 1:rs.%Get("RawPayloadSummary"))

            Set fullHealed = $Get(^Synapse.Delivered("payload", row.payloadId))
            If fullHealed = "" Set fullHealed = $Get(^Synapse.WorkflowQueue("healed", row.payloadId))
            If fullHealed = "" Set fullHealed = $Get(^Synapse.Quarantine("payload", row.payloadId))
            Set row.healedPayload = $Select(fullHealed'="":fullHealed, 1:rs.%Get("HealedPayloadSummary"))

            Set row.matchedPatternId = rs.%Get("MatchedPatternId")
            Set row.decisionBranch = rs.%Get("DecisionBranch")
            Set row.confidenceScore = +rs.%Get("ConfidenceScore")
            Set row.riskLevel = rs.%Get("RiskLevel")

            Set traceStr = rs.%Get("ToolTraceJSON")
            Set row.toolTrace = []
            If traceStr '= "" {
                Try { Set row.toolTrace = ##class(%DynamicArray).%FromJSON(traceStr) } Catch ex {}
            }

            Set row.promptTokens = +rs.%Get("PromptTokens")
            Set row.completionTokens = +rs.%Get("CompletionTokens")
            Set row.estimatedCostUSD = +rs.%Get("EstimatedCostUSD")
            Set row.latencyMs = +rs.%Get("LatencyMs")
            Set row.finalRoute = rs.%Get("FinalRoute")
            Set row.workflowStatus = rs.%Get("WorkflowStatus")
            Set row.executionMode = rs.%Get("ExecutionMode")

            Do list.%Push(row)
        }
    }

    Write list.%ToJSON()
    Quit $$$OK
}

/// GET /api/synapse/runbooks
/// Returns the vector-indexed healing runbooks from Synapse_RAG.HealingRunbook.
ClassMethod GetRunbooks() As %Status
{
    Set %response.ContentType = "application/json"
    Set list = []

    Set stmt = ##class(%SQL.Statement).%New()
    Set sql = "SELECT PatternId, ErrorSignature, Format, VendorSource, RootCause, " _
              "RepairStrategy, RepairRule, ConfidenceThreshold " _
              "FROM Synapse_RAG.HealingRunbook ORDER BY ID ASC"

    Set sc = stmt.%Prepare(sql)
    If $$$ISOK(sc) {
        Set rs = stmt.%Execute()
        While rs.%Next() {
            Set rb = {}
            Set rb.patternId = rs.%Get("PatternId")
            Set rb.errorSignature = rs.%Get("ErrorSignature")
            Set rb.format = rs.%Get("Format")
            Set rb.vendorSource = rs.%Get("VendorSource")
            Set rb.rootCause = rs.%Get("RootCause")
            Set rb.repairStrategy = rs.%Get("RepairStrategy")
            Set rb.repairRule = rs.%Get("RepairRule")
            Set rb.confidenceThreshold = +rs.%Get("ConfidenceThreshold")
            Do list.%Push(rb)
        }
    }

    Write list.%ToJSON()
    Quit $$$OK
}

/// GET /api/synapse/workflow AND /api/synapse/workflow/tasks
/// Returns pending human review tasks requiring operator approval.
ClassMethod GetWorkflowQueue() As %Status
{
    Set %response.ContentType = "application/json"
    Set list = []

    Set stmt = ##class(%SQL.Statement).%New()
    Set sql = "SELECT PayloadId, Timestamp, SourceSystem, Format, " _
              "RawPayloadSummary, HealedPayloadSummary, MatchedPatternId, " _
              "ConfidenceScore, RiskLevel, WorkflowStatus " _
              "FROM Synapse_Data.AuditTelemetry " _
              "WHERE DecisionBranch = 'HUMAN_WORKFLOW' " _
              "ORDER BY ID DESC"

    Set sc = stmt.%Prepare(sql)
    If $$$ISOK(sc) {
        Set rs = stmt.%Execute()
        While rs.%Next() {
            Set task = {}
            Set task.payloadId = rs.%Get("PayloadId")
            Set task.timestamp = rs.%Get("Timestamp")
            Set task.sourceSystem = rs.%Get("SourceSystem")
            Set task.format = rs.%Get("Format")
            Set task.matchedPatternId = rs.%Get("MatchedPatternId")
            Set task.confidenceScore = +rs.%Get("ConfidenceScore")
            Set task.riskLevel = rs.%Get("RiskLevel")
            Set task.workflowStatus = rs.%Get("WorkflowStatus")

            Set fullRaw = $Get(^Synapse.DLQ("payload", task.payloadId))
            Set task.rawPayload = $Select(fullRaw'="":fullRaw, 1:rs.%Get("RawPayloadSummary"))

            Set fullHealed = $Get(^Synapse.WorkflowQueue("healed", task.payloadId))
            If fullHealed = "" Set fullHealed = rs.%Get("HealedPayloadSummary")
            Set task.healedPayload = fullHealed

            Set task.reasoning = $Get(^Synapse.WorkflowQueue("reasoning", task.payloadId))
            Set task.operatorNotes = $Get(^Synapse.WorkflowQueue("notes", task.payloadId))

            Do list.%Push(task)
        }
    }

    Write list.%ToJSON()
    Quit $$$OK
}

/// POST /api/synapse/workflow/resolve
/// Approves or rejects a pending human workflow task.
ClassMethod ResolveWorkflowTask() As %Status
{
    Set %response.ContentType = "application/json"
    Set reqBody = %request.Content

    Set inputObj = {}
    If $IsObject(reqBody) {
        Set bodyStr = ""
        While 'reqBody.AtEnd {
            Set bodyStr = bodyStr _ reqBody.Read(8000)
        }
        If bodyStr '= "" Set inputObj = ##class(%DynamicObject).%FromJSON(bodyStr)
    }

    Set payloadId = inputObj."payloadId"
    Set action = $ZConvert(inputObj."action", "U")
    Set notes = inputObj."reviewerNotes"

    If payloadId = "" {
        Set err = {"ok": false, "error": "Missing payloadId parameter"}
        Write err.%ToJSON()
        Return $$$OK
    }

    If action = "APPROVE" {
        Set sc = ##class(Synapse.Operation.WorkflowEscalationOp).Approve(payloadId, notes)
    } ElseIf action = "REJECT" {
        Set sc = ##class(Synapse.Operation.WorkflowEscalationOp).Reject(payloadId, notes)
    } Else {
        Set sc = $$$ERROR($$$GeneralError, "Invalid action '" _ action _ "'; expected 'APPROVE' or 'REJECT'")
    }

    Set res = {}
    If $$$ISOK(sc) {
        Set res.ok = 1
        Set res.payloadId = payloadId
        Set res.action = action
        Set res.status = $Select(action="APPROVE":"APPROVED", 1:"REJECTED")
        // Report the stored status (a task resolved earlier keeps its first decision)
        Set stored = $ListGet($Get(^Synapse.WorkflowQueue("tasks", payloadId)), 5)
        If (stored = "APPROVED") || (stored = "REJECTED") Set res.status = stored
        // Close the matching task in the IRIS Workflow inbox as well (best effort)
        Do ##class(Synapse.Operation.WorkflowEscalationOp).CloseEngineTask(payloadId, $Select(res.status="APPROVED":"Approve", 1:"Reject"))
        Set res.message = "Workflow task successfully resolved with action: " _ action
    } Else {
        Set res.ok = 0
        Set res.error = $System.Status.GetErrorText(sc)
    }

    Write res.%ToJSON()
    Quit $$$OK
}

}
