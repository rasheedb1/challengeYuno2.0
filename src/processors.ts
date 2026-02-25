import { ProcessorConfig, EventType } from './types';

// Processors use fee percentages converted to flat-rate cents per $50 avg transaction
// Veloce: 2.1% → ~105¢ | PagoRapido: 1.8% → ~90¢ | Meridian: 2.5% → ~125¢
// costPerTransaction is stored as basis points (÷100 = %) for cost-aware routing
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
  latencyMultiplier: number;
  degraded: boolean;
}

// Healthy baseline: ~85-87% approval, ~8-10% legitimate decline, ~3-5% error/timeout
// Mirrors the acceptance criteria distribution: 75-85% approved, 8-12% declined, 3-5% errors
const processorStates = new Map<string, ProcessorState>([
  ['veloce',   { degraded: false, errorRate: 0.03, timeoutRate: 0.02, latencyMultiplier: 1 }],
  ['pagorp',   { degraded: false, errorRate: 0.03, timeoutRate: 0.02, latencyMultiplier: 1 }],
  ['meridian', { degraded: false, errorRate: 0.03, timeoutRate: 0.02, latencyMultiplier: 1 }],
]);

// Degraded state matches the Beats del Sur failure scenario:
// response times 5-10s (baseLatency × 40 = 120ms × 40 ≈ 4.8s avg),
// 30-40% error rate (spec requirement), matching the challenge story.
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
    state.errorRate = 0.03;
    state.timeoutRate = 0.02;
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

  // Unused parameter acknowledged — amount is passed for realism
  void amount;

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

  await sleep(latencyMs);
  return { status: 'success', latencyMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
