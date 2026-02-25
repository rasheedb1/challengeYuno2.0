import React from 'react';
import { ProcessorHealth } from '../types';

interface Props {
  running: boolean;
  degradedProcessors: string[];
  health: ProcessorHealth[];
  onStart: () => void;
  onStop: () => void;
  onDegrade: (id: string) => void;
  onRecover: (id: string) => void;
}

export function ControlPanel({ running, degradedProcessors, health, onStart, onStop, onDegrade, onRecover }: Props) {
  return (
    <div style={{
      background: '#1a1d27',
      border: '1px solid #1e2536',
      borderRadius: 12,
      padding: '20px 24px',
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: running ? '#22c55e' : '#ef4444', boxShadow: running ? '0 0 8px #22c55e' : 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: running ? '#22c55e' : '#ef4444' }}>
          {running ? 'Simulation Running' : 'Simulation Stopped'}
        </span>
      </div>

      {!running ? (
        <button onClick={onStart} style={primaryBtn('#22c55e')}>
          ▶ Start Simulation
        </button>
      ) : (
        <button onClick={onStop} style={primaryBtn('#ef4444')}>
          ■ Stop
        </button>
      )}

      <div style={{ width: 1, height: 28, background: '#1e2536', margin: '0 4px' }} />

      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Degradation:</span>
      {health.map((p) => {
        const isDegraded = degradedProcessors.includes(p.id);
        return isDegraded ? (
          <button key={p.id} onClick={() => onRecover(p.id)} style={primaryBtn('#22c55e')}>
            Recover {shortName(p.name)}
          </button>
        ) : (
          <button key={p.id} onClick={() => onDegrade(p.id)} disabled={!running} style={primaryBtn('#ef4444', !running)}>
            Degrade {shortName(p.name)}
          </button>
        );
      })}
    </div>
  );
}

function shortName(name: string): string {
  if (name.includes('Veloce')) return 'Veloce';
  if (name.includes('PagoRapido')) return 'PagoRapido';
  if (name.includes('Meridian')) return 'Meridian';
  return name.split(' ')[0];
}

function primaryBtn(color: string, disabled = false): React.CSSProperties {
  return {
    background: disabled ? 'transparent' : `${color}20`,
    border: `1px solid ${disabled ? '#2d3344' : `${color}60`}`,
    color: disabled ? '#2d3344' : color,
    borderRadius: 8,
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
  };
}
