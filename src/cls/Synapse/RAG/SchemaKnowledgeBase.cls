/// Synapse.RAG.SchemaKnowledgeBase
/// Knowledge base and semantic retrieval engine for Autonomous Schema & Dead-Letter Healing.
/// Utilizes InterSystems IRIS Vector Search (VECTOR datatype & VECTOR_COSINE) and Embedded Python
/// to match inbound malformed payloads and error signatures against canonical repair runbooks.
Class Synapse.RAG.SchemaKnowledgeBase Extends %RegisteredObject [ ProcedureBlock ]
{

/// Populates the 10 canonical integration error patterns and deterministic repair rules
ClassMethod SeedRunbooks() As %Status
{
    Set tSC = $$$OK

    Set patterns = ..GetCanonicalRunbookData()
    Set iter = patterns.%GetIterator()

    While iter.%GetNext(.idx, .item) {
        Set patternId = item."patternId"

        // Check if pattern already exists, or instantiate new
        &sql(SELECT ID INTO :existingId FROM Synapse_RAG.HealingRunbook WHERE PatternId = :patternId)
        If (SQLCODE = 0) && (existingId '= "") {
            Set runbook = ##class(Synapse.RAG.HealingRunbook).%OpenId(existingId)
        } Else {
            Set runbook = ##class(Synapse.RAG.HealingRunbook).%New()
            Set runbook.PatternId = patternId
        }

        Set runbook.ErrorSignature = item."errorSignature"
        Set runbook.Format = item."format"
        Set runbook.VendorSource = item."vendorSource"
        Set runbook.RootCause = item."rootCause"
        Set runbook.RepairStrategy = item."repairStrategy"
        Set runbook.RepairRule = item."repairRule"
        Set runbook.ConfidenceThreshold = item."confidenceThreshold"

        Do runbook.ExampleMutation.Clear()
        Do runbook.ExampleMutation.Write(item."exampleMutation")

        Do runbook.ExampleRepaired.Clear()
        Do runbook.ExampleRepaired.Write(item."exampleRepaired")

        // Compute 384-dimensional vector embedding using Embedded Python
        Set embedText = item."patternId" _ " " _ item."errorSignature" _ " " _ item."repairStrategy" _ " " _ item."rootCause"
        Set vecString = ..ComputeEmbedding(embedText)
        If vecString '= "" {
            // Write vector to column using direct SQL TO_VECTOR
            Set scSave = runbook.%Save()
            If $$$ISOK(scSave) {
                Set rbId = runbook.%Id()
                &sql(UPDATE Synapse_RAG.HealingRunbook SET EmbeddingVector = TO_VECTOR(:vecString, DOUBLE) WHERE ID = :rbId)
            }
        } Else {
            Set scSave = runbook.%Save()
        }
    }

    Quit $$$OK
}

/// Computes a normalized 384-dimensional vector embedding for given text using Embedded Python.
/// Returns a comma-separated float string suitable for SQL TO_VECTOR(?, DOUBLE).
ClassMethod ComputeEmbedding(pText As %String) As %String [ Language = python ]
{
    import re
    import math
    import hashlib

    if not pText:
        return ""

    text = str(pText).strip().lower()
    dim = 384

    # 1. Try FastEmbed / sentence_transformers if installed in Python runtime
    try:
        from fastembed import TextEmbedding
        model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        embeddings = list(model.embed([text]))
        vec = embeddings[0]
        return ",".join(f"{v:.6f}" for v in vec[:dim])
    except Exception:
        pass

    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        vec = model.encode(text)
        return ",".join(f"{v:.6f}" for v in vec[:dim])
    except Exception:
        pass

    # 2. Deterministic, robust semantic feature hashing with L2 normalization (zero external dependencies)
    # Extracts word unigrams, character trigrams, and domain tokens
    words = re.findall(r'[a-z0-9_]+', text)
    tokens = list(words)

    # Character trigrams for typo/morphology resilience
    for w in words:
        if len(w) >= 3:
            tokens.extend([w[i:i+3] for i in range(len(w) - 2)])

    weights = [0.0] * dim
    for t in tokens:
        # Dual-hash projection for reduced collision
        h1 = int(hashlib.md5(t.encode('utf-8')).hexdigest()[:8], 16) % dim
        h2 = int(hashlib.sha256(t.encode('utf-8')).hexdigest()[:8], 16) % dim
        sign1 = 1.0 if (h1 % 2 == 0) else -1.0
        sign2 = 1.0 if (h2 % 2 == 0) else -1.0
        weights[h1] += sign1
        weights[h2] += 0.5 * sign2

    # L2 Normalization so cosine similarity is directly equal to dot product
    norm = math.sqrt(sum(w * w for w in weights))
    if norm > 0.0:
        weights = [w / norm for w in weights]
    else:
        weights[0] = 1.0

    return ",".join(f"{w:.6f}" for w in weights)
}

