# Ritmo — Smart Payment Router

Real-time payment processor routing for the Festival Rush scenario.
Automatically shifts traffic across three processors based on live health metrics —
keeping auth rates high and costs low even when a processor degrades under load.

---

## Quick Start (< 2 minutes)

```bash
npm install
npm run build
npm start
# → http://localhost:3000
```

Or use hot-reload during development:

```bash
npm run dev
# → http://localhost:3000
```

---

## Live Demo Walkthrough

### Normal traffic
1. Open **http://localhost:3000**
2. Click **▶ Start Simulation** — ~3 transactions/second start flowing
3. All 3 processor cards show **green / Healthy**, auth rate stabilises around **85%**
4. The Auth Rate chart fills in over the first ~60 seconds

### Trigger the Festival Rush failure
1. Click **Degrade** on the **Veloce Card Gateway** card
2. Within **5–8 seconds** the card turns yellow (Degraded), then red (Down)
3. Watch the router shift traffic away automatically — Veloce's share drops to near zero
4. The Auth Rate chart holds steady despite the failure (other processors absorb the load)
5. The transaction feed shows a spike of `timeout` and `error` entries on Veloce

### Recovery
1. Click **Restore** on the Veloce card
2. Health improves as the 15-second sliding window refills with clean data (~15–30s)
3. The router resumes sending traffic once the status returns to **Healthy**

### Manual override (stretch goal)
- The **Override** toggle on each card force-enables a processor regardless of health
- Useful for keeping a degraded processor in the pool during partial failures
- Toggle off to return to automatic routing

### Configurable thresholds (stretch goal)
- Click **Edit** next to "Threshold Configuration" to change the detection sensitivity
- Lower the degraded threshold to catch failures earlier; raise it for noisy environments

---

## Architecture

### Smart Routing (`src/smartRouter.ts`)

Weighted-random selection over all available processors. Each processor receives a score:

```
score = successRate × 70  +  latencyScore × 30        (0–100)
latencyScore = max(0, 30 × (1 − avgLatencyMs / 3000))
```

A **cost-aware bonus** adds up to +5 points for cheaper processors, acting as a
tiebreaker when health is equal:

```
bonus = round( (MAX_FEE − processorFee) / MAX_FEE × 5 )
```

PagoRapido (1.80%) receives the full +5 bonus vs Meridian (2.50%), so when all
processors are equally healthy the router naturally routes more volume to the cheapest one.

**Down processors** are excluded entirely.
**Degraded processors** remain in the candidate pool but receive a near-zero score,
so they act as a last-resort backup only.

### Health Tracking (`src/healthTracker.ts`)

15-second sliding window per processor, updated on every transaction:

| Success rate    | Status     |
|-----------------|------------|
| ≥ 92%           | `healthy`  |
| 75% – 92%       | `degraded` |
| < 75%           | `down`     |

**Fast detection**: the last 8 events are also evaluated independently.
The *worse* of the full-window rate and the recent-sample rate is used.
A sudden burst of failures is detected within **5–8 seconds** rather than
waiting for the full 15-second window to roll over.

**Statistical guard**: status thresholds are not applied until at least 6 events
are in the window, preventing false positives on cold-start noise.

Thresholds are configurable at runtime via the dashboard or `PUT /api/thresholds`.

### Degradation Scenario

When a processor is degraded (simulating a festival-hour overload):

| Parameter         | Normal  | Degraded               |
|-------------------|---------|------------------------|
| Error rate        | 3%      | 35%                    |
| Timeout rate      | 2%      | 40% (3s cap per tx)    |
| Latency multiplier| 1×      | 40× (120ms → ~5–7s)   |

This matches the challenge spec of 30–40% error rates and 5–10 second response times.

### Processors

| ID       | Name                  | Fee    | Base Latency |
|----------|-----------------------|--------|--------------|
| veloce   | Veloce Card Gateway   | 2.10%  | 120ms        |
| pagorp   | PagoRapido            | 1.80%  | 180ms        |
| meridian | Meridian Processor    | 2.50%  | 220ms        |

### Real-time Updates

SSE stream at `/api/events` sends a message on every transaction event, plus a full
initial snapshot on connection:

```
event types: init | health | transaction | metrics | simulation
```

The dashboard receives push updates with zero polling — no intervals, no setTimeouts
for data fetching.

---

## API Reference

| Method | Path                            | Description                                  |
|--------|---------------------------------|----------------------------------------------|
| GET    | `/api/events`                   | SSE stream (event-driven, fires per tx)      |
| GET    | `/api/health`                   | All processor health objects                 |
| GET    | `/api/thresholds`               | Current threshold configuration              |
| PUT    | `/api/thresholds`               | Update thresholds at runtime                 |
| POST   | `/api/simulation/start`         | Begin transaction simulation                 |
| POST   | `/api/simulation/stop`          | Halt simulation                              |
| POST   | `/api/processor/:id/degrade`    | Inject failure (35% errors, 40× latency)     |
| POST   | `/api/processor/:id/restore`    | Restore processor to healthy baseline        |
| POST   | `/api/processor/:id/override`   | `{ enabled: true|null }` — force-enable/auto |
| GET    | `/api/processor/:id/status`     | Single-processor health + override state     |

---

## Tech Stack

- **Runtime**: Node.js + TypeScript (`tsc` → `dist/`)
- **Backend**: Express, Server-Sent Events
- **Frontend**: Vanilla JS + SVG (no framework, no bundler required)
- **Data**: In-memory (no database required)
