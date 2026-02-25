import { ProcessorConfig, EventType } from './types';

// Processors use fee percentages converted to basis points (÷100 = %)
// Veloce: 2.1% (210 bps) | PagoRapido: 1.8% (180 bps) | Meridian: 2.5% (250 bps)
export const PROCESSOR_CONFIGS: ProcessorConfig[] = [
  { id: 'veloce',    name: 'Veloce Card Gateway', costPerTransaction: 210, baseLatencyMs: 120 },
  { id: 'pagorp',    name: 'PagoRapido',           costPerTransaction: 180, baseLatencyMs: 180 },
  { id: 'meridian',  name: 'Meridian Processor',   costPerTransaction: 250, baseLatencyMs: 220 },
];

export const PROCESSOR_IDS = PROCESSOR_CONFIGS.map((p) => p.id);

export const MAX_COST = Math.max(...PROCESSOR_CONFIGS.map((p) => p.costPerTransaction));

interface ProcessorState {
  errorRate: number;
  timeoutRate: number;
  declineRate: number;     // business rejections — unchanged by technical degradation
  latencyMultiplier: number;
  degraded: boolean;
}

// Healthy baseline: ~82% approved, ~10% declined (business), ~5% error, ~3% timeout
// Matches acceptance criteria: 75-85% approved, 8-12% declined, 3-5% technical errors
const processorStates = new Map<string, ProcessorState>([
  ['veloce',   { degraded: false, errorRate: 0.05, timeoutRate: 0.03, declineRate: 0.10, latencyMultiplier: 1 }],
  ['pagorp',   { degraded: false, errorRate: 0.05, timeoutRate: 0.03, declineRate: 0.10, latencyMultiplier: 1 }],
  ['meridian', { degraded: false, errorRate: 0.05, timeoutRate: 0.03, declineRate: 0.10, latencyMultiplier: 1 }],
]);

// Degraded state — Beats del Sur failure scenario:
// Response times 5-10s (120ms × 40 ≈ 4.8s avg), 30-40% error rate.
// declineRate stays at 0.10 — business rejections are bank decisions, not processor health.
export function degradeProcessor(processorId: string): void {
  const state = processorStates.get(processorId);
  if (state) {
    state.degraded = true;
    state.errorRate = 0.35;
    state.timeoutRate = 0.40;
    state.latencyMultiplier = 40; // 120ms × 40 = 4.8s avg, up to ~7s with jitter
  }
}

export function restoreProcessor(processorId: string): void {
  const state = processorStates.get(processorId);
  if (state) {
    state.degraded = false;
    state.errorRate = 0.05;
    state.timeoutRate = 0.03;
    state.latencyMultiplier = 1;
  }
}

export function isProcessorDegraded(processorId: string): boolean {
  return processorStates.get(processorId)?.degraded ?? false;
}

export interface TransactionResult {
  status: EventType;
  latencyMs: number;
}

export async function processTransaction(
  processorId: string,
  amount: number,
): Promise<TransactionResult> {
  const config = PROCESSOR_CONFIGS.find((p) => p.id === processorId);
  const state = processorStates.get(processorId);

  if (!config || !state) {
    throw new Error(`Unknown processor: ${processorId}`);
  }

  void amount; // amount is passed for realism; routing could use it for risk scoring

  const baseLatency = config.baseLatencyMs * state.latencyMultiplier;
  const jitter = Math.random() * baseLatency * 0.4;
  const latencyMs = Math.round(baseLatency + jitter);

  const rand = Math.random();

  if (rand < state.timeoutRate) {
    await sleep(Math.min(latencyMs, 3000));
    return { status: 'timeout', latencyMs: 3000 };
  }

  if (rand < state.timeoutRate + state.errorRate) {
    await sleep(latencyMs);
    return { status: 'error', latencyMs };
  }

  // Declined: legitimate bank/risk rejection — fast response, same latency as approval
  if (rand < state.timeoutRate + state.errorRate + state.declineRate) {
    await sleep(latencyMs);
    return { status: 'declined', latencyMs };
  }

  await sleep(latencyMs);
  return { status: 'success', latencyMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
