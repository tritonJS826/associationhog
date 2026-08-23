const MIN_NODE = '22.13.0';

function toParts(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim());
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : [0, 0, 0];
}

function isOlderThan(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

export function assertNodeVersion() {
  const current = process.versions.node;
  if (isOlderThan(toParts(current), toParts(MIN_NODE))) {
    console.error(
      `[node] Node.js >= ${MIN_NODE} is required (built-in node:sqlite).\n` +
      `[node] Detected: v${current}\n` +
      `[node] Upgrade Node.js and try again:\n` +
      `[node]   nvm install 22 && nvm use 22\n` +
      `[node]   brew install node@22   # macOS / Homebrew`
    );
    process.exit(1);
  }
}