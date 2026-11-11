/// Synapse.Test.WorkflowSmoke
/// Smoke test for the Workflow Engine integration and the replay simulations.
/// Run inside the container:  do ##class(Synapse.Test.WorkflowSmoke).Run()
/// Prints one PASS/FAIL line per check and returns an error status if any check fails.
Class Synapse.Test.WorkflowSmoke Extends %RegisteredObject [ ProcedureBlock ]
{

ClassMethod Run(pWaitSeconds As %Integer = 15) As %Status
{
    Set ^||fails = 0
    Set role = ##class(Synapse.Config.WorkflowSetup).#ROLE

    // 1. Setup is idempotent and the role exists with members
    Set sc1 = ##class(Synapse.Config.WorkflowSetup).Setup()
    Set sc2 = ##class(Synapse.Config.WorkflowSetup).Setup()
    Do ..Check("WorkflowSetup.Setup() runs twice without error", $$$ISOK(sc1) && $$$ISOK(sc2), $System.Status.GetErrorText($$$ADDSC(sc1, sc2)))
    Do ..Check("Workflow role "_role_" exists", ##class(EnsLib.Workflow.RoleDefinition).%ExistsId(role))
    Set members = ##class(Synapse.Config.WorkflowSetup).MemberCount(role)
    Do ..Check("Role has at least one reviewer (found "_members_")", members > 0)

    // 2. Production running with the Workflow operation named after the role
    Set running = ##class(Ens.Director).IsProductionRunning(.prodName)
    Do ..Check("Production running ("_$Get(prodName)_")", running)
    Do ..Check("Production has EnsLib.Workflow.Operation item '"_role_"'", ##class(Ens.Config.Item).NameExists("Synapse.Production", role))

    // 3. A HUMAN_WORKFLOW escalation creates a Workflow task for the role
    Set payloadId = "SMOKE-" _ $Translate($ZDateTime($ZTimestamp, 8, 1, 3), " :.", "")
    Set resp = ##class(Synapse.Msg.HealResponse).%New()
    Set resp.PayloadId = payloadId
    Set resp.DecisionBranch = "HUMAN_WORKFLOW"
    Set resp.MatchedPatternId = "SMOKE_TEST"
    Set resp.ConfidenceScore = 0.7
    Set resp.RiskLevel = "MEDIUM_HIGH"
    Set resp.AgentReasoning = "Smoke test escalation"
    Do resp.SetHealedFromString("{""smoke"":true}")
    Set sc = ##class(Synapse.Service.WorkflowDispatchService).Dispatch(resp, .queued)
    Do ..Check("Escalation queued into production", $$$ISOK(sc) && $Get(queued), $System.Status.GetErrorText(sc))

    Set taskId = ""
    For i = 1:1:(pWaitSeconds * 2) {
        Set taskId = ..FindTask(payloadId)
        Quit:taskId'=""
        Hang 0.5
    }
    Do ..Check("Workflow task created for "_payloadId_" (TaskResponse id "_taskId_")", taskId '= "")
    If taskId '= "" {
        Set task = ##class(EnsLib.Workflow.TaskResponse).%OpenId(taskId, 0)
        Do ..Check("Task handler is Synapse.Workflow.ReviewTaskResponse", $IsObject(task) && (task.%ClassName(1) = "Synapse.Workflow.ReviewTaskResponse"), $Select($IsObject(task):task.%ClassName(1), 1:""))
        Do ..Check("Task role is "_role, $IsObject(task) && (task.%RoleName = role), $Select($IsObject(task):task.%RoleName, 1:""))
        Set wl = 0
        Try {
            Set rs = ##class(%SQL.Statement).%ExecDirect(, "SELECT COUNT(*) AS N FROM EnsLib_Workflow.Worklist WHERE Task = ?", taskId)
            If rs.%Next() Set wl = +rs.%Get("N")
        } Catch {}
        Do ..Check("Task is in at least one reviewer's worklist ("_wl_")", wl > 0)

        // 4. Approve through the Workflow Engine, the same calls the Workflow inbox makes:
        //    take ownership of the worklist item, then process the "Approve" action
        Set user = $Piece($System.Util.GetEnviron("SYNAPSE_REVIEWERS"), ",", 1)
        If user = "" Set user = $Piece(##class(Synapse.Config.WorkflowSetup).#DEFAULTREVIEWERS, ",", 1)
        Set itemId = taskId _ "||" _ user
        Set scT = ##class(EnsLib.Workflow.Engine).%TakeOwnershipForTask(itemId, user, .msg)
        Do ..Check("Reviewer "_user_" takes ownership of the task", $$$ISOK(scT), $System.Status.GetErrorText(scT)_" "_$Get(msg))
        Set scA = ##class(EnsLib.Workflow.Engine).%ProcessAction("Approve", itemId, user, .msg2)
        Do ..Check("Workflow action Approve processed", $$$ISOK(scA), $System.Status.GetErrorText(scA)_" "_$Get(msg2))
        Set task = ##class(EnsLib.Workflow.TaskResponse).%OpenId(taskId, 0)
        Do ..Check("Workflow task status is Completed", $IsObject(task) && (task.%Status = "Completed"), $Select($IsObject(task):task.%Status, 1:""))
        Set st = $ListGet($Get(^Synapse.WorkflowQueue("tasks", payloadId)), 5)
        Do ..Check("Local queue status is APPROVED (got "_st_")", st = "APPROVED")
    }

    // 5. Fallback path still works and is idempotent
    Set scB = ##class(Synapse.Operation.WorkflowEscalationOp).Approve(payloadId, "second call")
    Set st = $ListGet($Get(^Synapse.WorkflowQueue("tasks", payloadId)), 5)
    Do ..Check("Approve() again is a no-op (status stays APPROVED)", $$$ISOK(scB) && (st = "APPROVED"))

    // 6. Dashboard path: decision made outside the inbox also clears the Workflow worklist
    Set pid2 = payloadId _ "-DASH"
    Set resp.PayloadId = pid2
    Do ##class(Synapse.Service.WorkflowDispatchService).Dispatch(resp, .queued2)
    Set t2 = ""
    For i = 1:1:(pWaitSeconds * 2) { Set t2 = ..FindTask(pid2) Quit:t2'=""  Hang 0.5 }
    Do ..Check("Second Workflow task created for "_pid2, t2 '= "")
    Set scD = ##class(Synapse.Operation.WorkflowEscalationOp).Reject(pid2, "dashboard")
    Set scD = $$$ADDSC(scD, ##class(Synapse.Operation.WorkflowEscalationOp).CloseEngineTask(pid2, "Reject"))
    Set wl2 = -1
    Try {
        Set rs = ##class(%SQL.Statement).%ExecDirect(, "SELECT COUNT(*) AS N FROM EnsLib_Workflow.Worklist WHERE Task = ?", t2)
        If rs.%Next() Set wl2 = +rs.%Get("N")
    } Catch {}
    Set st2 = $ListGet($Get(^Synapse.WorkflowQueue("tasks", pid2)), 5)
    Do ..Check("Dashboard Reject sets REJECTED and clears the inbox (status "_st2_", worklist "_wl2_")", $$$ISOK(scD) && (st2 = "REJECTED") && (wl2 = 0), $System.Status.GetErrorText(scD))

    // 7. Existing replay simulations still produce decisions
    Set scenarios = $ListBuild("HL7|HL7_SWAPPED_FIELDS", "HL7|HL7_INVALID_DATE", "HL7|HL7_UNESCAPED_DELIMITER", "JSON|JSON_STRINGIFIED_NUMBERS", "JSON|JSON_KEY_MUTATION-V2", "JSON|JSON_TIMESTAMP_EPOCH_MILLIS", "JSON|JSON_CORRUPTED_NESTING")
    For i = 1:1:$ListLength(scenarios) {
        Set fmt = $Piece($List(scenarios, i), "|", 1), err = $Piece($List(scenarios, i), "|", 2)
        Set branch = "", scR = $$$OK
        Try {
            Set req = ##class(Synapse.Adapter.DeadLetterInbound).CreateDeadLetterFromChaos(fmt, err)
            Set scR = ##class(Synapse.Process.DeadLetterHealerBP).ProcessDeadLetter(req, .out, "replay")
            If $IsObject($Get(out)) Set branch = out.DecisionBranch
        } Catch ex { Set scR = ex.AsStatus() }
        Do ..Check("Scenario "_i_" "_err_" -> "_branch, $$$ISOK(scR) && (branch '= ""), $System.Status.GetErrorText(scR))
    }

    Write !, $Select(^||fails=0:"ALL CHECKS PASSED", 1:^||fails_" CHECK(S) FAILED"), !
    Quit $Select(^||fails=0:$$$OK, 1:$$$ERROR($$$GeneralError, ^||fails_" smoke check(s) failed"))
}

/// Finds the Workflow task (TaskResponse id) whose subject carries the payload id
ClassMethod FindTask(pPayloadId As %String) As %String
{
    Set id = ""
    Try {
        Set rs = ##class(%SQL.Statement).%ExecDirect(, "SELECT TOP 1 ID FROM EnsLib_Workflow.TaskResponse WHERE %Subject [ ? ORDER BY ID DESC", "["_pPayloadId_"]")
        If rs.%Next() Set id = rs.%Get("ID")
    } Catch {}
    Quit id
}

ClassMethod Check(pName As %String, pOk As %Boolean, pDetail As %String = "")
{
    If pOk {
        Write "PASS  ", pName, !
    } Else {
        Set ^||fails = ^||fails + 1
        Write "FAIL  ", pName, $Select(pDetail'="":"  ("_pDetail_")", 1:""), !
    }
}

}
