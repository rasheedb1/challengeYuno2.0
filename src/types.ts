export type ProcessorStatus = 'healthy' | 'degraded' | 'down';

export type EventType = 'success' | 'error' | 'timeout';

export interface ProcessorConfig {
  id: string;
  name: string;
  costPerTransaction: number; // basis points (÷100 = fee %). e.g. 210 = 2.10%
  baseLatencyMs: number;
}

export interface WindowEvent {
  timestamp: number;
  type: EventType;
  latencyMs: number;
}

export interface ProcessorHealth {
  processorId: string;
  successRate: number;
  errorRate: number;
  timeoutRate: number;
  avgLatencyMs: number;
  totalRequests: number;
  status: ProcessorStatus;
  score: number; // 0–100
  lastUpdated: number;
}

export interface Transaction {
  id: string;
  processorId: string;
  amount: number;          // cents (USD)
  status: EventType;
  latencyMs: number;
  timestamp: number;
  feeBps: number;          // fee in basis points for this processor
  costSavedBps: number;    // fee saved vs most expensive processor, in basis points
}

export interface Metrics {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  authRate: number;           // successfulTransactions / totalTransactions (0–1)
  totalCostSavedUsd: number;  // total USD saved via cost-aware routing
  avgLatencyMs: number;
  transactionsPerSecond: number;
}

export interface SimulationState {
  running: boolean;
  startTime: number | null;
}

export interface ThresholdConfig {
  windowSizeMs: number;
  degradedThreshold: number; // success rate below this → degraded
  downThreshold: number;     // success rate below this → down
  recentSampleSize: number;  // last N events for fast detection
  minSamples: number;        // minimum events before applying status thresholds
}

export interface InitialPayload {
  health: ProcessorHealth[];
  transactions: Transaction[];
  metrics: Metrics;
  simulation: SimulationState;
  processors: ProcessorConfig[];
  thresholds: ThresholdConfig;
}

export interface SseMessage {
  type: 'init' | 'health' | 'transaction' | 'metrics' | 'simulation';
  payload: InitialPayload | ProcessorHealth[] | Transaction | Metrics | SimulationState;
}
