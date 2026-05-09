import type { DiagnosticRecord } from "@lumatrace/storage";
import type { DeviceService } from "./DeviceService";
import type { DiagnosticService } from "./DiagnosticService";

export class AndroidDiagnosticsService {
  private readonly deviceService: DeviceService;
  private readonly diagnosticService: DiagnosticService;

  constructor(options: { deviceService: DeviceService; diagnosticService: DiagnosticService }) {
    this.deviceService = options.deviceService;
    this.diagnosticService = options.diagnosticService;
  }

  syncSession(sessionId: string): DiagnosticRecord[] {
    for (const event of this.deviceService.listAndroidDiagnostics({ sessionId })) {
      this.diagnosticService.createFromAndroidEvent(event);
    }
    return this.diagnosticService.list({ sessionId, limit: 1000 });
  }
}
