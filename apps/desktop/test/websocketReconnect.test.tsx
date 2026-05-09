import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReconnectableSessionStream } from "../src/hooks/useReconnectableSessionStream";

interface ListenerMap {
  open: Array<() => void>;
  message: Array<(event: { data: string }) => void>;
  close: Array<() => void>;
  error: Array<() => void>;
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  private readonly listeners: ListenerMap = {
    open: [],
    message: [],
    close: [],
    error: []
  };

  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }

  addEventListener<K extends keyof ListenerMap>(type: K, listener: ListenerMap[K][number]): void {
    this.listeners[type].push(listener as never);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    for (const listener of this.listeners.close) {
      listener();
    }
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    for (const listener of this.listeners.open) {
      listener();
    }
  }

  message(payload: unknown): void {
    for (const listener of this.listeners.message) {
      listener({ data: JSON.stringify(payload) });
    }
  }
}

const instances: FakeWebSocket[] = [];
const fakeWebSocketFactory = (url: string): WebSocket => new FakeWebSocket(url) as unknown as WebSocket;

function Harness({ stopped = false }: { stopped?: boolean }) {
  const stream = useReconnectableSessionStream("s1", true, {
    initialDelayMs: 10,
    maxRetries: 2,
    webSocketFactory: fakeWebSocketFactory
  });

  return (
    <div>
      <span data-testid="status">{stream.connectionStatus}</span>
      <span data-testid="count">{stream.metrics.length}</span>
      <button type="button" onClick={stream.stopReconnect}>
        stop
      </button>
      {stopped ? <span>stopped fixture</span> : null}
    </div>
  );
}

afterEach(() => {
  cleanup();
  instances.length = 0;
  vi.useRealTimers();
});

describe("useReconnectableSessionStream", () => {
  it("connects, receives metrics, and reconnects after close", async () => {
    vi.useFakeTimers();
    render(<Harness />);

    expect(instances).toHaveLength(1);
    await act(async () => {
      instances[0]?.open();
      instances[0]?.message({
        type: "metric",
        data: {
          sessionId: "s1",
          timestampMs: 1,
          deviceId: "d1",
          targetId: "t1",
          metricName: "fps",
          value: 60,
          unit: "fps",
          source: "mock",
          precision: "estimated",
          confidence: "high"
        }
      });
    });

    expect(screen.getByTestId("status").textContent).toBe("open");
    expect(screen.getByTestId("count").textContent).toBe("1");

    await act(async () => {
      instances[0]?.close();
    });
    expect(screen.getByTestId("status").textContent).toBe("reconnecting");

    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(instances).toHaveLength(2);
  });

  it("does not reconnect after session_stopped or cleanup", async () => {
    vi.useFakeTimers();
    const rendered = render(<Harness />);
    expect(instances).toHaveLength(1);

    await act(async () => {
      instances[0]?.message({
        type: "session_stopped",
        data: {
          sessionId: "s1"
        }
      });
      instances[0]?.close();
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByTestId("status").textContent).toBe("stopped");
    expect(instances).toHaveLength(1);

    rendered.unmount();
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(instances).toHaveLength(1);
  });
});
