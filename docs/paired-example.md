# Paired example: one repaired, one quarantined

This worked example answers a review request from [Open Exchange](https://openexchange.intersystems.com/package/SynapseHealer): show two similar-looking failures together, one repaired and one quarantined, with the fields that actually changed and the deciding validation check highlighted.

Both cases are the same medical-supply order that failed inbound JSON schema type checks — stringified quantities, currency-prefixed prices, and a quoted boolean, matching chaos scenario 4 (`JSON_STRINGIFIED_NUMBERS`) in [`Synapse.Adapter.DeadLetterInbound`](../src/cls/Synapse/Adapter/DeadLetterInbound.cls) and runbook `JSON-STRINGIFIED-NUMBERS` in [`Synapse.RAG.SchemaKnowledgeBase`](../src/cls/Synapse/RAG/SchemaKnowledgeBase.cls). The only difference is a trailing comma in Case B.

The branch, confidence, risk, and reasoning below come from the deterministic replay path in `Synapse.Data.AuditTelemetry.RunDeterministicRepairPython`. That is the default (zero-key) engine used by `ExecuteDeterministicReplay`. Governed tool results from `ValidateRepairedPayload` and `CalculateRiskScore` in `Synapse.Agent.HealerTools` are shown separately. Those tools are what the live `%AI.Agent` is instructed to call; replay decides the branch inline and does not invoke them.

The healed JSON and the trailing-comma exception text were produced by running that same Python against the payloads below (CPython 3.13). InterSystems IRIS Embedded Python may word the `json.loads` exception slightly differently; the decision values and reasoning prefix are fixed in the source.

## How the decision is made

1. `SearchRunbookRAG` (or the replay fallback) matches the failure to pattern `JSON-STRINGIFIED-NUMBERS` when the validation error mentions numeric/quantity types or the payload contains `$`.
2. Replay runs the `CAST_NUMERIC_AND_BOOLEAN` repair: `json.loads` the raw body, strip `$` / `€` / `,` from string values, and cast integers, floats, and `"true"` / `"false"` / `"yes"` / `"no"`.
3. **If `json.loads` succeeds**, replay sets `AUTO_HEAL`, risk `LOW`, confidence `0.98`, and emits the healed payload. `Synapse.Process.DeadLetterHealerBP` sends it to `Synapse.Operation.ResubmitDeliveryOp` (`/tmp/synapse/delivered`).
4. **If `json.loads` raises**, replay sets `QUARANTINE`, risk `CRITICAL`, confidence `0.30`, leaves the payload unchanged, and reasons `JSON parse error during numeric casting: …`. The business process sends it to `Synapse.Operation.QuarantineVaultOp` (`/tmp/synapse/quarantine`).

That parse step is the deciding check for this pair. It lives in [`src/cls/Synapse/Data/AuditTelemetry.cls`](../src/cls/Synapse/Data/AuditTelemetry.cls) at the `JSON-STRINGIFIED-NUMBERS` branch of `RunDeterministicRepairPython` (success path, then the `except` that sets `QUARANTINE`).

In live mode, `ValidateRepairedPayload` performs the same `json.loads` on the *proposed* repair and returns `JSON Syntax Error: …` when that text is not valid JSON. The agent instructions in `Synapse.Agent.DeadLetterHealerAgent` route `CRITICAL` risk or an unparseable payload (`confidence < 0.50`) to `QUARANTINE`. `CalculateRiskScore` does **not** parse JSON and is not the deciding check here: if it is called on either raw body below, the `$` plus pattern `JSON-STRINGIFIED-NUMBERS` rule returns `AUTO_HEAL`.

## Case A — repaired (`AUTO_HEAL`)

The inbound message is valid JSON with the wrong types. After the cast, identifiers and status are unchanged; only the numeric and boolean fields change type (and lose the currency prefix). Values themselves are not altered.

**Original (dead-letter ingest)**

```json
{
  "order_id": "ORD-100001",
  "customer_id": "CUST-1001",
  "status": "PENDING_BILLING",
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
```

**Repaired (resubmitted downstream)**

```json
{
  "order_id": "ORD-100001",
  "customer_id": "CUST-1001",
  "status": "PENDING_BILLING",
  "order_items": [
    {
      "item_sku": "MED-VENT-901",
      "quantity": 5,
      "unit_price": 450.0,
      "tax_rate": 0.0825
    },
    {
      "item_sku": "SURG-GLV-002",
      "quantity": 24,
      "unit_price": 18.5,
      "tax_rate": 0.0825
    }
  ],
  "subtotal": 2694.0,
  "total_tax": 222.25,
  "grand_total": 2916.25,
  "is_urgent": true
}
```

**Fields that changed**

| Field | Original | Repaired |
| :--- | :--- | :--- |
| `order_items[0].quantity` | `"5"` (string) | `5` (int) |
| `order_items[0].unit_price` | `"$450.00"` (string) | `450.0` (float) |
| `order_items[0].tax_rate` | `"0.0825"` (string) | `0.0825` (float) |
| `order_items[1].quantity` | `"24"` (string) | `24` (int) |
| `order_items[1].unit_price` | `"18.50"` (string) | `18.5` (float) |
| `order_items[1].tax_rate` | `"0.0825"` (string) | `0.0825` (float) |
| `subtotal` | `"2694.00"` (string) | `2694.0` (float) |
| `total_tax` | `"$222.25"` (string) | `222.25` (float) |
| `grand_total` | `"$2916.25"` (string) | `2916.25` (float) |
| `is_urgent` | `"true"` (string) | `true` (boolean) |

Unchanged: `order_id`, `customer_id`, `status`, and both `item_sku` values.

**Deciding check:** `json.loads` of the original payload **succeeded**, so the `CAST_NUMERIC_AND_BOOLEAN` repair ran to completion.

| | |
| :--- | :--- |
| Why | The body is syntactically valid JSON. Every flagged field is a type/format coercion with no change to the underlying amounts or flag. |
| Replay decision | `AUTO_HEAL`, risk `LOW`, confidence `0.98` |
| Replay reasoning | `Cast stringified numbers, currency prefixes, and boolean strings into canonical numeric/boolean datatypes.` |
| `ValidateRepairedPayload` on the healed body | `valid: true`, `validationDetails: "Payload syntax and schema validation PASSED."` |
| `CalculateRiskScore` | `recommendedBranch: "AUTO_HEAL"`, risk `LOW`, confidence `0.98`, reason: `Syntax-only numeric formatting: String literals cast to canonical numeric types with zero value alteration.` |
| Route | `Synapse.Operation.ResubmitDeliveryOp` |

## Case B — quarantined (`QUARANTINE`)

The payload is the same order as Case A, with one extra trailing comma after `"is_urgent": "true"`. That is enough for `json.loads` to fail, so no field-level repair is attempted and the original body is isolated unchanged.

**Original (dead-letter ingest)** — the added comma is on the `is_urgent` line:

```json
{
  "order_id": "ORD-100001",
  "customer_id": "CUST-1001",
  "status": "PENDING_BILLING",
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
  "is_urgent": "true",
}
```

**Proposed repair:** none. Replay leaves `healedPayload` equal to the raw ingest. No fields change.

**Deciding check:** `json.loads` of the original payload **failed**. The `except` in the `JSON-STRINGIFIED-NUMBERS` branch sets `QUARANTINE` immediately.

| | |
| :--- | :--- |
| Why | The message is not valid JSON, so the caster cannot safely inspect or rewrite fields. Rather than guess, replay isolates the original payload. |
| Replay decision | `QUARANTINE`, risk `CRITICAL`, confidence `0.30` |
| Replay reasoning | `JSON parse error during numeric casting: Illegal trailing comma before end of object: line 22 column 22 (char 470)` |
| `ValidateRepairedPayload` if asked to validate this unrepaired body | `valid: false`, `validationDetails: "JSON Syntax Error: Illegal trailing comma before end of object: line 22 column 22 (char 470)"` |
| `CalculateRiskScore` | Not decisive. Called on the raw text it still returns `AUTO_HEAL` (it never parses the JSON). Replay does not use that recommendation when `json.loads` has already failed. |
| Route | `Synapse.Operation.QuarantineVaultOp` |

The exception wording and the line/column/char values above are from CPython 3.13 against this exact payload. The stable contract from the source is the prefix `JSON parse error during numeric casting:` (replay) or `JSON Syntax Error: ` (`ValidateRepairedPayload`), followed by the runtime's `str(exception)`.

## Where this lives in the code

| What | Where |
| :--- | :--- |
| Pattern id, repair strategy `CAST_NUMERIC_AND_BOOLEAN`, and runbook examples | `Synapse.RAG.SchemaKnowledgeBase.GetCanonicalRunbookData`, pattern `JSON-STRINGIFIED-NUMBERS` |
| Chaos scenario 4 sample shape (stringified `quantity` / `$` prices / `"true"`) | `Synapse.Adapter.DeadLetterInbound.GenerateChaosPayloadJSON`, branch `JSON_STRINGIFIED_NUMBERS` |
| Replay fallback that selects this pattern (`"numeric"` / `"quantity"` in the error, or `$` in the payload) | `Synapse.Data.AuditTelemetry.RunDeterministicRepairPython` |
| **Deciding check** — `json.loads`, then `AUTO_HEAL` or `QUARANTINE` | Same method, `JSON-STRINGIFIED-NUMBERS` branch (`try` / `except`) |
| Live syntax check (`JSON Syntax Error: …`) | `Synapse.Agent.HealerTools.ValidateRepairedPayload` |
| Live risk tool (`AUTO_HEAL` for this pattern when `$` or `amount` is present; does not parse JSON) | `Synapse.Agent.HealerTools.CalculateRiskScore` |
| Agent routing: LOW + confidence `>= 0.85` → `AUTO_HEAL`; CRITICAL or unparseable (`confidence < 0.50`) → `QUARANTINE` | `Synapse.Agent.DeadLetterHealerAgent` instructions |
| Branch to resubmit vs quarantine operations | `Synapse.Process.DeadLetterHealerBP.ProcessDeadLetter` / `OnRequest` |
