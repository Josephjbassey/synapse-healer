/// Synapse.Workflow.ReviewTaskResponse
/// Task handler for SynapseHealer review tasks in the InterSystems Workflow Engine.
/// WorkflowEscalationOp sets %TaskHandler to this class, so when a reviewer clicks
/// Approve or Reject in the Workflow inbox, OnAction runs the same Approve/Reject logic
/// the dashboard uses (WorkflowEscalationOp.Approve / Reject), then completes the task.
Class Synapse.Workflow.ReviewTaskResponse Extends EnsLib.Workflow.TaskResponse
{

/// Subject prefix; the payload id is stored between square brackets after it
Parameter SUBJECTPREFIX = "SynapseHealer Review";

/// Called by the Workflow Engine when a user takes an action on the task
Method OnAction(pAction As %String) As %Status
{
    Set tSC = $$$OK
    Try {
        Set payloadId = ..PayloadIdFromSubject(..%Subject)
        Set act = $ZConvert(pAction, "U")
        Set note = "Resolved in IRIS Workflow by " _ ..%UserName

        If payloadId '= "" {
            If act = "APPROVE" {
                Set tSC = ##class(Synapse.Operation.WorkflowEscalationOp).Approve(payloadId, note)
            } ElseIf act = "REJECT" {
                Set tSC = ##class(Synapse.Operation.WorkflowEscalationOp).Reject(payloadId, note)
            }
        }
        If $$$ISERR(tSC) Quit

        // Default behaviour: mark the task complete and return the response
        Set tSC = ##super(pAction)
    } Catch ex {
        Set tSC = ex.AsStatus()
    }
    Quit tSC
}

/// Builds the task subject for a payload
ClassMethod BuildSubject(pPayloadId As %String, pPatternId As %String = "") As %String
{
    Quit ..#SUBJECTPREFIX _ " [" _ pPayloadId _ "]" _ $Select(pPatternId'="":" " _ pPatternId, 1:"")
}

/// Extracts the payload id from a subject built by BuildSubject
ClassMethod PayloadIdFromSubject(pSubject As %String) As %String
{
    If pSubject '[ "[" Quit ""
    Quit $Piece($Piece(pSubject, "[", 2), "]", 1)
}

}
