/// Synapse.Adapter.DeadLetterInbound
/// Custom Inbound Adapter for Autonomous Dead-Letter & Schema Healing.
/// Ingests malformed payloads from the file system, REST endpoint triggers,
/// or generates realistic enterprise chaos payloads using Embedded Python.
Class Synapse.Adapter.DeadLetterInbound Extends Ens.InboundAdapter [ ProcedureBlock ]
{

Parameter SETTINGS = "InboundDir:Synapse,ArchiveDir:Synapse,CallInterval:Synapse,SimulateChaos:Synapse,DefaultChaosFormat:Synapse,DefaultChaosError:Synapse";

/// Directory where external dead-letter or rejected payloads arrive
Property InboundDir As %String(MAXLEN = 250) [ InitialExpression = "/tmp/synapse/inbound" ];

/// Archive directory where processed dead-letter payloads are moved
Property ArchiveDir As %String(MAXLEN = 250) [ InitialExpression = "/tmp/synapse/archive" ];

/// Adapter polling frequency in seconds
Property CallInterval As %Numeric [ InitialExpression = 5 ];

/// When enabled and no inbound files are waiting, periodically generates synthetic chaos payloads
Property SimulateChaos As %Boolean [ InitialExpression = 0 ];

/// Default format for simulated chaos ("JSON" or "HL7")
Property DefaultChaosFormat As %String(VALUELIST = ",JSON,HL7,AUTO") [ InitialExpression = "AUTO" ];

/// Specific error pattern to simulate ("AUTO", "HL7_SWAPPED_FIELDS", "HL7_INVALID_DATE", "JSON_STRINGIFIED_NUMBERS", "JSON_RENAMED_KEYS", "JSON_CORRUPTED_NESTING")
Property DefaultChaosError As %String(VALUELIST = ",AUTO,HL7_SWAPPED_FIELDS,HL7_INVALID_DATE,HL7_UNESCAPED_DELIMITER,JSON_STRINGIFIED_NUMBERS,JSON_RENAMED_KEYS,JSON_CORRUPTED_NESTING,JSON_INVALID_TIMESTAMP") [ InitialExpression = "AUTO" ];

/// Main adapter task loop executed by InterSystems Ensemble engine
Method OnTask() As %Status
{
    Set tSC = $$$OK
    Set processedAny = 0

    // 1. Check for physical dead-letter payload files in InboundDir
    If (..InboundDir '= "") && ##class(%File).DirectoryExists(..InboundDir) {
        Set tSC = ..ProcessInboundDirectory(.processedAny)
        If $$$ISERR(tSC) Return tSC
    }

    // 2. If no file was processed and SimulateChaos is enabled, ingest a synthetic chaos payload
    If ('processedAny) && (..SimulateChaos) {
        Set req = ..CreateDeadLetterFromChaos(..DefaultChaosFormat, ..DefaultChaosError)
        If $IsObject(req) {
            Set tSC = ..BusinessHost.ProcessInput(req)
        }
    }

    Quit tSC
}

/// Scans InboundDir for files (*.json, *.hl7, *.txt), converts to DeadLetterRequest, and delivers to BusinessHost
Method ProcessInboundDirectory(Output pProcessedAny As %Boolean) As %Status
{
    Set pProcessedAny = 0
    Set tSC = $$$OK

    Set rs = ##class(%File).FileSetFunc(..InboundDir, "*.json;*.hl7;*.txt")
    While rs.%Next() {
        Set filePath = rs.Name
        Set fileName = rs.ItemName
        If (fileName = "") || ($Extract(fileName, 1) = ".") Continue

        Set fileStream = ##class(%Stream.FileCharacter).%New()
        Set sc = fileStream.LinkToFile(filePath)
        If $$$ISERR(sc) Continue

        Set ext = $ZConvert($Piece(fileName, ".", *), "U")
        Set fmt = $Select(ext="HL7":"HL7", 1:"JSON")

        Set req = ##class(Synapse.Msg.DeadLetterRequest).%New()
        Set req.PayloadId = "FILE-" _ $Piece(fileName, ".", 1) _ "-" _ $Piece($ZTimestamp, ",", 2)
        Set req.SourceSystem = "FileDropAdapter"
        Set req.Format = fmt
        Set req.ValidationError = "Ingested from inbound dead-letter drop: " _ fileName
        Set req.Timestamp = $ZDateTime($Horolog, 3)

        While 'fileStream.AtEnd {
            Do req.RawPayload.Write(fileStream.Read(8000))
        }

        Set pProcessedAny = 1
        Set sc = ..BusinessHost.ProcessInput(req)

        // Move to ArchiveDir or remove
        If (..ArchiveDir '= "") {
            If '##class(%File).DirectoryExists(..ArchiveDir) {
                Do ##class(%File).CreateDirectoryChain(..ArchiveDir)
            }
            Set targetPath = ##class(%File).NormalizeFilename(fileName, ..ArchiveDir)
            Do ##class(%File).Rename(filePath, targetPath)
        } Else {
            Do ##class(%File).Delete(filePath)
        }
    }

    Quit $$$OK
}