/// Finds matching healing runbooks for a given error diagnostic or payload snippet.
/// Uses IRIS Native Vector Search (VECTOR_COSINE) with keyword fallback.
ClassMethod FindHealingRunbook(pErrorText As %String, pFormat As %String = "", pTopK As %Integer = 3) As %DynamicArray
{
    Set results = []
    If pErrorText = "" Quit results

    Set queryVec = ..ComputeEmbedding(pErrorText)
    Set hasVectors = 0

    // Check if vectors exist in table
    &sql(SELECT COUNT(*) INTO :vCount FROM Synapse_RAG.HealingRunbook WHERE EmbeddingVector IS NOT NULL)
    If (SQLCODE = 0) && (vCount > 0) && (queryVec '= "") {
        Set hasVectors = 1
    }

    If hasVectors {
        // IRIS Native Vector Cosine Search
        Set sql = "SELECT TOP ? PatternId, ErrorSignature, Format, VendorSource, RootCause, RepairStrategy, RepairRule, ConfidenceThreshold, " _
                  "VECTOR_COSINE(EmbeddingVector, TO_VECTOR(?, DOUBLE)) AS Similarity " _
                  "FROM Synapse_RAG.HealingRunbook " _
                  "WHERE EmbeddingVector IS NOT NULL "

        If pFormat '= "" {
            Set sql = sql _ "AND Format = ? "
        }
        Set sql = sql _ "ORDER BY Similarity DESC"

        Set stmt = ##class(%SQL.Statement).%New()
        Set sc = stmt.%Prepare(sql)
        If $$$ISOK(sc) {
            If pFormat '= "" {
                Set rs = stmt.%Execute(pTopK, queryVec, pFormat)
            } Else {
                Set rs = stmt.%Execute(pTopK, queryVec)
            }

            While rs.%Next() {
                Set match = {}
                Set match."patternId" = rs.%Get("PatternId")
                Set match."errorSignature" = rs.%Get("ErrorSignature")
                Set match."format" = rs.%Get("Format")
                Set match."vendorSource" = rs.%Get("VendorSource")
                Set match."rootCause" = rs.%Get("RootCause")
                Set match."repairStrategy" = rs.%Get("RepairStrategy")
                Set match."repairRule" = rs.%Get("RepairRule")
                Set match."confidenceThreshold" = +rs.%Get("ConfidenceThreshold")
                Set match."similarity" = +$Number(rs.%Get("Similarity"), 4)
                Set match."searchMethod" = "VECTOR_COSINE"
                Do results.%Push(match)
            }

            If results.%Size() > 0 Return results
        }
    }

    // Keyword Fallback Search
    Set term = "%" _ $ZStrip($Piece(pErrorText, " ", 1, 3), "<>W") _ "%"
    Set kwSql = "SELECT TOP ? PatternId, ErrorSignature, Format, VendorSource, RootCause, RepairStrategy, RepairRule, ConfidenceThreshold " _
                "FROM Synapse_RAG.HealingRunbook " _
                "WHERE (ErrorSignature LIKE ? OR RootCause LIKE ? OR RepairRule LIKE ?) "
    If pFormat '= "" {
        Set kwSql = kwSql _ "AND Format = ? "
    }
    Set kwSql = kwSql _ "ORDER BY ID"

    Set kwStmt = ##class(%SQL.Statement).%New()
    Set sc = kwStmt.%Prepare(kwSql)
    If $$$ISOK(sc) {
        If pFormat '= "" {
            Set rs = kwStmt.%Execute(pTopK, term, term, term, pFormat)
        } Else {
            Set rs = kwStmt.%Execute(pTopK, term, term, term)
        }
        While rs.%Next() {
            Set match = {}
            Set match."patternId" = rs.%Get("PatternId")
            Set match."errorSignature" = rs.%Get("ErrorSignature")
            Set match."format" = rs.%Get("Format")
            Set match."vendorSource" = rs.%Get("VendorSource")
            Set match."rootCause" = rs.%Get("RootCause")
            Set match."repairStrategy" = rs.%Get("RepairStrategy")
            Set match."repairRule" = rs.%Get("RepairRule")
            Set match."confidenceThreshold" = +rs.%Get("ConfidenceThreshold")
            Set match."similarity" = 0.75
            Set match."searchMethod" = "KEYWORD_FALLBACK"
            Do results.%Push(match)
        }
    }

    Quit results
}

