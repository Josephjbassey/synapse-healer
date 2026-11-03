/// Synapse.Operation.ResubmitDeliveryOp
/// Outbound Business Operation that delivers healed payloads to downstream target endpoints.
/// Writes validated payloads to the destination directory and records delivery audit confirmations.
Class Synapse.Operation.ResubmitDeliveryOp Extends Ens.BusinessOperation [ ProcedureBlock ]
{

Parameter INVOCATION = "Queue";

Parameter SETTINGS = "DeliveryDir:Synapse,StoreConfirmation:Synapse";

/// Output directory for healed, resubmitted payloads
Property DeliveryDir As %String(MAXLEN = 250) [ InitialExpression = "/tmp/synapse/delivered" ];

/// Record delivery receipts in local global
Property StoreConfirmation As %Boolean [ InitialExpression = 1 ];

/// Message Map routing incoming HealResponse messages
XData MessageMap
{
<MapItems>
    <MapItem MessageType="Synapse.Msg.HealResponse">
        <Method>ResubmitPayload</Method>
    </MapItem>
</MapItems>
}

/// Delivers the healed payload to the destination directory and audit index
Method ResubmitPayload(pRequest As Synapse.Msg.HealResponse, Output pResponse As Ens.Response) As %Status
{
    Set tSC = $$$OK

    If '$IsObject(pRequest) Return $$$ERROR($$$GeneralError, "Null HealResponse message")

    Set payloadId = pRequest.PayloadId
    Set healedContent = pRequest.GetHealedAsString()

    // 1. Write file to destination directory if configured
    If ..DeliveryDir '= "" {
        If '##class(%File).DirectoryExists(..DeliveryDir) {
            Do ##class(%File).CreateDirectoryChain(..DeliveryDir)
        }
        Set ext = $Select(healedContent [ "MSH":"hl7", 1:"json")
        Set filename = payloadId _ "_healed." _ ext
        Set fullPath = ##class(%File).NormalizeFilename(filename, ..DeliveryDir)

        Set file = ##class(%Stream.FileCharacter).%New()
        Set sc = file.LinkToFile(fullPath)
        If $$$ISOK(sc) {
            Do file.Write(healedContent)
            Do file.%Save()
        }
    }

    // 2. Record delivery receipt in global
    If ..StoreConfirmation {
        Set ^Synapse.Delivered("index", payloadId) = $ListBuild(pRequest.MatchedPatternId, pRequest.ConfidenceScore, pRequest.RiskLevel, $ZDateTime($Horolog, 3))
        Set ^Synapse.Delivered("payload", payloadId) = healedContent
        Set ^Synapse.Delivered("history", +$Horolog, payloadId) = $Piece($Horolog, ",", 2)
    }

    $$$LOGINFO("Successfully resubmitted healed payload " _ payloadId _ " [" _ pRequest.MatchedPatternId _ "] to downstream endpoint")

    Quit $$$OK
}

}
