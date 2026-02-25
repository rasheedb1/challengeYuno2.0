import React from 'react';
import { AggregatedMetrics } from '../types';

interface Props {
  metrics: AggregatedMetrics;
}

export function MetricsBar({ metrics }: Props) {
  const authPct = (metrics.overallAuthRate * 100).toFixed(1);
  const authColor = metrics.overallAuthRate > 0.8 ? '#22c55e' : metrics.overallAuthRate > 0.6 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      display: 'flex',
      gap: 16,
      background: '#1a1d27',
      border: '1px solid #1e2536',
      borderRadius: 12,
      padding: '16px 24px',
      flexWrap: 'wrap',
    }}>
      <Stat label="Auth Rate"     value={`${authPct}%`}         color={authColor} />
      <Divider />
      <Stat label="Total Volume"  value={formatVolume(metrics.totalVolume)}   color="#e2e8f0" />
      <Divider />
      <Stat label="Transactions"  value={metrics.totalTransactions.toLocaleString()} color="#e2e8f0" />
      <Divider />
      <Stat label="Tx / sec"      value={metrics.transactionsPerSecond.toString()} color="#6366f1" />
      <Divider />
      <Stat label="Total Fees"    value={formatVolume(metrics.totalFees)}    color="#94a3b8" />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 100 }}>
      <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, background: '#1e2536', alignSelf: 'stretch' }} />;
}

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
