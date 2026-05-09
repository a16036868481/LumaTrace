export interface CommandResult {
  command: string;
  args: readonly string[];
  workingDirectory?: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  startTimeMs: number;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
  maxOutputBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  sanitizedCommand: string;
  sanitizedStdout: string;
  sanitizedStderr: string;
  errorMessage?: string;
}
