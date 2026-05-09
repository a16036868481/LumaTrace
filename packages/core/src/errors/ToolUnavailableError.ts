import { CollectorError, type CollectorErrorContext } from "./CollectorError";

export class ToolUnavailableError extends CollectorError {
  readonly toolName: string;

  constructor(toolName: string, message?: string, context: CollectorErrorContext = {}) {
    super(message ?? `${toolName} is unavailable.`, "TOOL_UNAVAILABLE", context);
    this.name = "ToolUnavailableError";
    this.toolName = toolName;
  }
}
