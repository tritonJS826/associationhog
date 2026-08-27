#!/bin/bash
#
# This script is for automatical parsing. Used by toggle toggle_automatically_launch_parse_and_recheck.sh 
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/parse_and_recheck_$(date +%Y%m%d_%H%M%S).log"

echo "=== parse_and_recheck started at $(date) ===" | tee -a "$LOG_FILE"

cd "$SCRIPT_DIR"

echo "--- Running start (recheck -> parse -> enrich-with-web -> enrich-with-llm) ---" | tee -a "$LOG_FILE"
make start >> "$LOG_FILE" 2>&1

echo "=== parse_and_recheck finished at $(date) ===" | tee -a "$LOG_FILE"

find "$LOG_DIR" -name "parse_and_recheck_*.log" -mtime +7 -delete 2>/dev/null || true
