import { useEffect, useRef, useState } from 'react';
import { SSEPayload } from '../types';

const API_BASE = 'http://localhost:3001';

export function useSSE() {
  const [data, setData] = useState<SSEPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource(`${API_BASE}/api/events`);
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.onmessage = (e) => {
        try {
          const payload: SSEPayload = JSON.parse(e.data);
          setData(payload);
        } catch {
          // ignore malformed messages
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Reconnect after 2s
        setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      esRef.current?.close();
    };
  }, []);

  return { data, connected };
}

// ── REST helpers ────────────────────────────────────────────────────────────
export async function apiPost(path: string): Promise<void> {
  await fetch(`${API_BASE}${path}`, { method: 'POST' });
}
