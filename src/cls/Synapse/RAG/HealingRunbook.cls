/// Synapse.RAG.HealingRunbook
/// Persistent runbook entity storing integration error signatures, root causes,
/// deterministic repair instructions, and 384-dimensional vector embeddings
/// for IRIS Vector Search (VECTOR_COSINE / %AI.RAG).
Class Synapse.RAG.HealingRunbook Extends (%Persistent, %XML.Adaptor) [ ProcedureBlock ]
{

/// Unique canonical pattern identifier (e.g., "HL7-PID-PV1-INVERSION")
Property PatternId As %String(MAXLEN = 50) [ Required ];

/// High-level error signature or validator diagnostic
Property ErrorSignature As %String(MAXLEN = 1000) [ Required ];

/// Target protocol/format ("HL7", "JSON", "XML", "CSV")
Property Format As %String(VALUELIST = ",JSON,HL7,XML,CSV") [ InitialExpression = "JSON" ];

/// Typical originating system or vendor interface
Property VendorSource As %String(MAXLEN = 100);

/// Detailed technical root-cause analysis
Property RootCause As %String(MAXLEN = 2000);

/// Categorical repair strategy identifier
Property RepairStrategy As %String(MAXLEN = 50);

/// Actionable, deterministic repair rule or transformation specification
Property RepairRule As %String(MAXLEN = 4000);

/// Synthetic or captured snippet illustrating the malformed payload
Property ExampleMutation As %Stream.GlobalCharacter;

/// Canonical snippet showing the correctly repaired and validated payload
Property ExampleRepaired As %Stream.GlobalCharacter;

/// IRIS Native Vector Search embedding vector (384 dimensions, DOUBLE)
Property EmbeddingVector As %Vector(DATATYPE = "DOUBLE", LEN = 384);

/// Minimum cosine similarity threshold required for auto-approval without human-in-the-loop
Property ConfidenceThreshold As %Numeric [ InitialExpression = 0.80 ];

Index PatternIdIdx On PatternId [ Unique ];

Index FormatIdx On Format;

}
