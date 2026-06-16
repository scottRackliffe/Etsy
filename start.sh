#!/bin/bash
# Start the Etsy Sales Manager dev server and open it in Chrome

cd "$(dirname "$0")"

# Check if the dev server is already running on port 3000
if ! lsof -i :3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting dev server..."
  npm run dev &
  # Wait for it to be ready
  while ! curl -s http://localhost:3000 >/dev/null 2>&1; do
    sleep 1
  done
  echo "Dev server is up."
else
  echo "Dev server already running."
fi

# Open in Chrome
open -a "Google Chrome" http://localhost:3000
