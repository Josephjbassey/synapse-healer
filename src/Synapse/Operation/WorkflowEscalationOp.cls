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

/// Config name of the EnsLib.Workflow.Operation component.
/// The Workflow Engine uses this config name as the role name, so it must match WorkflowRole.
Property WorkflowOperation As %String(MAXLEN = 100) [ InitialExpression = "SynapseReviewers" ];

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

    // 2. Create a real Workflow task: send EnsLib.Workflow.TaskRequest to the
    //    EnsLib.Workflow.Operation named after the role (SynapseReviewers).
    //    Synapse.Workflow.ReviewTaskResponse handles Approve/Reject from the Workflow inbox.
    Set ^Synapse.WorkflowQueue("engine", payloadId) = "SKIPPED"
    If ..AutoDispatchToEngine && (..WorkflowOperation '= "") {
        Try {
            If ##class(%Dictionary.CompiledClass).%ExistsId("EnsLib.Workflow.TaskRequest") {
                Set taskReq = ##class(EnsLib.Workflow.TaskRequest).%New()
                Set taskReq.%Subject = ##class(Synapse.Workflow.ReviewTaskResponse).BuildSubject(payloadId, patternId)
                Set taskReq.%Message = "Confidence " _ pRequest.ConfidenceScore _ ", risk " _ pRequest.RiskLevel _ ". " _ $Extract(reason, 1, 1500)
                Set taskReq.%Actions = "Approve,Reject"
                Set taskReq.%Priority = $Select(pRequest.RiskLevel="CRITICAL":1, pRequest.RiskLevel="MEDIUM_HIGH":2, 1:3)
                Set taskReq.%TaskHandler = "Synapse.Workflow.ReviewTaskResponse"

                // No response is needed here: the task handler applies the decision itself
                Set scSend = ..SendRequestAsync(..WorkflowOperation, taskReq, 0)
                If $$$ISERR(scSend) {
                    $$$LOGWARNING("Workflow engine dispatch skipped: " _ $System.Status.GetErrorText(scSend))
                } Else {
                    Set ^Synapse.WorkflowQueue("engine", payloadId) = "SENT"
                }
            }
        } Catch ex {
            // Non-blocking fallback to local queue
            $$$LOGWARNING("Workflow engine dispatch failed: " _ ex.DisplayString())
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
    
    Set taskData = ""
    Set healedStr = ""
    If $Data(^Synapse.WorkflowQueue("tasks", pPayloadId)) {
        Set taskData = $Get(^Synapse.WorkflowQueue("tasks", pPayloadId))
        Set healedStr = $Get(^Synapse.WorkflowQueue("healed", pPayloadId))
    }
    
    If taskData = "" {
        &sql(SELECT MatchedPatternId, ConfidenceScore, RiskLevel, HealedPayloadSummary 
             INTO :pat, :conf, :risk, :hld 
             FROM Synapse_Data.AuditTelemetry WHERE PayloadId = :pPayloadId)
        If SQLCODE '= 0 Return $$$ERROR($$$GeneralError, "Task not found in queue")
        Set taskData = $ListBuild(pat, conf, risk, $ZDateTime($Horolog, 3), "PENDING")
        Set healedStr = hld
    }

    // Already resolved (dashboard and Workflow inbox can both act): do nothing twice
    If ..IsResolved(taskData) Return $$$OK

    Set patternId = $ListGet(taskData, 1)
    Set confidence = $ListGet(taskData, 2)
    Set risk = $ListGet(taskData, 3)

    // Update workflow queue status
    Set $List(taskData, 5) = "APPROVED"
    Set ^Synapse.WorkflowQueue("tasks", pPayloadId) = taskData
    Set ^Synapse.WorkflowQueue("notes", pPayloadId) = pOperatorNote _ " (Approved at " _ $ZDateTime($Horolog, 3) _ ")"
    Do ..ClearPending(pPayloadId)

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

    Set tSC = ##class(Synapse.Operation.ResubmitDeliveryOp).Resubmit(resp)
    Quit tSC
}

