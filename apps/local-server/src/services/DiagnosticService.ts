import type { DiagnosticListOptions, DiagnosticRecord, DiagnosticRepository } from "@lumatrace/storage";
import type { AndroidDiagnosticEvent } from "@lumatrace/collectors-android";
import type { PcDiagnosticEvent } from "@lumatrace/collectors-pc";
import type { DiagnosticCreateInput } from "../types";
import { createId } from "../utils/ids";

export class DiagnosticService {
  private readonly repository: DiagnosticRepository;

  constructor(repository: DiagnosticRepository) {
    this.repository = repository;
  }

  create(input: DiagnosticCreateInput): void {
    const record: DiagnosticRecord = {
      id: input.id ?? createId("diag"),
      timestampMs: input.timestampMs ?? Date.now(),
      level: input.level,
      category: input.category,
      message: input.message
    };

    if (input.details !== undefined) {
      record.details = input.details;
    }
    if (input.sessionId !== undefined) {
      record.sessionId = input.sessionId;
    }
    if (input.deviceId !== undefined) {
      record.deviceId = input.deviceId;
    }

    this.repository.create(record);
  }

  createIfMissing(input: DiagnosticCreateInput): void {
    const id = input.id ?? createId("diag");
    if (this.repository.getById(id) !== null) {
      return;
    }
    this.create({ ...input, id });
  }

  createFromAndroidEvent(event: AndroidDiagnosticEvent): void {
    this.createIfMissing({
      id: event.id,
      timestampMs: event.timestampMs,
      level: event.level,
      category: event.category,
      message: event.message,
      ...(event.sessionId === undefined ? {} : { sessionId: event.sessionId }),
      ...(event.deviceId === undefined ? {} : { deviceId: event.deviceId }),
      details: {
        androidCode: event.code,
        targetId: event.targetId,
        packageName: event.packageName,
        pid: event.pid,
        sourceCommand: event.sourceCommand,
        durationMs: event.durationMs,
        sanitizedCommand: event.sanitizedCommand,
        details: event.details,
        tags: event.tags
      }
    });
  }

  createFromPcEvent(event: PcDiagnosticEvent): void {
    this.createIfMissing({
      id: event.id,
      timestampMs: event.timestampMs,
      level: event.level,
      category: `pc:${event.category}`,
      message: event.message,
      ...(event.sessionId === undefined ? {} : { sessionId: event.sessionId }),
      ...(event.deviceId === undefined ? {} : { deviceId: event.deviceId }),
      details: {
        pcCode: event.code,
        targetId: event.targetId,
        pid: event.pid,
        sourceCommand: event.sourceCommand,
        durationMs: event.durationMs,
        details: event.details,
        tags: event.tags
      }
    });
  }

  list(options: DiagnosticListOptions = {}): DiagnosticRecord[] {
    return this.repository.list({
      ...options,
      limit: Math.min(options.limit ?? 100, 1000)
    });
  }

  deleteBySession(sessionId: string): void {
    this.repository.deleteBySession(sessionId);
  }
}