/// Data definitions for the 10 canonical integration error patterns
ClassMethod GetCanonicalRunbookData() As %DynamicArray [ Language = python ]
{
    import json

    runbooks = [
        {
            "patternId": "HL7-PID-PV1-INVERSION",
            "errorSignature": "Segment out of grammatical order: PV1 visit segment received prior to PID patient identification segment in ADT^A01 event",
            "format": "HL7",
            "vendorSource": "Epic ADT Gateway / Legacy Cloverleaf",
            "rootCause": "HL7 v2.5.1 specification strictly mandates PID segment precede PV1. Upstream multiplexer swapped segment sequence during batching.",
            "repairStrategy": "REORDER_SEGMENTS",
            "repairRule": "Parse all segments into an ordered dictionary. Re-sequence segments according to HL7 grammar: MSH -> EVN -> PID -> PV1 -> remaining segments in original relative order.",
            "confidenceThreshold": 0.90,
            "exampleMutation": "MSH|^~\\&|Epic|HOSP|Synapse|Core|20260501||ADT^A01|001|P|2.5.1\rPV1|1|I|W402\rPID|1||12345^^^MRN||DOE^JANE\r",
            "exampleRepaired": "MSH|^~\\&|Epic|HOSP|Synapse|Core|20260501||ADT^A01|001|P|2.5.1\rPID|1||12345^^^MRN||DOE^JANE\rPV1|1|I|W402\r"
        },
        {
            "patternId": "HL7-DATE-FORMAT-INVALID",
            "errorSignature": "HL7 DataType Error: PID-7 Date/Time of Birth contains invalid date format (hyphenated ISO-8601 or invalid calendar day like Feb 31)",
            "format": "HL7",
            "vendorSource": "AthenaHealth Ambulatory EHR Bridge",
            "rootCause": "REST-to-HL7 bridge serialized date as ISO-8601 string '1985-04-12' with hyphens rather than HL7 TS format YYYYMMDD.",
            "repairStrategy": "REGEX_TRANSFORM",
            "repairRule": "Normalize date fields (PID-7, EVN-2, MSH-7). Strip all hyphens, colons, spaces, and 'T' separators. Validate year/month/day bounds; clamp invalid days to last day of month if necessary.",
            "confidenceThreshold": 0.88,
            "exampleMutation": "PID|1||98765^^^MRN||SMITH^JOHN||1985-02-31|M\r",
            "exampleRepaired": "PID|1||98765^^^MRN||SMITH^JOHN||19850228|M\r"
        },
        {
            "patternId": "HL7-ESCAPE-DELIMITER-LEAK",
            "errorSignature": "HL7 Tokenizer Error: Unescaped field delimiter pipe character '|' inside textual OBX-5 observation narrative",
            "format": "HL7",
            "vendorSource": "Roche Cobas LIS Interface",
            "rootCause": "Laboratory instrument text comments contain unescaped vertical bar '|' which corrupts segment field alignment.",
            "repairStrategy": "ESCAPE_DELIMITERS",
            "repairRule": "Scan OBX textual observation fields. Substitute literal '|' with the HL7 v2 escape sequence '\\F\\'. Replace '\\' with '\\E\\'.",
            "confidenceThreshold": 0.92,
            "exampleMutation": "OBX|1|TX|NOTE||Hemolyzed specimen | Recollect immediately|||||F\r",
            "exampleRepaired": "OBX|1|TX|NOTE||Hemolyzed specimen \\F\\ Recollect immediately|||||F\r"
        },
        {
            "patternId": "HL7-MISSING-MSH-ROUTING",
            "errorSignature": "HL7 Validation Failure: MSH-3 (Sending Application) or MSH-4 (Sending Facility) is null or whitespace",
            "format": "HL7",
            "vendorSource": "Mobile Telehealth / Bedside IoT Monitor",
            "rootCause": "Lightweight bedside device pushes messages without configured institution routing identifiers.",
            "repairStrategy": "POPULATE_DEFAULT_ROUTING",
            "repairRule": "Inspect inbound connection metadata. If MSH-3 is empty, populate with 'SYNAPSE_INGEST'. If MSH-4 is empty, populate with 'SYNAPSE_DEFAULT_FACILITY'.",
            "confidenceThreshold": 0.85,
            "exampleMutation": "MSH|^~\\&|||CentralCore|HOSP|20260501||ADT^A08|002|P|2.5.1\r",
            "exampleRepaired": "MSH|^~\\&|SYNAPSE_INGEST|SYNAPSE_DEFAULT_FACILITY|CentralCore|HOSP|20260501||ADT^A08|002|P|2.5.1\r"
        },
        {
            "patternId": "HL7-TRAILING-NULL-DELIMITERS",
            "errorSignature": "HL7 Parser Error: Extraneous trailing delimiter bars '|||||' exceeding maximum schema field count for PID segment",
            "format": "HL7",
            "vendorSource": "Meditech Interface Engine (Magic / CS)",
            "rootCause": "Legacy interface engine pads trailing optional fields with delimiters beyond standard HL7 2.3 definition.",
            "repairStrategy": "TRIM_TRAILING_DELIMITERS",
            "repairRule": "Split segments by delimiter; trim trailing empty fields down to the highest populated field index before emitting segment.",
            "confidenceThreshold": 0.94,
            "exampleMutation": "PID|1||12345^^^MRN||DOE^JANE||||||||||||||||||||||||||||||||\r",
            "exampleRepaired": "PID|1||12345^^^MRN||DOE^JANE\r"
        },
        {
            "patternId": "JSON-STRINGIFIED-NUMBERS",
            "errorSignature": "JSON Schema Type Error: Properties expected numeric or boolean types but received quoted strings with currency symbols",
            "format": "JSON",
            "vendorSource": "Shopify Medical Store / NetSuite ERP Webhook",
            "rootCause": "Financial export system quoted high-precision decimal and integer values to avoid JavaScript 64-bit float precision loss.",
            "repairStrategy": "CAST_NUMERIC_AND_BOOLEAN",
            "repairRule": "Traverse JSON object. For fields matching numeric patterns ('quantity', 'price', 'tax', 'total', 'amount', 'rate'), strip currency symbols ('$', '€', ',') and cast to float/int. Cast 'true'/'false'/'yes'/'no' strings to boolean.",
            "confidenceThreshold": 0.95,
            "exampleMutation": '{"quantity": "12", "unit_price": "$149.99", "in_stock": "true"}',
            "exampleRepaired": '{"quantity": 12, "unit_price": 149.99, "in_stock": true}'
        },
        {
            "patternId": "JSON-KEY-MUTATION-V2",
            "errorSignature": "JSON Schema Key Violation: Missing mandatory schema properties ['customer_id', 'order_items', 'shipping_address']; unexpected vendor keys ['client_uuid', 'line_items', 'ship_to']",
            "format": "JSON",
            "vendorSource": "Salesforce Commerce Cloud API v2 Migration",
            "rootCause": "Vendor upgraded upstream API payload schema without version negotiation, renaming core dictionary keys.",
            "repairStrategy": "SCHEMA_KEY_ALIAS_MAP",
            "repairRule": "Apply bidirectional key aliasing dictionary: {'client_uuid': 'customer_id', 'order_uuid': 'order_id', 'line_items': 'order_items', 'ship_to': 'shipping_address', 'product_code': 'item_sku'}.",
            "confidenceThreshold": 0.93,
            "exampleMutation": '{"client_uuid": "CUST123", "line_items": [{"product_code": "SKU99", "count": 2}]}',
            "exampleRepaired": '{"customer_id": "CUST123", "order_items": [{"item_sku": "SKU99", "quantity": 2}]}'
        },
        {
            "patternId": "JSON-TIMESTAMP-EPOCH-MILLIS",
            "errorSignature": "JSON Schema Format Error: Property 'created_at' expected RFC3339/ISO-8601 string, received integer Unix epoch milliseconds",
            "format": "JSON",
            "vendorSource": "Kafka CDC Debezium Connector",
            "rootCause": "Debezium database change-data-capture stream serialized SQL timestamp column as UTC millisecond timestamp integer.",
            "repairStrategy": "CONVERT_EPOCH_TO_ISO",
            "repairRule": "Inspect timestamp fields ('created_at', 'updated_at', 'timestamp'). If value is integer > 1000000000, interpret as epoch (seconds or millis) and convert to ISO-8601 string '%Y-%m-%dT%H:%M:%SZ'.",
            "confidenceThreshold": 0.91,
            "exampleMutation": '{"order_id": "ORD001", "created_at": 1714567890123}',
            "exampleRepaired": '{"order_id": "ORD001", "created_at": "2024-05-01T12:51:30Z"}'
        },
        {
            "patternId": "JSON-CORRUPTED-NESTING",
            "errorSignature": "JSON Schema Structural Error: Expected array of objects for 'order_items', received flat comma-delimited string",
            "format": "JSON",
            "vendorSource": "Mirth Legacy JSON Bridge",
            "rootCause": "Legacy middleware flattened repeating XML records into a single concatenated string.",
            "repairStrategy": "UNFLATTEN_STRING_TO_ARRAY",
            "repairRule": "Parse delimited substring 'SKU:QTY:PRICE, ...'. Split by comma, then colon; map each element to object {'item_sku': SKU, 'quantity': int(QTY), 'unit_price': float(PRICE)}.",
            "confidenceThreshold": 0.89,
            "exampleMutation": '{"order_items": "SKU1:2:10.50, SKU2:1:99.00"}',
            "exampleRepaired": '{"order_items": [{"item_sku": "SKU1", "quantity": 2, "unit_price": 10.50}, {"item_sku": "SKU2", "quantity": 1, "unit_price": 99.00}]}'
        },
        {
            "patternId": "JSON-NULL-BOOLEAN-COERCION",
            "errorSignature": "JSON Schema Violation: 'is_active' received '1', 'Y', or null instead of JSON boolean true/false",
            "format": "JSON",
            "vendorSource": "MySQL / PostgreSQL CDC Webhook",
            "rootCause": "Relational database TINYINT(1) or CHAR(1) flag exported directly to JSON without boolean schema coercion.",
            "repairStrategy": "COERCE_BOOLEAN_STRICT",
            "repairRule": "For boolean target fields: map ['1', 1, 'true', 'yes', 'Y', 't'] to true; map ['0', 0, 'false', 'no', 'N', 'f', None, ''] to false.",
            "confidenceThreshold": 0.96,
            "exampleMutation": '{"user_id": "U44", "is_active": "1", "is_verified": "Y", "marketing_opt_in": null}',
            "exampleRepaired": '{"user_id": "U44", "is_active": true, "is_verified": true, "marketing_opt_in": false}'
        }
    ]

    import iris
    return iris.cls("%DynamicArray")._FromJSON(json.dumps(runbooks))
}

}
