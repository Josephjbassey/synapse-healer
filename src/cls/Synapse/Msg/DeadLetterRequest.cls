/// Synapse.Msg.DeadLetterRequest
/// Standard Dead-Letter Queue event message representing a malformed, rejected,
/// or quarantined payload captured from Interoperability workflows.
Class Synapse.Msg.DeadLetterRequest Extends Ens.Request [ ProcedureBlock ]
{

/// Unique identifier for this dead-letter payload event
Property PayloadId As %String(MAXLEN = 100) [ Required ];

/// Originating system (e.g., "Epic_ADT", "Shopify_Orders", "LabAnalyzer_LIS")
Property SourceSystem As %String(MAXLEN = 100);

/// Data format: "JSON" or "HL7" (also supports "XML" or "CSV")
Property Format As %String(VALUELIST = ",JSON,HL7,XML,CSV") [ InitialExpression = "JSON" ];

/// Raw unparsed payload stream containing the exact byte-level malformed content
Property RawPayload As %Stream.GlobalCharacter;

/// Diagnostic error message or schema failure reported by parser/validator
Property ValidationError As %String(MAXLEN = 2000);

/// UTC timestamp when the failure occurred
Property Timestamp As %TimeStamp;

/// Quick helper to set payload content from a string
Method SetPayloadFromString(pContent As %String) As %Status
{
    Do ..RawPayload.Clear()
    Do ..RawPayload.Write(pContent)
    Quit $$$OK
}

/// Quick helper to read entire raw payload as string
Method GetPayloadAsString() As %String
{
    If '$IsObject(..RawPayload) Quit ""
    Do ..RawPayload.Rewind()
    Quit ..RawPayload.Read(32000)
}

}
