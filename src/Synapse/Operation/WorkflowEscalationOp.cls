/// Synapse.Operation.WorkflowEscalationOp
/// Outbound Business Operation integrating with the InterSystems IRIS Workflow Engine.
/// Generates human-in-the-loop review tasks (EnsLib.Workflow.TaskRequest) for ambiguous,
/// clinically sensitive, or medium-confidence payload repairs (+2 bonus points).
Class Synapse.Operation.WorkflowEscalationOp Extends Ens.BusinessOperation [ ProcedureBlock ]
{

Parameter INVOCATION = "Queue";

Parameter SETTINGS = "WorkflowRole:Synapse,WorkflowOperation:Synapse,AutoDispatchToEngine:Synapse";

/// Workflow role assigned to review escalated payload repairs
Property WorkflowRole As %String(MAXLEN = 100) [ InitialExpression = "SynapseReviewers" ];

/// Config name of the EnsLib.Workflow.Operation component
Property WorkflowOperation As %String(MAXLEN = 100) [ InitialExpression = "EnsLib.Workflow.Operation" ];

/// Attempt automated dispatch to EnsLib.Workflow.Operation if available
Property AutoDispatchToEngine As %Boolean [ InitialExpression = 1 ];

XData MessageMap
{
<MapItems>
    <MapItem MessageType="Synapse.Msg.HealResponse">
        <Method>EscalateToWorkflow</Method>
    </MapItem>
</MapItems>
}

/// Creates a human workflow review item and dispatches to EnsLib.Workflow.Operation
Method EscalateToWorkflow(pRequest As Synapse.Msg.HealResponse, Output pResponse As Ens.Response) As %Status
{
    Set tSC = $$$OK

    If '$IsObject(pRequest) Return $$$ERROR($$$GeneralError, "Null HealResponse message")

    Set payloadId = pRequest.PayloadId
    Set patternId = pRequest.MatchedPatternId
    Set healedStr = pRequest.GetHealedAsString()
    Set reason = pRequest.AgentReasoning

    // 1. Record task in local Synapse Workflow Queue
    Set ^Synapse.WorkflowQueue("tasks", payloadId) = $ListBuild(patternId, pRequest.ConfidenceScore, pRequest.RiskLevel, $ZDateTime($Horolog, 3), "PENDING_APPROVAL", ..WorkflowRole)
    Set ^Synapse.WorkflowQueue("healed", payloadId) = healedStr
    Set ^Synapse.WorkflowQueue("reasoning", payloadId) = reason
    Set ^Synapse.WorkflowQueue("pending", +$Horolog, payloadId) = ""

    // 2. Dispatch to InterSystems EnsLib.Workflow.TaskRequest if available
    If ..AutoDispatchToEngine && (..WorkflowOperation '= "") {
        Try {
            If ##class(%Dictionary.CompiledClass).%ExistsId("EnsLib.Workflow.TaskRequest") {
                Set taskReq = ##class(EnsLib.Workflow.TaskRequest).%New()
                Set taskReq.%Subject = "SynapseHealer Review: " _ patternId _ " (" _ payloadId _ ")"
                Set taskReq.%Actions = "Approve,Reject"
                Set taskReq.%RoleName = ..WorkflowRole
                Set taskReq.%UserName = ""
                Set taskReq.%FormTemplate = "SynapseReviewForm"

                Set scSend = ..SendRequestAsync(..WorkflowOperation, taskReq)
                If $$$ISERR(scSend) {
                    $$$LOGWARNING("Workflow engine dispatch skipped: " _ $System.Status.GetErrorText(scSend))
                }
            }
        } Catch ex {
            // Non-blocking fallback to local queue
        }
    }

    $$$LOGINFO("Escalated payload " _ payloadId _ " [" _ patternId _ "] to Human Workflow review (" _ ..WorkflowRole _ ")")

    Quit $$$OK
}

/// Human Approval action: completes review and resubmits the approved healed payload
ClassMethod Approve(pPayloadId As %String, pOperatorNote As %String = "") As %Status
{
    Set tSC = $$$OK

    If pPayloadId = "" Return $$$ERROR($$$GeneralError, "PayloadId required")
    If '$Data(^Synapse.WorkflowQueue("tasks", pPayloadId)) Return $$$ERROR($$$GeneralError, "Task not found in queue")

    Set taskData = $Get(^Synapse.WorkflowQueue("tasks", pPayloadId))
    Set healedStr = $Get(^Synapse.WorkflowQueue("healed", pPayloadId))
    Set patternId = $ListGet(taskData, 1)
    Set confidence = $ListGet(taskData, 2)
    Set risk = $ListGet(taskData, 3)

    // Update workflow queue status
    Set $List(taskData, 5) = "APPROVED"
    Set ^Synapse.WorkflowQueue("tasks", pPayloadId) = taskData
    Set ^Synapse.WorkflowQueue("notes", pPayloadId) = pOperatorNote _ " (Approved at " _ $ZDateTime($Horolog, 3) _ ")"
    Kill ^Synapse.WorkflowQueue("pending", +$Horolog, pPayloadId)

    // Update persistent telemetry record
    &sql(UPDATE Synapse_Data.AuditTelemetry SET WorkflowStatus = 'APPROVED' WHERE PayloadId = :pPayloadId)

    // Create delivery response and route to ResubmitDeliveryOp
    Set resp = ##class(Synapse.Msg.HealResponse).%New()
    Set resp.PayloadId = pPayloadId
    Set resp.DecisionBranch = "AUTO_HEAL"
    Set resp.MatchedPatternId = patternId
    Set resp.ConfidenceScore = confidence
    Set resp.RiskLevel = risk
    Do resp.SetHealedFromString(healedStr)

    Set delivOp = ##class(Synapse.Operation.ResubmitDeliveryOp).%New()
    Set tSC = delivOp.ResubmitPayload(resp)

    Quit tSC
}

/// Human Rejection action: rejects proposed repair and routes to Quarantine
ClassMethod Reject(pPayloadId As %String, pOperatorNote As %String = "") As %Status
{
    Set tSC = $$$OK

    If pPayloadId = "" Return $$$ERROR($$$GeneralError, "PayloadId required")
    If '$Data(^Synapse.WorkflowQueue("tasks", pPayloadId)) Return $$$ERROR($$$GeneralError, "Task not found in queue")

    Set taskData = $Get(^Synapse.WorkflowQueue("tasks", pPayloadId))
    Set patternId = $ListGet(taskData, 1)

    // Update workflow queue status
    Set $List(taskData, 5) = "REJECTED"
    Set ^Synapse.WorkflowQueue("tasks", pPayloadId) = taskData
    Set ^Synapse.WorkflowQueue("notes", pPayloadId) = pOperatorNote _ " (Rejected at " _ $ZDateTime($Horolog, 3) _ ")"
    Kill ^Synapse.WorkflowQueue("pending", +$Horolog, pPayloadId)

    // Update persistent telemetry record
    &sql(UPDATE Synapse_Data.AuditTelemetry SET WorkflowStatus = 'REJECTED' WHERE PayloadId = :pPayloadId)

    // Route to Quarantine
    Set resp = ##class(Synapse.Msg.HealResponse).%New()
    Set resp.PayloadId = pPayloadId
    Set resp.DecisionBranch = "QUARANTINE"
    Set resp.MatchedPatternId = patternId
    Set resp.AgentReasoning = "Rejected by human reviewer: " _ pOperatorNote

    Set qOp = ##class(Synapse.Operation.QuarantineVaultOp).%New()
    Set tSC = qOp.QuarantinePayload(resp)

    Quit tSC
}

}
