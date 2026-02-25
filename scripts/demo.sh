#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Ritmo Smart Payment Router — Demo Script
#
# Starts the server, opens the dashboard, runs the simulation, and injects
# a degradation scenario so you can observe the routing shift in real time.
#
# Usage: npm run demo
# ──────────────────────────────────────────────────────────────────────────────
set -e

PORT=${PORT:-3000}
BASE="http://localhost:${PORT}"

# ── 1. Kill any stale server on the port ──────────────────────────────────────
lsof -ti ":${PORT}" | xargs kill -9 2>/dev/null || true
sleep 0.3

echo ""
echo "  Ritmo Payment Router — Demo"
echo "  ───────────────────────────────────────────────"

# ── 2. Start server in background ─────────────────────────────────────────────
node dist/server.js &
SERVER_PID=$!
trap "echo '  Stopping server...'; kill ${SERVER_PID} 2>/dev/null; exit" INT TERM EXIT

# ── 3. Wait until server is accepting connections ─────────────────────────────
echo "  Starting server on port ${PORT}..."
for i in $(seq 1 30); do
  if curl -s "${BASE}/api/status" > /dev/null 2>&1; then
    echo "  Server ready."
    break
  fi
  sleep 0.5
done

# ── 4. Open dashboard in browser ──────────────────────────────────────────────
echo ""
echo "  Dashboard: ${BASE}"
open "${BASE}" 2>/dev/null || xdg-open "${BASE}" 2>/dev/null || true

# ── 5. Start simulation ───────────────────────────────────────────────────────
sleep 1
curl -s -X POST "${BASE}/api/simulation/start" > /dev/null
echo "  Simulation started — watch the processor cards fill with data."
echo ""

# ── 6. After 8 seconds, degrade Veloce ───────────────────────────────────────
sleep 8
curl -s -X POST "${BASE}/api/processor/veloce/degrade" > /dev/null
echo "  Veloce DEGRADED — error + timeout rates rising."
echo "  Routing will shift traffic away from Veloce."
echo ""

# ── 7. After 15 seconds, restore Veloce ──────────────────────────────────────
sleep 15
curl -s -X POST "${BASE}/api/processor/veloce/restore" > /dev/null
echo "  Veloce RESTORED — health recovering, routing rebalancing."
echo ""

# ── 8. Keep server alive for manual exploration ───────────────────────────────
echo "  Press Ctrl+C to stop the demo server."
echo ""
wait ${SERVER_PID}
