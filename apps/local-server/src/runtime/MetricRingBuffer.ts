import type { MetricEvent } from "@lumatrace/core";

export class MetricRingBuffer {
  private readonly maxSize: number;
  private readonly buffers = new Map<string, MetricEvent[]>();

  constructor(maxSize = 1000) {
    this.maxSize = Math.max(1, maxSize);
  }

  push(event: MetricEvent): void {
    const buffer = this.buffers.get(event.sessionId) ?? [];
    buffer.push(event);
    if (buffer.length > this.maxSize) {
      buffer.splice(0, buffer.length - this.maxSize);
    }
    this.buffers.set(event.sessionId, buffer);
  }

  getRecent(sessionId: string, limit = this.maxSize): MetricEvent[] {
    const buffer = this.buffers.get(sessionId) ?? [];
    return buffer.slice(Math.max(0, buffer.length - limit));
  }

  getAll(sessionId: string): MetricEvent[] {
    return [...(this.buffers.get(sessionId) ?? [])];
  }

  clear(sessionId: string): void {
    this.buffers.delete(sessionId);
  }

  size(sessionId?: string): number {
    if (sessionId !== undefined) {
      return this.buffers.get(sessionId)?.length ?? 0;
    }

    let total = 0;
    for (const buffer of this.buffers.values()) {
      total += buffer.length;
    }
    return total;
  }
}
