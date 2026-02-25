import express, { Request, Response } from 'express';
import path from 'path';
import { HealthTracker } from './healthTracker';
import { SmartRouter } from './smartRouter';
import { Simulation } from './simulation';
import {
  degradeProcessor,
  restoreProcessor,
  isProcessorDegraded,
  PROCESSOR_CONFIGS,
  PROCESSOR_IDS,
} from './processors';
import {
  ProcessorHealth,
  Transaction,
  Metrics,
  SimulationState,
  ThresholdConfig,
  SseMessage,
  InitialPayload,
} from './types';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Core services ─────────────────────────────────────────────────────────────
const tracker = new HealthTracker(PROCESSOR_IDS);
const router = new SmartRouter(tracker, PROCESSOR_IDS);
const simulation = new Simulation(router, tracker);

// ── SSE infrastructure ────────────────────────────────────────────────────────
const sseClients = new Set<Response>();

function broadcast(message: SseMessage): void {
  const data = `data: ${JSON.stringify(message)}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
}

simulation.on('transaction', (tx: Transaction) =>
  broadcast({ type: 'transaction', payload: tx }),
);
simulation.on('health', (health: ProcessorHealth[]) =>
  broadcast({ type: 'health', payload: health }),
);
simulation.on('metrics', (metrics: Metrics) =>
  broadcast({ type: 'metrics', payload: metrics }),
);
simulation.on('simulation', (state: SimulationState) =>
  broadcast({ type: 'simulation', payload: state }),
);

// ── SSE endpoint ──────────────────────────────────────────────────────────────
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  sseClients.add(res);

  const initial: InitialPayload = {
    health: tracker.getAllHealth(PROCESSOR_IDS),
    transactions: simulation.getRecentTransactions(),
    metrics: simulation.getMetrics(),
    simulation: { running: simulation.isRunning(), startTime: null },
    processors: PROCESSOR_CONFIGS,
    thresholds: tracker.getConfig(),
  };
  const initMessage: SseMessage = { type: 'init', payload: initial };
  res.write(`data: ${JSON.stringify(initMessage)}\n\n`);

  req.on('close', () => sseClients.delete(res));
});

// ── Simulation controls ───────────────────────────────────────────────────────
app.post('/api/simulation/start', (_req: Request, res: Response) => {
  simulation.start();
  res.json({ ok: true });
});

app.post('/api/simulation/stop', (_req: Request, res: Response) => {
  simulation.stop();
  res.json({ ok: true });
});

// ── Processor controls ────────────────────────────────────────────────────────
app.post('/api/processor/:id/degrade', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!PROCESSOR_IDS.includes(id)) {
    res.status(404).json({ error: 'Unknown processor' });
    return;
  }
  degradeProcessor(id);
  broadcast({ type: 'health', payload: tracker.getAllHealth(PROCESSOR_IDS) });
  res.json({ ok: true, degraded: true });
});

app.post('/api/processor/:id/restore', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!PROCESSOR_IDS.includes(id)) {
    res.status(404).json({ error: 'Unknown processor' });
    return;
  }
  restoreProcessor(id);
  broadcast({ type: 'health', payload: tracker.getAllHealth(PROCESSOR_IDS) });
  res.json({ ok: true, degraded: false });
});

app.get('/api/processor/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!PROCESSOR_IDS.includes(id)) {
    res.status(404).json({ error: 'Unknown processor' });
    return;
  }
  res.json({
    health: tracker.getHealth(id),
    degraded: isProcessorDegraded(id),
    override: router.getOverride(id),
  });
});

// ── Manual override ───────────────────────────────────────────────────────────
interface OverrideBody {
  enabled: boolean | null;
}

app.post('/api/processor/:id/override', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!PROCESSOR_IDS.includes(id)) {
    res.status(404).json({ error: 'Unknown processor' });
    return;
  }
  const body = req.body as OverrideBody;
  router.setOverride(id, body.enabled ?? null);
  broadcast({ type: 'health', payload: tracker.getAllHealth(PROCESSOR_IDS) });
  res.json({ ok: true, override: body.enabled });
});

// ── Threshold configuration ───────────────────────────────────────────────────
app.get('/api/thresholds', (_req: Request, res: Response) => {
  res.json(tracker.getConfig());
});

app.put('/api/thresholds', (req: Request, res: Response) => {
  const config = req.body as Partial<ThresholdConfig>;
  tracker.updateConfig(config);
  res.json(tracker.getConfig());
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json(tracker.getAllHealth(PROCESSOR_IDS));
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`\n  Smart Payment Router`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Dashboard → http://localhost:${PORT}`);
  console.log(`  SSE feed  → http://localhost:${PORT}/api/events`);
  console.log(`  Health    → http://localhost:${PORT}/api/health\n`);
});
