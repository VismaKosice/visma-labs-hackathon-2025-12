#!/usr/bin/env bash
#
# serve.sh -- Serve the leaderboard UI with result JSON files.
#
# This starts a simple HTTP server that serves both the leaderboard HTML page
# and the JSON result files (including leaderboard.json) from a single origin.
#
# Usage:
#   ./serve.sh                          # Serve demo data on port 3000
#   ./serve.sh --results ~/results      # Serve real results on port 3000
#   ./serve.sh --port 80                # Serve on port 80 (may need sudo)
#
set -euo pipefail

PORT=3000
RESULTS_DIR=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Serve the leaderboard UI + result JSON files via HTTP.

Options:
  --results <dir>    Directory containing result JSON files and leaderboard.json
                     (default: serve demo data from ./demo/)
  --port <port>      Port to listen on (default: 3000)
  -h, --help         Show this help

Examples:
  $(basename "$0")                              # Demo mode on :3000
  $(basename "$0") --results ~/results          # Real results
  $(basename "$0") --results ~/results --port 80  # Production (needs sudo for port 80)

The server makes index.html available at the root and leaderboard.json + team
result files available under the same origin, avoiding CORS issues.

EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --results)  RESULTS_DIR="$2"; shift 2 ;;
        --port)     PORT="$2"; shift 2 ;;
        -h|--help)  usage ;;
        *)          echo "Unknown option: $1"; usage ;;
    esac
done

# Default to demo data if no results directory specified
if [[ -z "$RESULTS_DIR" ]]; then
    RESULTS_DIR="$SCRIPT_DIR/demo"
    echo "No --results directory specified. Using demo data from $RESULTS_DIR"
fi

if [[ ! -d "$RESULTS_DIR" ]]; then
    echo "ERROR: Results directory not found: $RESULTS_DIR"
    exit 1
fi

# Try Node.js first (better CORS handling), fall back to Python
if command -v node &>/dev/null; then
    echo ""
    echo "Leaderboard: http://localhost:$PORT"
    echo "Data source: $RESULTS_DIR"
    echo ""
    echo "Press Ctrl+C to stop."
    echo ""

    node -e "
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = $PORT;
const HTML_DIR = '$SCRIPT_DIR';
const DATA_DIR = '$RESULTS_DIR';

const MIME = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  // Serve HTML from leaderboard dir, JSON from results dir
  let filePath;
  if (url.endsWith('.json')) {
    filePath = path.join(DATA_DIR, path.basename(url));
  } else {
    filePath = path.join(HTML_DIR, url.slice(1));
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});
"
elif command -v python3 &>/dev/null; then
    echo ""
    echo "Leaderboard: http://localhost:$PORT"
    echo "Data source: $RESULTS_DIR"
    echo "(Using Python fallback — copy index.html into results dir)"
    echo ""

    # Python simple server needs all files in one directory
    cp "$SCRIPT_DIR/index.html" "$RESULTS_DIR/index.html"
    echo "Press Ctrl+C to stop."
    echo ""

    cd "$RESULTS_DIR"
    python3 -m http.server "$PORT"
else
    echo "ERROR: Neither Node.js nor Python 3 found. Install one to serve the leaderboard."
    exit 1
fi
