/// Synapse.Config.WorkflowSetup
/// Idempotent setup for the InterSystems Workflow Engine pieces used by SynapseHealer.
/// Creates the "SynapseReviewers" Workflow role and adds the reviewer users to it.
/// The production item that delivers tasks to this role is the EnsLib.Workflow.Operation
/// named "SynapseReviewers" (the Workflow Engine uses the operation's config name as the role).
/// Safe to run many times: existing roles, users and memberships are left as they are.
Class Synapse.Config.WorkflowSetup Extends %RegisteredObject [ ProcedureBlock ]
{

/// Workflow role that receives SynapseHealer review tasks
Parameter ROLE = "SynapseReviewers";

/// Default reviewers (comma-separated IRIS user names). Override with SYNAPSE_REVIEWERS.
/// _SYSTEM and SuperUser are the accounts judges normally sign in with, so tasks show up in
/// their Workflow inbox without creating new accounts or passwords.
Parameter DEFAULTREVIEWERS = "_SYSTEM,SuperUser";

/// Creates the role, the Workflow users and the role memberships in the current namespace.
ClassMethod Setup(pVerbose As %Boolean = 0) As %Status
{
    Set tSC = $$$OK
    Try {
        If '##class(%Dictionary.CompiledClass).%ExistsId("EnsLib.Workflow.RoleDefinition") {
            Write:pVerbose "Workflow Engine classes not available in this namespace; skipping",!
            Quit
        }

        Set role = ..#ROLE
        If '##class(EnsLib.Workflow.RoleDefinition).%ExistsId(role) {
            Set tSC = ##class(EnsLib.Workflow.RoleDefinition).CreateRole(role)
            If $$$ISERR(tSC) Quit
            Write:pVerbose "Created Workflow role ",role,!
        } Else {
            Write:pVerbose "Workflow role ",role," already exists",!
        }

        Set reviewers = $System.Util.GetEnviron("SYNAPSE_REVIEWERS")
        If reviewers = "" Set reviewers = ..#DEFAULTREVIEWERS

        For i = 1:1:$Length(reviewers, ",") {
            Set user = $ZStrip($Piece(reviewers, ",", i), "<>W")
            If user = "" Continue

            If '##class(EnsLib.Workflow.UserDefinition).%ExistsId(user) {
                Set sc = ##class(EnsLib.Workflow.UserDefinition).CreateUser(user, user)
                If $$$ISERR(sc) {
                    Set tSC = $$$ADDSC(tSC, sc)
                    Continue
                }
                Write:pVerbose "Created Workflow user ",user,!
            }

            If '..IsMember(role, user) {
                Set sc = ##class(EnsLib.Workflow.RoleDefinition).AddUserToRole(role, user)
                If $$$ISERR(sc) {
                    Set tSC = $$$ADDSC(tSC, sc)
                    Continue
                }
                Write:pVerbose "Added ",user," to ",role,!
            }
        }
    } Catch ex {
        Set tSC = ex.AsStatus()
    }
    Quit tSC
}

/// Returns 1 if pUser is a member of the Workflow role pRole
ClassMethod IsMember(pRole As %String, pUser As %String) As %Boolean
{
    Set found = 0
    Try {
        Set rs = ##class(%SQL.Statement).%ExecDirect(, "SELECT COUNT(*) AS N FROM EnsLib_Workflow.RoleMembership WHERE RoleName = ? AND UserName = ?", pRole, pUser)
        If rs.%Next() Set found = (rs.%Get("N") > 0)
    } Catch ex {
        Set found = 0
    }
    Quit found
}

/// Number of members in the role (used by the smoke test)
ClassMethod MemberCount(pRole As %String = {..#ROLE}) As %Integer
{
    Set n = 0
    Try {
        Set rs = ##class(%SQL.Statement).%ExecDirect(, "SELECT COUNT(*) AS N FROM EnsLib_Workflow.RoleMembership WHERE RoleName = ?", pRole)
        If rs.%Next() Set n = +rs.%Get("N")
    } Catch ex {}
    Quit n
}

}
