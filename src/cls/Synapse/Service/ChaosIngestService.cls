/// Synapse.Service.ChaosIngestService
/// Business Service receiving dead-letter payloads from the DeadLetterInbound adapter,
/// file drops, REST endpoints, or the Embedded Python chaos generator.
/// Forwards payloads to Synapse.Process.DeadLetterHealerBP for autonomous schema healing.
Class Synapse.Service.ChaosIngestService Extends Ens.BusinessService [ ProcedureBlock ]
{

Parameter ADAPTER = "Synapse.Adapter.DeadLetterInbound";

Parameter SETTINGS = "TargetConfigNames:Synapse:selector?multiSelect=1&context='Ens.ContextSearch/ProductionItems?targets=1&productionName=@productionId',StoreAuditLog:Synapse";

/// Target Business Process or Operation to forward dead-letter requests to
Property TargetConfigNames As %String(MAXLEN = 1000) [ InitialExpression = "Synapse.Process.DeadLetterHealerBP" ];

/// Persist an in-database audit index of incoming dead-letter events
Property StoreAuditLog As %Boolean [ InitialExpression = 1 ];

/// Processes each dead-letter request delivered by the adapter or manual trigger
Method OnProcessInput(pInput As Synapse.Msg.DeadLetterRequest, Output pOutput As %RegisteredObject) As %Status
{
    Set tSC = $$$OK

    If '$IsObject(pInput) Quit $$$ERROR($$$GeneralError, "Null or invalid DeadLetterRequest")

    // 1. In-database audit tracking
    If ..StoreAuditLog {
        Do ..RecordAuditLog(pInput)
    }

    $$$LOGINFO("Ingested Dead-Letter event " _ pInput.PayloadId _ " [" _ pInput.Format _ "] from " _ pInput.SourceSystem)

    // 2. Dispatch to configured target business processes if running
    If ..TargetConfigNames '= "" {
        For i = 1:1:$Length(..TargetConfigNames, ",") {
            Set target = $ZStrip($Piece(..TargetConfigNames, ",", i), "<>W")
            If target = "" Continue

            // Attempt asynchronous dispatch to target healer process
            Set scSend = ..SendRequestAsync(target, pInput)
            If $$$ISERR(scSend) {
                // If target process is not yet running in production, log diagnostic warning
                $$$LOGWARNING("Target process '" _ target _ "' offline or unroutable: " _ $System.Status.GetErrorText(scSend))
            }
        }
    }

    Quit $$$OK
}

/// Records the dead-letter payload in the local Synapse audit global
Method RecordAuditLog(pInput As Synapse.Msg.DeadLetterRequest)
{
    Try {
        Set payloadId = pInput.PayloadId
        If payloadId = "" Set payloadId = "ANON-" _ $Piece($ZTimestamp, ",", 2)

        Set ts = pInput.Timestamp
        If ts = "" Set ts = $ZDateTime($Horolog, 3)

        Set rawStr = pInput.GetPayloadAsString()

        Set ^Synapse.DLQ("index", payloadId) = $ListBuild(pInput.Format, pInput.SourceSystem, ts, pInput.ValidationError, $Length(rawStr))
        Set ^Synapse.DLQ("payload", payloadId) = rawStr
        Set ^Synapse.DLQ("status", payloadId) = "INGESTED"
        Set ^Synapse.DLQ("history", +$Horolog, payloadId) = $Piece($Horolog, ",", 2)
    } Catch ex {
        // Non-blocking telemetry
    }
}

/// Convenience ClassMethod to trigger chaos ingest from REST, MCP, or unit tests.
/// Works both when Ens.Production is active and in standalone test mode.
ClassMethod IngestChaos(pFormat As %String = "JSON", pErrorType As %String = "AUTO", Output pPayloadId As %String) As %Status
{
    Set pPayloadId = ""
    Set tSC = $$$OK

    Set req = ##class(Synapse.Adapter.DeadLetterInbound).CreateDeadLetterFromChaos(pFormat, pErrorType)
    If '$IsObject(req) Quit $$$ERROR($$$GeneralError, "Failed to generate chaos payload")

    Set pPayloadId = req.PayloadId

    // 1. If production is active, use Ens.Director to route via the service
    If ##class(Ens.Director).IsProductionRunning() {
        Set sc = ##class(Ens.Director).CreateBusinessService("Synapse.Service.ChaosIngestService", .service)
        If $$$ISOK(sc) && $IsObject(service) {
            Set tSC = service.OnProcessInput(req)
            Return tSC
        }
    }

    // 2. Standalone fallback: execute healing pipeline directly and record telemetry
    Set standaloneSvc = ..%New()
    Set standaloneSvc.StoreAuditLog = 1
    Do standaloneSvc.RecordAuditLog(req)

    // Execute business process healing arbitration and record telemetry
    Set bp = ##class(Synapse.Process.DeadLetterHealerBP).%New()
    Set tSC = bp.OnRequest(req, .resp)

    Quit tSC
}

}
