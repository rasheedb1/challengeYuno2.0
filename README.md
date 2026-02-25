# Ritmo — Smart Payment Router

Real-time payment processor routing for Latin American ticketing platforms.
Routes transactions intelligently across 3 payment processors based on live health metrics.

---

## Quick Start (< 2 minutes)

### 1. Install dependencies

```bash
# Backend
cd backend && npm install

# Frontend (new terminal)
cd frontend && npm install
```

### 2. Start the backend

```bash
cd backend
npm run dev
# → http://localhost:3001
```

### 3. Start the frontend

```bash
cd frontend
npm run dev
# → http://localhost:5173
```

### 4. Open the dashboard

Navigate to **http://localhost:5173**

---

## Live Demo Walkthrough

### Normal traffic
1. Click **▶ Start Simulation** — transactions begin flowing at ~15/sec
2. All 3 processors show **green / Healthy**
3. Auth rate stabilises around **85%**

### Trigger degradation
1. Click **Degrade Veloce** (or any processor) in the Control Panel
2. Within ~10 seconds the processor card turns **yellow → red**
3. Watch the router shift traffic away from the degraded processor automatically
4. The transaction feed shows increased error counts on that processor

### Recovery
1. Click **Recover [Processor]**
2. Health improves as the sliding window fills with clean data (~15–30s)
3. Router resumes sending traffic once status returns to **Healthy**

### Manual override (stretch goal)
- The **Disable** button on each processor card forces the router to skip it entirely
- Re-click **Enable** to restore it

---

## Architecture

### Smart Routing (`backend/src/smartRouter.ts`)

Each processor receives a score computed per transaction:

```
score = (successRate × 0.7) − (avgResponseTimeMs / 10 000 × 0.3)
```

| Status   | Multiplier | Effect                             |
|----------|-----------|------------------------------------|
| healthy  | 1.0       | Full score                         |
| degraded | 0.4       | Heavily penalised — backup only    |
| down     | —         | Excluded entirely                  |

**Cost-aware tiebreaker**: when scores are within 0.01 of each other,
the processor with the lower fee wins (PagoRapido at 1.8%).

### Health Tracking (`backend/src/healthTracker.ts`)

60-second sliding window per processor.

| Condition                           | Status     |
|-------------------------------------|------------|
| errorRate ≥ 30% OR latency ≥ 5 000ms | `down`   |
| errorRate ≥ 10% OR latency ≥ 2 000ms | `degraded`|
| otherwise                           | `healthy`  |

Thresholds are configurable at runtime via `POST /api/config/thresholds`.

### Real-time Updates

SSE stream at `/api/events` pushes a JSON snapshot every **500ms**:
```json
{
  "health": [...],
  "recentTransactions": [...],
  "metrics": { ... }
}
```

### Processors

| ID        | Name                  | Fee   |
|-----------|-----------------------|-------|
| veloce    | Veloce Card Gateway   | 2.1%  |
| pagorp    | PagoRapido            | 1.8%  |
| meridian  | Meridian Processor    | 2.5%  |

---

## API Reference

| Method | Path                                   | Description                    |
|--------|----------------------------------------|--------------------------------|
| GET    | `/api/health`                          | All processor health statuses  |
| GET    | `/api/transactions`                    | Last 100 transactions          |
| GET    | `/api/metrics`                         | Aggregated metrics             |
| GET    | `/api/events`                          | SSE stream (500ms interval)    |
| POST   | `/api/simulate/start`                  | Start traffic simulation       |
| POST   | `/api/simulate/stop`                   | Stop simulation                |
| POST   | `/api/simulate/degrade/:processorId`   | Trigger processor degradation  |
| POST   | `/api/simulate/recover/:processorId`   | Recover processor              |
| POST   | `/api/processors/:id/toggle`           | Enable/disable processor       |
| POST   | `/api/config/thresholds`               | Update health thresholds       |

---

## Tech Stack

- **Backend**: Node.js · Express · TypeScript · tsx (hot reload)
- **Frontend**: React 18 · TypeScript · Vite
- **Real-time**: Server-Sent Events (SSE)
- **Data**: In-memory (no database required)
