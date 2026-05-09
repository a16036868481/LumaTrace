export interface CollectorErrorContext {
  collectorId?: string;
  deviceId?: string;
  targetId?: string;
  sessionId?: string;
  metricName?: string;
}

export class CollectorError extends Error {
  readonly code: string;
  readonly context: CollectorErrorContext;

  constructor(message: string, code = "COLLECTOR_ERROR", context: CollectorErrorContext = {}) {
    super(message);
    this.name = "CollectorError";
    this.code = code;
    this.context = context;
  }
}
