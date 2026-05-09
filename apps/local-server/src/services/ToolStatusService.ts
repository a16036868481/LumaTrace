import type { ToolStatus } from "@lumatrace/core";
import type { ToolStatusRepository } from "@lumatrace/storage";

const DEFAULT_TOOL_STATUS: readonly ToolStatus[] = [
  {
    toolName: "adb",
    status: "unknown",
    reason: "MVP-A does not run real tool detection.",
    suggestedAction: "Tool detection starts in later milestones."
  },
  {
    toolName: "xcrun",
    status: "unknown",
    reason: "MVP-A does not run real tool detection.",
    suggestedAction: "Xcode-based detection starts in later milestones."
  },
  {
    toolName: "xctrace",
    status: "unknown",
    reason: "MVP-A does not run real tool detection.",
    suggestedAction: "Xcode-based detection starts in later milestones."
  },
  {
    toolName: "ideviceinfo",
    status: "unknown",
    reason: "MVP-A does not run real tool detection.",
    suggestedAction: "libimobiledevice detection starts in later milestones."
  },
  {
    toolName: "PresentMon",
    status: "unknown",
    reason: "MVP-A does not run real tool detection.",
    suggestedAction: "PresentMon detection starts in later milestones."
  }
];

export class ToolStatusService {
  private readonly repository: ToolStatusRepository;

  constructor(repository: ToolStatusRepository) {
    this.repository = repository;
  }

  listToolStatus(): ToolStatus[] {
    for (const status of DEFAULT_TOOL_STATUS) {
      if (this.repository.get(status.toolName) === null) {
        this.repository.upsert(status);
      }
    }
    return this.repository.list();
  }
}
