export type TransactionStatus = 'approved' | 'declined' | 'error';
export type ProcessorStatus = 'healthy' | 'degraded' | 'down';

export interface Processor {
  id: string;
  name: string;
  feePercent: number;
  enabled: boolean;
}

export interface Transaction {
  id: string;
  processorId: string;
  processorName: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  responseTimeMs: number;
  timestamp: number;
  fee: number;
}

export interface ProcessorHealth {
  id: string;
  name: string;
  feePercent: number;
  status: ProcessorStatus;
  successRate: number;
  errorRate: number;
  avgResponseTimeMs: number;
  totalTransactions: number;
  enabled: boolean;
}

export interface AggregatedMetrics {
  overallAuthRate: number;
  totalVolume: number;
  totalTransactions: number;
  transactionsPerSecond: number;
  totalFees: number;
  perProcessor: Record<string, ProcessorMetrics>;
}

export interface ProcessorMetrics {
  processorId: string;
  processorName: string;
  transactionCount: number;
  authRate: number;
  volume: number;
  fees: number;
  avgResponseTimeMs: number;
}

export interface HealthThresholds {
  degradedErrorRate: number;      // e.g. 0.10
  downErrorRate: number;          // e.g. 0.30
  degradedResponseTimeMs: number; // e.g. 2000
  downResponseTimeMs: number;     // e.g. 5000
}

export interface SSEPayload {
  health: ProcessorHealth[];
  recentTransactions: Transaction[];
  metrics: AggregatedMetrics;
}

// Internal sliding-window entry
export interface TransactionRecord {
  timestamp: number;
  status: TransactionStatus;
  responseTimeMs: number;
}
