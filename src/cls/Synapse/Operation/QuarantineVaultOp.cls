/// Synapse.Operation.QuarantineVaultOp
/// Outbound Business Operation that safely quarantines unresolvable, corrupt,
/// or security-flagged payloads into an isolated vault for operator forensics.
Class Synapse.Operation.QuarantineVaultOp Extends Ens.BusinessOperation [ ProcedureBlock ]
{

Parameter INVOCATION = "Queue";

Parameter SETTINGS = "QuarantineDir:Synapse,StoreGlobal:Synapse";

/// Directory location where quarantined payloads are isolated
Property QuarantineDir As %String(MAXLEN = 250) [ InitialExpression = "/tmp/synapse/quarantine" ];

/// Persist audit record in ^Synapse.Quarantine global
Property StoreGlobal As %Boolean [ InitialExpression = 1 ];

XData MessageMap
{
<MapItems>
    <MapItem MessageType="Synapse.Msg.HealResponse">
        <Method>QuarantineFromResponse</Method>
    </MapItem>
    <MapItem MessageType="Synapse.Msg.DeadLetterRequest">
        <Method>QuarantineFromRequest</Method>
    </MapItem>
</MapItems>
}

/// Quarantines payload received via HealResponse
Method QuarantineFromResponse(pRequest As Synapse.Msg.HealResponse, Output pResponse As Ens.Response) As %Status
{
    Set payload = pRequest.GetHealedAsString()
    If payload = "" Set payload = pRequest.AgentReasoning
    Quit ..IsolatePayload(pRequest.PayloadId, payload, pRequest.AgentReasoning, pRequest.RiskLevel, pRequest.MatchedPatternId)
}

/// Quarantines payload received directly from DeadLetterRequest
Method QuarantineFromRequest(pRequest As Synapse.Msg.DeadLetterRequest, Output pResponse As Ens.Response) As %Status
{
    Quit ..IsolatePayload(pRequest.PayloadId, pRequest.GetPayloadAsString(), pRequest.ValidationError, "CRITICAL", "DIRECT_QUARANTINE")
}

/// Core isolation logic saving payload to disk and quarantine index
Method IsolatePayload(pPayloadId As %String, pPayloadContent As %String, pReason As %String, pRiskLevel As %String, pPatternId As %String) As %Status
{
    Set tSC = $$$OK

    If pPayloadId = "" Return $$$ERROR($$$GeneralError, "PayloadId required")

    // 1. Write isolated file to disk
    If ..QuarantineDir '= "" {
        If '##class(%File).DirectoryExists(..QuarantineDir) {
            Do ##class(%File).CreateDirectoryChain(..QuarantineDir)
        }
        Set filename = pPayloadId _ "_quarantine.dat"
        Set fullPath = ##class(%File).NormalizeFilename(filename, ..QuarantineDir)

        Set file = ##class(%Stream.FileCharacter).%New()
        Set sc = file.LinkToFile(fullPath)
        If $$$ISOK(sc) {
            Do file.Write(pPayloadContent)
            Do file.%Save()
        }
    }

    // 2. Persist in local global
    If ..StoreGlobal {
        Set ^Synapse.Quarantine("index", pPayloadId) = $ListBuild(pPatternId, pRiskLevel, $ZDateTime($Horolog, 3), pReason)
        Set ^Synapse.Quarantine("payload", pPayloadId) = pPayloadContent
        Set ^Synapse.Quarantine("history", +$Horolog, pPayloadId) = $Piece($Horolog, ",", 2)
    }

    If ..%SessionId '= "" {
        $$$LOGWARNING("Payload " _ pPayloadId _ " quarantined into vault: " _ pReason)
    }

    Quit $$$OK
}

/// Standalone helper for direct invocation
Method QuarantinePayload(pRequest As Synapse.Msg.HealResponse) As %Status
{
    Set dir = ..QuarantineDir
    If dir = "" Set dir = "/tmp/synapse/quarantine"
    Quit ..Quarantine(pRequest, dir)
}

/// Standalone quarantine executor callable statically or outside actor threads
ClassMethod Quarantine(pRequest As Synapse.Msg.HealResponse, pDir As %String = "/tmp/synapse/quarantine") As %Status
{
    Set tSC = $$$OK

    If '$IsObject(pRequest) Return $$$ERROR($$$GeneralError, "Null HealResponse")
    Set payloadId = pRequest.PayloadId
    If payloadId = "" Return $$$ERROR($$$GeneralError, "PayloadId required")

    Set payload = pRequest.GetHealedAsString()
    If payload = "" Set payload = pRequest.AgentReasoning
    Set reason = pRequest.AgentReasoning
    Set riskLevel = pRequest.RiskLevel
    Set patternId = pRequest.MatchedPatternId

    If pDir '= "" {
        If '##class(%File).DirectoryExists(pDir) {
            Do ##class(%File).CreateDirectoryChain(pDir)
        }
        Set filename = payloadId _ "_quarantine.dat"
        Set fullPath = ##class(%File).NormalizeFilename(filename, pDir)

        Set file = ##class(%Stream.FileCharacter).%New()
        Set sc = file.LinkToFile(fullPath)
        If $$$ISOK(sc) {
            Do file.Write(payload)
            Do file.%Save()
        }
    }

    Set ^Synapse.Quarantine("index", payloadId) = $ListBuild(patternId, riskLevel, $ZDateTime($Horolog, 3), reason)
    Set ^Synapse.Quarantine("payload", payloadId) = payload
    Set ^Synapse.Quarantine("history", +$Horolog, payloadId) = $Piece($Horolog, ",", 2)

    Quit $$$OK
}

}
