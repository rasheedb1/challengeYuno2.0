import React from 'react';
import { ProcessorHealth, ProcessorStatus } from '../types';

const STATUS_CONFIG: Record<ProcessorStatus, { color: string; bg: string; label: string; dot: string }> = {
  healthy:  { color: '#22c55e', bg: 'rgba(34,197,94,0.10)',  label: 'Healthy',  dot: '#22c55e' },
  degraded: { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', label: 'Degraded', dot: '#f59e0b' },
  down:     { color: '#ef4444', bg: 'rgba(239,68,68,0.10)',  label: 'Down',     dot: '#ef4444' },
};

interface Props {
  health: ProcessorHealth;
  isDegraded: boolean;
  onDegrade: () => void;
  onRecover: () => void;
  onToggle: () => void;
  simulationRunning: boolean;
}

export function ProcessorCard({ health, isDegraded, onDegrade, onRecover, onToggle, simulationRunning }: Props) {
  const cfg = STATUS_CONFIG[health.status];
  const isDisabled = !health.enabled;

  return (
    <div style={{
      background: '#1a1d27',
      border: `1px solid ${cfg.color}40`,
      borderRadius: 12,
      padding: '20px 24px',
      flex: 1,
      minWidth: 260,
      transition: 'border-color 0.3s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Processor</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{health.name}</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: cfg.bg,
          border: `1px solid ${cfg.color}60`,
          borderRadius: 20,
          padding: '4px 12px',
          fontSize: 12, fontWeight: 600, color: cfg.color,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: cfg.dot,
            boxShadow: `0 0 6px ${cfg.dot}`,
            animation: health.status === 'healthy' ? 'pulse 2s infinite' : 'none',
          }} />
          {isDisabled ? 'Disabled' : cfg.label}
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Metric label="Success Rate" value={`${(health.successRate * 100).toFixed(1)}%`} color={health.successRate > 0.8 ? '#22c55e' : health.successRate > 0.6 ? '#f59e0b' : '#ef4444'} />
        <Metric label="Error Rate"   value={`${(health.errorRate * 100).toFixed(1)}%`}   color={health.errorRate < 0.1 ? '#22c55e' : health.errorRate < 0.3 ? '#f59e0b' : '#ef4444'} />
        <Metric label="Avg Latency"  value={health.avgResponseTimeMs > 0 ? `${Math.round(health.avgResponseTimeMs)}ms` : '—'} color={health.avgResponseTimeMs < 500 ? '#22c55e' : health.avgResponseTimeMs < 2000 ? '#f59e0b' : '#ef4444'} />
        <Metric label="Fee"          value={`${health.feePercent}%`}                      color="#94a3b8" />
      </div>

      <div style={{ fontSize: 11, color: '#475569', marginBottom: 14 }}>
        {health.totalTransactions} tx in last 15s window
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {simulationRunning && !isDegraded && (
          <button onClick={onDegrade} style={btnStyle('#ef4444')}>Degrade</button>
        )}
        {simulationRunning && isDegraded && (
          <button onClick={onRecover} style={btnStyle('#22c55e')}>Recover</button>
        )}
        <button onClick={onToggle} style={btnStyle(isDisabled ? '#6366f1' : '#64748b')}>
          {isDisabled ? 'Enable' : 'Disable'}
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${color}80`,
    color,
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  };
}