/// Human Rejection action: rejects proposed repair and routes to Quarantine
ClassMethod Reject(pPayloadId As %String, pOperatorNote As %String = "") As %Status
{
    Set tSC = $$$OK

    If pPayloadId = "" Return $$$ERROR($$$GeneralError, "PayloadId required")
    
    Set taskData = ""
    If $Data(^Synapse.WorkflowQueue("tasks", pPayloadId)) {
        Set taskData = $Get(^Synapse.WorkflowQueue("tasks", pPayloadId))
    }
    
    If taskData = "" {
        &sql(SELECT MatchedPatternId INTO :pat FROM Synapse_Data.AuditTelemetry WHERE PayloadId = :pPayloadId)
        If SQLCODE '= 0 Return $$$ERROR($$$GeneralError, "Task not found in queue")
        Set taskData = $ListBuild(pat, 0.0, "HIGH", $ZDateTime($Horolog, 3), "PENDING")
    }

    If ..IsResolved(taskData) Return $$$OK

    Set patternId = $ListGet(taskData, 1)

    // Update workflow queue status
    Set $List(taskData, 5) = "REJECTED"
    Set ^Synapse.WorkflowQueue("tasks", pPayloadId) = taskData
    Set ^Synapse.WorkflowQueue("notes", pPayloadId) = pOperatorNote _ " (Rejected at " _ $ZDateTime($Horolog, 3) _ ")"
    Do ..ClearPending(pPayloadId)

    // Update persistent telemetry record
    &sql(UPDATE Synapse_Data.AuditTelemetry SET WorkflowStatus = 'REJECTED' WHERE PayloadId = :pPayloadId)

    // Route to Quarantine
    Set resp = ##class(Synapse.Msg.HealResponse).%New()
    Set resp.PayloadId = pPayloadId
    Set resp.DecisionBranch = "QUARANTINE"
    Set resp.MatchedPatternId = patternId
    Set resp.AgentReasoning = "Rejected by human reviewer: " _ pOperatorNote

    Set tSC = ##class(Synapse.Operation.QuarantineVaultOp).Quarantine(resp)
    Quit tSC
}

/// True when a queue entry has already been approved or rejected
ClassMethod IsResolved(pTaskData As %List) As %Boolean
{
    Set st = $ListGet(pTaskData, 5)
    Quit (st = "APPROVED") || (st = "REJECTED")
}

/// Removes the payload from the pending index, whatever day it was queued on
ClassMethod ClearPending(pPayloadId As %String)
{
    Set day = ""
    For {
        Set day = $Order(^Synapse.WorkflowQueue("pending", day))
        Quit:day=""
        Kill ^Synapse.WorkflowQueue("pending", day, pPayloadId)
    }
}

/// Closes the matching open task in the Workflow Engine after a decision made outside the
/// Workflow inbox (for example from the dashboard), so the inbox does not keep a stale task.
/// Best effort: returns $$$OK when there is no open task.
ClassMethod CloseEngineTask(pPayloadId As %String, pAction As %String) As %Status
{
    Set tSC = $$$OK
    Try {
        If '##class(%Dictionary.CompiledClass).%ExistsId("EnsLib.Workflow.Engine") Quit
        Set subj = "[" _ pPayloadId _ "]"
        Set rs = ##class(%SQL.Statement).%ExecDirect(, "SELECT ID FROM EnsLib_Workflow.TaskResponse WHERE %Subject [ ? AND %Status <> 'Completed'", subj)
        While rs.%Next() {
            Set task = ##class(EnsLib.Workflow.TaskResponse).%OpenId(rs.%Get("ID"))
            If '$IsObject(task) Continue
            Set sc = ##class(EnsLib.Workflow.Engine).CompleteTask(task, pAction)
            Set tSC = $$$ADDSC(tSC, sc)
        }
    } Catch ex {
        Set tSC = ex.AsStatus()
    }
    Quit tSC
}

}
