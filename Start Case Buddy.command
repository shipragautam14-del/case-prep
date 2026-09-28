#!/bin/bash
# Mac/Linux: double-click to start Case Practice Buddy with the working microphone button.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org (LTS), then double-click this file again."
  read -p "Press Enter to close"; exit 1
fi
if [ ! -d node_modules ]; then echo "First run: installing (about a minute)…"; npm install --no-fund --no-audit || exit 1; fi
if [ -z "$ANTHROPIC_API_KEY" ] && ! grep -q "^ANTHROPIC_API_KEY=." .env 2>/dev/null && ! command -v claude >/dev/null 2>&1; then
  echo "Connecting to Claude (one time): installing Claude Code so the app can use your Claude login…"
  npm install -g @anthropic-ai/claude-code && echo "A browser window will open to sign in to Claude." && claude auth login
fi
( sleep 3; (open "http://localhost:3000" || xdg-open "http://localhost:3000") >/dev/null 2>&1 ) &
echo "Case Practice Buddy is running at http://localhost:3000 — keep this window open while you practise."
npm start
