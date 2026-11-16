/// Synapse.Service.WorkflowDispatchService
/// Adapterless Business Service used by the REST API (POST /api/synapse/inject).
/// The REST endpoint heals payloads synchronously so the dashboard gets an immediate answer;
/// for HUMAN_WORKFLOW decisions it calls Dispatch() so the escalation still travels through
/// the production (WorkflowEscalationOp -> SynapseReviewers Workflow operation) and a real
/// Workflow task is created.
Class Synapse.Service.WorkflowDispatchService Extends Ens.BusinessService [ ProcedureBlock ]
{

/// Target operation for escalations
Property TargetConfigName As %String(MAXLEN = 100) [ InitialExpression = "Synapse.Operation.WorkflowEscalationOp" ];

Parameter SETTINGS = "TargetConfigName:Synapse";

Method OnProcessInput(pInput As Synapse.Msg.HealResponse, Output pOutput As %RegisteredObject) As %Status
{
    If '$IsObject(pInput) Quit $$$ERROR($$$GeneralError, "Null HealResponse")
    Quit ..SendRequestAsync(..TargetConfigName, pInput)
}

/// Best-effort dispatch. Returns 1 in pQueued when the escalation entered the production.
/// Never throws; when the production is not running the local queue still holds the task.
ClassMethod Dispatch(pResponse As Synapse.Msg.HealResponse, Output pQueued As %Boolean) As %Status
{
    Set pQueued = 0
    Set tSC = $$$OK
    Try {
        If '##class(Ens.Director).IsProductionRunning() Quit
        Set tSC = ##class(Ens.Director).CreateBusinessService("Synapse.Service.WorkflowDispatchService", .svc)
        If $$$ISERR(tSC) || '$IsObject(svc) Quit
        Set tSC = svc.ProcessInput(pResponse)
        If $$$ISOK(tSC) Set pQueued = 1
    } Catch ex {
        Set tSC = ex.AsStatus()
    }
    Quit tSC
}

}
