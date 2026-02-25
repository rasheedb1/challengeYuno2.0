import React, { useState } from 'react';
import { useSSE, apiPost } from './hooks/useSSE';
import { ProcessorCard } from './components/ProcessorCard';
import { MetricsBar } from './components/MetricsBar';
import { TransactionFeed } from './components/TransactionFeed';
import { ControlPanel } from './components/ControlPanel';
import { AggregatedMetrics, ProcessorHealth } from './types';

const EMPTY_METRICS: AggregatedMetrics = {
  overallAuthRate: 0,
  totalVolume: 0,
  totalTransactions: 0,
  transactionsPerSecond: 0,
  totalFees: 0,
  perProcessor: {},
};

const EMPTY_HEALTH: ProcessorHealth[] = [
  { id: 'veloce',   name: 'Veloce Card Gateway', feePercent: 2.1, status: 'healthy', successRate: 0, errorRate: 0, avgResponseTimeMs: 0, totalTransactions: 0, enabled: true },
  { id: 'pagorp',   name: 'PagoRapido',           feePercent: 1.8, status: 'healthy', successRate: 0, errorRate: 0, avgResponseTimeMs: 0, totalTransactions: 0, enabled: true },
  { id: 'meridian', name: 'Meridian Processor',   feePercent: 2.5, status: 'healthy', successRate: 0, errorRate: 0, avgResponseTimeMs: 0, totalTransactions: 0, enabled: true },
];

export default function App() {
  const { data, connected } = useSSE();
  const [running, setRunning] = useState(false);
  const [degradedProcessors, setDegradedProcessors] = useState<string[]>([]);

  const health = data?.health ?? EMPTY_HEALTH;
  const transactions = data?.recentTransactions ?? [];
  const metrics = data?.metrics ?? EMPTY_METRICS;

  async function handleStart() {
    await apiPost('/api/simulate/start');
    setRunning(true);
  }

  async function handleStop() {
    await apiPost('/api/simulate/stop');
    setRunning(false);
  }

  async function handleDegrade(id: string) {
    await apiPost(`/api/simulate/degrade/${id}`);
    setDegradedProcessors((prev) => [...prev.filter((x) => x !== id), id]);
  }

  async function handleRecover(id: string) {
    await apiPost(`/api/simulate/recover/${id}`);
    setDegradedProcessors((prev) => prev.filter((x) => x !== id));
  }

  async function handleToggle(id: string) {
    await apiPost(`/api/processors/${id}/toggle`);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', padding: '24px 32px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
              <span style={{ color: '#6366f1' }}>Ritmo</span> Payment Router
            </h1>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              Smart routing · Real-time health monitoring · Latin America
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: connected ? '#22c55e' : '#ef4444',
              boxShadow: connected ? '0 0 8px #22c55e' : 'none',
            }} />
            <span style={{ fontSize: 12, color: connected ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
              {connected ? 'Live' : 'Reconnecting…'}
            </span>
          </div>
        </div>
      </header>

      {/* Control Panel */}
      <section style={{ marginBottom: 20 }}>
        <ControlPanel
          running={running}
          degradedProcessors={degradedProcessors}
          health={health}
          onStart={handleStart}
          onStop={handleStop}
          onDegrade={handleDegrade}
          onRecover={handleRecover}
        />
      </section>

      {/* Processor Health Cards */}
      <section style={{ marginBottom: 20 }}>
        <SectionLabel>Processor Health</SectionLabel>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {health.map((h) => (
            <ProcessorCard
              key={h.id}
              health={h}
              isDegraded={degradedProcessors.includes(h.id)}
              onDegrade={() => handleDegrade(h.id)}
              onRecover={() => handleRecover(h.id)}
              onToggle={() => handleToggle(h.id)}
              simulationRunning={running}
            />
          ))}
        </div>
      </section>

      {/* Metrics Bar */}
      <section style={{ marginBottom: 20 }}>
        <SectionLabel>Aggregate Metrics</SectionLabel>
        <MetricsBar metrics={metrics} />
      </section>

      {/* Transaction Feed */}
      <section>
        <SectionLabel>Live Transactions</SectionLabel>
        <TransactionFeed transactions={transactions} />
      </section>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f1117; }
        ::-webkit-scrollbar-thumb { background: #2d3344; border-radius: 3px; }
      `}</style>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
      {children}
    </div>
  );
}
