import express, { Request, Response } from 'express';
import cors from 'cors';
import { HealthTracker } from './healthTracker';
import { SmartRouter } from './smartRouter';
import { TransactionSimulator, PROCESSORS } from './simulator';
import { AggregatedMetrics, ProcessorHealth, SSEPayload } from './types';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// ── Core singletons ────────────────────────────────────────────────────────
const healthTracker = new HealthTracker();
const smartRouter = new SmartRouter();
const simulator = new TransactionSimulator(healthTracker, smartRouter);

// ── SSE client management ──────────────────────────────────────────────────
const sseClients = new Set<Response>();

function broadcastSSE(payload: SSEPayload): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
}

// Push a snapshot every 500ms regardless of transaction activity
setInterval(() => {
  if (sseClients.size === 0) return;
  broadcastSSE(buildPayload());
}, 500);

// ── Helper builders ────────────────────────────────────────────────────────
function buildPayload(): SSEPayload {
  return {
    health: healthTracker.getAllHealth(PROCESSORS),
    recentTransactions: simulator.getRecentTransactions(),
    metrics: buildMetrics(),
  };
}

function buildMetrics(): AggregatedMetrics {
  const transactions = simulator.getRecentTransactions();
  const now = Date.now();
  const oneSecAgo = now - 1000;

  const total = transactions.length;
  const approved = transactions.filter((t) => t.status === 'approved').length;
  const totalVolume = transactions.reduce((s, t) => s + t.amount, 0);
  const totalFees = transactions.reduce((s, t) => s + t.fee, 0);
  const recentTxCount = transactions.filter((t) => t.timestamp >= oneSecAgo).length;

  const perProcessor: AggregatedMetrics['perProcessor'] = {};
  for (const p of PROCESSORS) {
    const ptxs = transactions.filter((t) => t.processorId === p.id);
    const pApproved = ptxs.filter((t) => t.status === 'approved').length;
    const pVolume = ptxs.reduce((s, t) => s + t.amount, 0);
    const pFees = ptxs.reduce((s, t) => s + t.fee, 0);
    const pAvgRt =
      ptxs.length > 0
        ? ptxs.reduce((s, t) => s + t.responseTimeMs, 0) / ptxs.length
        : 0;

    perProcessor[p.id] = {
      processorId: p.id,
      processorName: p.name,
      transactionCount: ptxs.length,
      authRate: ptxs.length > 0 ? pApproved / ptxs.length : 0,
      volume: pVolume,
      fees: pFees,
      avgResponseTimeMs: Math.round(pAvgRt),
    };
  }

  return {
    overallAuthRate: total > 0 ? approved / total : 0,
    totalVolume,
    totalTransactions: total,
    transactionsPerSecond: recentTxCount,
    totalFees,
    perProcessor,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────

/** SSE endpoint — clients connect here for real-time updates */
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  // Send current state immediately on connect
  res.write(`data: ${JSON.stringify(buildPayload())}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  const health: ProcessorHealth[] = healthTracker.getAllHealth(PROCESSORS);
  res.json({ processors: health, running: simulator.isRunning() });
});

app.get('/api/transactions', (_req: Request, res: Response) => {
  res.json({ transactions: simulator.getRecentTransactions() });
});

app.get('/api/metrics', (_req: Request, res: Response) => {
  res.json(buildMetrics());
});

app.post('/api/simulate/start', (_req: Request, res: Response) => {
  simulator.start();
  res.json({ ok: true, running: true });
});

app.post('/api/simulate/stop', (_req: Request, res: Response) => {
  simulator.stop();
  res.json({ ok: true, running: false });
});

app.post('/api/simulate/degrade/:processorId', (req: Request, res: Response) => {
  const { processorId } = req.params;
  const exists = PROCESSORS.find((p) => p.id === processorId);
  if (!exists) { res.status(404).json({ error: 'Unknown processor' }); return; }
  simulator.degrade(processorId);
  res.json({ ok: true, degraded: simulator.getDegradedProcessors() });
});

app.post('/api/simulate/recover/:processorId', (req: Request, res: Response) => {
  const { processorId } = req.params;
  const exists = PROCESSORS.find((p) => p.id === processorId);
  if (!exists) { res.status(404).json({ error: 'Unknown processor' }); return; }
  simulator.recover(processorId);
  res.json({ ok: true, degraded: simulator.getDegradedProcessors() });
});

/** Stretch: manual override toggle */
app.post('/api/processors/:id/toggle', (req: Request, res: Response) => {
  const { id } = req.params;
  const exists = PROCESSORS.find((p) => p.id === id);
  if (!exists) { res.status(404).json({ error: 'Unknown processor' }); return; }

  const currentOverride = smartRouter.getOverride(id);
  // Toggle: if currently forced-enabled or no override, disable; if disabled, re-enable
  const newState = currentOverride === false ? true : false;
  smartRouter.setOverride(id, newState);
  res.json({ ok: true, processorId: id, enabled: newState, overrides: smartRouter.getAllOverrides() });
});

/** Stretch: update health thresholds at runtime */
app.post('/api/config/thresholds', (req: Request, res: Response) => {
  healthTracker.updateThresholds(req.body);
  res.json({ ok: true, thresholds: healthTracker.getThresholds() });
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Ritmo] Backend running on http://localhost:${PORT}`);
  console.log(`[Ritmo] SSE stream: http://localhost:${PORT}/api/events`);
});
