import React from 'react';
import { Transaction, TransactionStatus } from '../types';

const STATUS_STYLE: Record<TransactionStatus, React.CSSProperties> = {
  approved: { color: '#22c55e', background: 'rgba(34,197,94,0.10)',  border: '1px solid rgba(34,197,94,0.30)'  },
  declined: { color: '#f59e0b', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)' },
  error:    { color: '#ef4444', background: 'rgba(239,68,68,0.10)',  border: '1px solid rgba(239,68,68,0.30)'  },
};

const PROCESSOR_COLORS: Record<string, string> = {
  veloce:   '#6366f1',
  pagorp:   '#06b6d4',
  meridian: '#a855f7',
};

interface Props {
  transactions: Transaction[];
}

export function TransactionFeed({ transactions }: Props) {
  return (
    <div style={{ background: '#1a1d27', border: '1px solid #1e2536', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #1e2536', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Live Transaction Feed</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>{transactions.length} recent</span>
      </div>

      <div style={{ overflowY: 'auto', maxHeight: 380 }}>
        {transactions.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#475569', fontSize: 14 }}>
            No transactions yet — start the simulation to see live data
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#13151f' }}>
                {['Time', 'Processor', 'Amount', 'Status', 'Latency', 'Fee'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 50).map((tx, i) => (
                <tr
                  key={tx.id}
                  style={{
                    borderTop: '1px solid #1a1d27',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    transition: 'background 0.15s',
                  }}
                >
                  <td style={{ padding: '9px 16px', color: '#64748b' }}>{formatTime(tx.timestamp)}</td>
                  <td style={{ padding: '9px 16px' }}>
                    <span style={{
                      color: PROCESSOR_COLORS[tx.processorId] ?? '#94a3b8',
                      fontWeight: 600,
                    }}>{tx.processorName}</span>
                  </td>
                  <td style={{ padding: '9px 16px', color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                    {tx.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {tx.currency}
                  </td>
                  <td style={{ padding: '9px 16px' }}>
                    <span style={{
                      ...STATUS_STYLE[tx.status],
                      borderRadius: 20,
                      padding: '2px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>{tx.status}</span>
                  </td>
                  <td style={{ padding: '9px 16px', color: tx.responseTimeMs > 2000 ? '#ef4444' : tx.responseTimeMs > 500 ? '#f59e0b' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                    {tx.responseTimeMs}ms
                  </td>
                  <td style={{ padding: '9px 16px', color: '#64748b' }}>
                    ${tx.fee.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-MX', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
