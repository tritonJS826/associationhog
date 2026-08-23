#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.associationhog.parse-and-recheck"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

PLIST_CONTENT="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${SCRIPT_DIR}/parse_and_recheck.sh</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${SCRIPT_DIR}</string>

    <key>StartInterval</key>
    <integer>43200</integer>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>${SCRIPT_DIR}/logs/launchd_stdout.log</string>

    <key>StandardErrorPath</key>
    <string>${SCRIPT_DIR}/logs/launchd_stderr.log</string>
</dict>
</plist>"

is_loaded() {
    launchctl list | grep -q "$PLIST_NAME" 2>/dev/null
}

enable() {
    mkdir -p "$SCRIPT_DIR/logs"
    echo "$PLIST_CONTENT" > "$PLIST_PATH"
    launchctl load "$PLIST_PATH"
    echo "Enabled: parse_and_recheck will run every 12h, after suspend and power on."
    echo "Plist: $PLIST_PATH"
}

disable() {
    if [ -f "$PLIST_PATH" ]; then
        launchctl unload "$PLIST_PATH" 2>/dev/null || true
        rm "$PLIST_PATH"
        echo "Disabled: parse_and_recheck will no longer run automatically."
    else
        echo "Already disabled: no plist found at $PLIST_PATH"
    fi
}

if is_loaded; then
    echo "Currently ENABLED. Disabling..."
    disable
else
    echo "Currently DISABLED. Enabling..."
    enable
fi