/// Creates a Synapse.Msg.DeadLetterRequest populated by Embedded Python realistic chaos generation
ClassMethod CreateDeadLetterFromChaos(pFormat As %String = "", pErrorType As %String = "AUTO") As Synapse.Msg.DeadLetterRequest
{
    Set jsonStr = ..GenerateChaosPayloadJSON(pFormat, pErrorType)
    If jsonStr = "" Quit $$$NULLOREF

    Set dyn = ##class(%DynamicObject).%FromJSON(jsonStr)
    Set req = ##class(Synapse.Msg.DeadLetterRequest).%New()
    Set req.PayloadId = dyn."payloadId"
    Set req.SourceSystem = dyn."sourceSystem"
    Set req.Format = dyn."format"
    Set req.ValidationError = dyn."validationError"
    Set req.Timestamp = $ZDateTime($Horolog, 3)
    Do req.RawPayload.Write(dyn."rawPayload")

    Quit req
}

/// Helper Method using Embedded Python to generate realistic enterprise integration anomalies.
/// Covers HL7 v2 and JSON payloads with precise schema mutations.
ClassMethod GenerateChaosPayloadJSON(pFormat As %String = "", pErrorType As %String = "AUTO") As %String [ Language = python ]
{
    import json
    import uuid
    import random
    import datetime

    # Determine format
    fmt = pFormat.upper() if pFormat else ""
    if not fmt or fmt == "AUTO":
        fmt = random.choice(["JSON", "HL7"])

    err_type = pErrorType.upper() if pErrorType else "AUTO"
    now_ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
    iso_now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if fmt == "HL7":
        available_hl7_errors = ["HL7_SWAPPED_FIELDS", "HL7_INVALID_DATE", "HL7_UNESCAPED_DELIMITER"]
        if err_type == "AUTO" or err_type not in available_hl7_errors:
            err_type = random.choice(available_hl7_errors)

        pid_id = f"PAT{random.randint(100000, 999999)}"
        visit_id = f"V{random.randint(10000, 99999)}"

        if err_type == "HL7_SWAPPED_FIELDS":
            # PV1 segment mistakenly placed BEFORE PID segment
            raw_payload = (
                f"MSH|^~\\&|Epic_ADT|RegionalHospital|Synapse_Ingest|CentralCore|{now_ts}||ADT^A01|MSG{random.randint(10000,99999)}|P|2.5.1\r"
                f"EVN|A01|{now_ts}\r"
                f"PV1|1|I|W402^BED01^HOSP||||1234^Welby^Marcus^Dr|||SUR|||||||ADM|{visit_id}\r"
                f"PID|1||{pid_id}^^^MRN||DOE^JANE^M||19820514|F|||123 ELM ST^^BOSTON^MA^02108||(617)555-0199\r"
            )
            validation_error = "HL7 Grammatical Ordering Violation: PV1 visit segment received prior to PID patient identification segment in ADT^A01 event"
            source_sys = "Epic_ADT_Gateway"

        elif err_type == "HL7_INVALID_DATE":
            # PID-7 contains an impossible ISO-formatted date (1985-02-31)
            raw_payload = (
                f"MSH|^~\\&|Athena_Bridge|MetroClinic|Synapse_Ingest|CentralCore|{now_ts}||ADT^A08|MSG{random.randint(10000,99999)}|P|2.5.1\r"
                f"EVN|A08|{now_ts}\r"
                f"PID|1||{pid_id}^^^MRN||SMITH^JOHN^A||1985-02-31|M|||450 OAK AVE^^CAMBRIDGE^MA^02138||(617)555-4321\r"
                f"PV1|1|O|CLINIC^EXAM2^METRO||||5678^House^Gregory^Dr|||MED|||||||REG|{visit_id}\r"
            )
            validation_error = "HL7 DataType Error: PID-7 (Date/Time of Birth) contains invalid date format '1985-02-31'; expected YYYYMMDD and day 31 is invalid for February"
            source_sys = "Athena_Ambulatory_Bridge"

        else: # HL7_UNESCAPED_DELIMITER
            raw_payload = (
                f"MSH|^~\\&|Roche_Cobas|LabCentral|Synapse_Ingest|CentralCore|{now_ts}||ORU^R01|MSG{random.randint(10000,99999)}|P|2.5.1\r"
                f"PID|1||{pid_id}^^^MRN||THOMPSON^ALICE||19910920|F\r"
                f"OBR|1|ORD{random.randint(1000,9999)}|LAB{random.randint(1000,9999)}|CBC^Complete Blood Count\r"
                f"OBX|1|NM|WBC^White Blood Count||14.5|10*3/uL|4.5-11.0|H|||F\r"
                f"OBX|2|TX|NOTE^Clinical Note||Specimen hemolyzed | Critical re-draw recommended immediately|||||F\r"
            )
            validation_error = "HL7 Tokenizer Error: OBX-5 contains unescaped field delimiter '|' inside textual observation note, causing segment field count overflow"
            source_sys = "Roche_Cobas_LIS"

    else: # JSON format
        available_json_errors = ["JSON_STRINGIFIED_NUMBERS", "JSON_RENAMED_KEYS", "JSON_CORRUPTED_NESTING", "JSON_INVALID_TIMESTAMP"]
        if err_type == "AUTO" or err_type not in available_json_errors:
            err_type = random.choice(available_json_errors)

        order_id = f"ORD-{random.randint(100000, 999999)}"

        if err_type == "JSON_STRINGIFIED_NUMBERS":
            # Numbers sent as strings, some with currency symbols
            payload_dict = {
                "order_id": order_id,
                "customer_id": f"CUST-{random.randint(1000, 9999)}",
                "status": "PENDING_BILLING",
                "created_at": iso_now,
                "order_items": [
                    {
                        "item_sku": "MED-VENT-901",
                        "quantity": "5",
                        "unit_price": "$450.00",
                        "tax_rate": "0.0825"
                    },
                    {
                        "item_sku": "SURG-GLV-002",
                        "quantity": "24",
                        "unit_price": "18.50",
                        "tax_rate": "0.0825"
                    }
                ],
                "subtotal": "2694.00",
                "total_tax": "$222.25",
                "grand_total": "$2916.25",
                "is_urgent": "true"
            }
            raw_payload = json.dumps(payload_dict, indent=2)
            validation_error = "JSON Schema Type Error: Properties 'quantity', 'unit_price', 'total_tax', and 'is_urgent' violate numeric/boolean types (received string literals with currency prefixes)"
            source_sys = "Shopify_Medical_Webhook"

        elif err_type == "JSON_RENAMED_KEYS":
            # Upstream vendor changed key names in schema v2
            payload_dict = {
                "order_uuid": order_id,
                "client_uuid": f"CLIENT-{random.randint(1000, 9999)}",
                "state": "PROCESSING",
                "timestamp_utc": iso_now,
                "line_items": [
                    {"product_code": "PHARM-AMOX-500", "count": 10, "price": 15.25}
                ],
                "ship_to": {
                    "recipient": "Memorial Clinic",
                    "street": "100 Medical Center Blvd",
                    "city": "Boston",
                    "state": "MA",
                    "postal": "02115"
                }
            }
            raw_payload = json.dumps(payload_dict, indent=2)
            validation_error = "JSON Schema Key Violation: Missing mandatory schema properties ['order_id', 'customer_id', 'order_items', 'shipping_address']; unexpected vendor keys ['order_uuid', 'client_uuid', 'line_items', 'ship_to']"
            source_sys = "Salesforce_Health_API_v2"

        elif err_type == "JSON_INVALID_TIMESTAMP":
            # Timestamp sent as raw epoch milliseconds integer rather than ISO-8601 string
            payload_dict = {
                "order_id": order_id,
                "customer_id": f"CUST-{random.randint(1000, 9999)}",
                "created_at": int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000),
                "order_items": [
                    {"item_sku": "DIAG-STETH-100", "quantity": 2, "unit_price": 89.99}
                ],
                "grand_total": 179.98
            }
            raw_payload = json.dumps(payload_dict, indent=2)
            validation_error = "JSON Schema Format Error: Property 'created_at' expected RFC3339/ISO-8601 string, received integer Unix epoch milliseconds"
            source_sys = "Kafka_CDC_Stream"

        else: # JSON_CORRUPTED_NESTING
            # Array sent as comma-separated string or singleton wrapped
            payload_dict = {
                "order_id": order_id,
                "customer_id": f"CUST-{random.randint(1000, 9999)}",
                "order_items": "MED-VENT-901:5:450.00, SURG-GLV-002:24:18.50",
                "shipping_address": "Memorial Clinic, 100 Medical Center Blvd, Boston, MA 02115"
            }
            raw_payload = json.dumps(payload_dict, indent=2)
            validation_error = "JSON Schema Structural Error: Expected array of objects for 'order_items', received flat comma-delimited string"
            source_sys = "Mirth_Legacy_JSON_Export"

    result = {
        "payloadId": f"SYN-{fmt}-{uuid.uuid4().hex[:8].upper()}",
        "sourceSystem": source_sys,
        "format": fmt,
        "errorType": err_type,
        "validationError": validation_error,
        "rawPayload": raw_payload
    }

    return json.dumps(result)
}

}
