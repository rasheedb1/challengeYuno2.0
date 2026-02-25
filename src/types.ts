export type ProcessorStatus = 'healthy' | 'degraded' | 'down';

export type EventType = 'success' | 'error' | 'timeout';

export interface ProcessorConfig {
  id: string;
  name: string;
  costPerTransaction: number; // cents
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
  amount: number;        // cents
  status: EventType;
  latencyMs: number;
  timestamp: number;
  costSaved: number;     // cents vs most expensive processor
}

export interface Metrics {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalCostSaved: number; // cents
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
