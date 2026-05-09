import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import { sanitizeCommandLog, sanitizeCommandParts, type SanitizeCommandLogOptions } from "./sanitizeCommandLog";
import type { CommandResult } from "./CommandResult";

export interface CommandRunnerOptions extends SanitizeCommandLogOptions {
  command: string;
  args?: readonly string[];
  timeoutMs: number;
  workingDirectory?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  maxOutputBytes?: number;
}

interface OutputCapture {
  chunks: Buffer[];
  bytes: number;
  truncated: boolean;
}

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

function createCapture(): OutputCapture {
  return {
    chunks: [],
    bytes: 0,
    truncated: false
  };
}

function appendOutput(capture: OutputCapture, chunk: Buffer, maxOutputBytes: number): void {
  if (capture.bytes >= maxOutputBytes) {
    capture.truncated = true;
    return;
  }

  const remaining = maxOutputBytes - capture.bytes;
  if (chunk.length <= remaining) {
    capture.chunks.push(chunk);
    capture.bytes += chunk.length;
    return;
  }

  capture.chunks.push(chunk.subarray(0, remaining));
  capture.bytes += remaining;
  capture.truncated = true;
}

function captureToString(capture: OutputCapture): string {
  return Buffer.concat(capture.chunks).toString("utf8");
}

function buildSpawnOptions(options: CommandRunnerOptions): SpawnOptionsWithoutStdio {
  const spawnOptions: SpawnOptionsWithoutStdio = {
    shell: false,
    windowsHide: true
  };

  if (options.workingDirectory !== undefined) {
    spawnOptions.cwd = options.workingDirectory;
  }
  if (options.env !== undefined) {
    spawnOptions.env = options.env;
  }

  return spawnOptions;
}

export class CommandRunner {
  async run(options: CommandRunnerOptions): Promise<CommandResult> {
    const startedAt = Date.now();
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const stdout = createCapture();
    const stderr = createCapture();
    const args = [...(options.args ?? [])];
    const sanitizedCommand = sanitizeCommandParts(options.command, args, options);

    let child: ChildProcessWithoutNullStreams | undefined;
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let spawnError: Error | undefined;

    return new Promise<CommandResult>((resolve) => {
      const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutHandle);
        options.signal?.removeEventListener("abort", onAbort);

        const rawStdout = captureToString(stdout);
        const rawStderr = captureToString(stderr);
        const durationMs = Date.now() - startedAt;
        const errorMessage = spawnError?.message;

        const result: CommandResult = {
          command: options.command,
          args,
          stdout: rawStdout,
          stderr: rawStderr,
          exitCode,
          signal,
          startTimeMs: startedAt,
          durationMs,
          timedOut,
          aborted,
          maxOutputBytes,
          stdoutTruncated: stdout.truncated,
          stderrTruncated: stderr.truncated,
          sanitizedCommand,
          sanitizedStdout: sanitizeCommandLog(rawStdout, options),
          sanitizedStderr: sanitizeCommandLog(rawStderr || errorMessage || "", options)
        };

        if (options.workingDirectory !== undefined) {
          result.workingDirectory = options.workingDirectory;
        }
        if (errorMessage !== undefined) {
          result.errorMessage = errorMessage;
        }

        resolve(result);
      };

      const killChild = (): void => {
        if (child !== undefined && !child.killed) {
          child.kill("SIGTERM");
        }
      };

      const onAbort = (): void => {
        aborted = true;
        killChild();
      };

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        killChild();
      }, options.timeoutMs);

      if (options.signal?.aborted === true) {
        aborted = true;
        clearTimeout(timeoutHandle);
        finish(null, null);
        return;
      }

      options.signal?.addEventListener("abort", onAbort, { once: true });

      try {
        child = spawn(options.command, args, buildSpawnOptions(options));
      } catch (error) {
        spawnError = error instanceof Error ? error : new Error(String(error));
        clearTimeout(timeoutHandle);
        finish(null, null);
        return;
      }

      child.stdout.on("data", (chunk: Buffer) => appendOutput(stdout, chunk, maxOutputBytes));
      child.stderr.on("data", (chunk: Buffer) => appendOutput(stderr, chunk, maxOutputBytes));
      child.on("error", (error) => {
        spawnError = error;
      });
      child.on("close", (exitCode, signal) => finish(exitCode, signal));
    });
  }
}
