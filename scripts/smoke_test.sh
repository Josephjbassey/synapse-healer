#!/usr/bin/env sh
# Runs the Workflow + simulation smoke test inside the running IRIS container.
# Usage: ./scripts/smoke_test.sh [container-name] [namespace]
# Exit code 0 when every check passes.
set -eu
CONTAINER="${1:-synapse-iris}"
NAMESPACE="${2:-SYNAPSE}"

OUT=$(docker exec -i "$CONTAINER" iris session IRIS -U "$NAMESPACE" <<'IRIS'
do ##class(Synapse.Test.WorkflowSmoke).Run()
halt
IRIS
)
echo "$OUT" | grep -E "^(PASS|FAIL)|CHECK" || true
echo "$OUT" | grep -q "ALL CHECKS PASSED"
