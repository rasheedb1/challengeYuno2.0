import { ProcessorConfig, EventType } from './types';

export const PROCESSOR_CONFIGS: ProcessorConfig[] = [
  { id: 'veloce',    name: 'Veloce Pay', costPerTransaction: 30, baseLatencyMs: 120 },
  { id: 'stripe',    name: 'Stripe',     costPerTransaction: 29, baseLatencyMs: 180 },
  { id: 'braintree', name: 'Braintree',  costPerTransaction: 25, baseLatencyMs: 240 },
];

export const PROCESSOR_IDS = PROCESSOR_CONFIGS.map((p) => p.id);

export const MAX_COST = Math.max(...PROCESSOR_CONFIGS.map((p) => p.costPerTransaction));

interface ProcessorState {
  errorRate: number;
  timeoutRate: number;
  latencyMultiplier: number;
  degraded: boolean;
}

// Healthy baseline: ~1% combined failure rate, comfortably below the 90% degraded threshold
const processorStates = new Map<string, ProcessorState>([
  ['veloce',    { degraded: false, errorRate: 0.007, timeoutRate: 0.003, latencyMultiplier: 1 }],
  ['stripe',    { degraded: false, errorRate: 0.007, timeoutRate: 0.003, latencyMultiplier: 1 }],
  ['braintree', { degraded: false, errorRate: 0.007, timeoutRate: 0.003, latencyMultiplier: 1 }],
]);

export function degradeProcessor(processorId: string): void {
  const state = processorStates.get(processorId);
  if (state) {
    state.degraded = true;
    state.errorRate = 0.40;
    state.timeoutRate = 0.35;
    state.latencyMultiplier = 4;
  }
}

export function restoreProcessor(processorId: string): void {
  const state = processorStates.get(processorId);
  if (state) {
    state.degraded = false;
    state.errorRate = 0.007;
    state.timeoutRate = 0.003;
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
