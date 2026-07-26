// SSE hook for real-time event streaming (M10)
import { useEffect, useRef, useState, useCallback } from "react";

type SSEOptions = {
  /** Whether to connect immediately (default: true) */
  enabled?: boolean;
  /** Callback when a trace_upserted event is received */
  onTraceUpserted?: (traceId: string) => void;
  /** Callback when connected */
  onConnected?: () => void;
};

type SSEState = {
  isConnected: boolean;
  error: string | null;
};

export function useSSE(options: SSEOptions = {}) {
  const { enabled = true, onTraceUpserted, onConnected } = options;
  const [state, setState] = useState<SSEState>({ isConnected: false, error: null });
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbacksRef = useRef({ onTraceUpserted, onConnected });

  // Keep callbacks ref up to date
  useEffect(() => {
    callbacksRef.current = { onTraceUpserted, onConnected };
  }, [onTraceUpserted, onConnected]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/api/ui/stream", {
      // Note: EventSource doesn't support custom headers,
      // so we rely on cookie auth for the SSE endpoint
    });

    es.onopen = () => {
      setState({ isConnected: true, error: null });
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") {
          callbacksRef.current.onConnected?.();
        } else if (data.type === "trace_upserted") {
          callbacksRef.current.onTraceUpserted?.(data.payload.trace_id);
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    es.onerror = () => {
      setState({ isConnected: false, error: "Connection lost" });
      // EventSource will auto-reconnect
    };

    eventSourceRef.current = es;
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState({ isConnected: false, error: null });
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
  };
}
