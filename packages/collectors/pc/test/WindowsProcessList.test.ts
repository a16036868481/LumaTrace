import { describe, expect, it } from "vitest";
import { parsePowerShellProcessJson, parseTasklistCsv, processToTarget, WindowsProcessList } from "../src";
import type { CommandResult, CommandRunnerOptions } from "@lumatrace/core";
import { readPcFixture } from "./fixture";

function commandResult(overrides: Partial<CommandResult>): CommandResult {
  return {
    command: overrides.command ?? "fake.exe",
    args: overrides.args ?? [],
    stdout: overrides.stdout ?? "",
    stderr: overrides.stderr ?? "",
    exitCode: overrides.exitCode ?? 0,
    signal: overrides.signal ?? null,
    startTimeMs: overrides.startTimeMs ?? 1,
    durationMs: overrides.durationMs ?? 1,
    timedOut: overrides.timedOut ?? false,
    aborted: overrides.aborted ?? false,
    maxOutputBytes: overrides.maxOutputBytes ?? 1024,
    stdoutTruncated: overrides.stdoutTruncated ?? false,
    stderrTruncated: overrides.stderrTruncated ?? false,
    sanitizedCommand: overrides.sanitizedCommand ?? "fake.exe",
    sanitizedStdout: overrides.sanitizedStdout ?? "",
    sanitizedStderr: overrides.sanitizedStderr ?? ""
  };
}

class FakeCommandRunner {
  readonly commands: string[] = [];
  readonly runs: CommandRunnerOptions[] = [];
  private readonly results: CommandResult[];

  constructor(results: CommandResult[]) {
    this.results = [...results];
  }

  async run(options: CommandRunnerOptions): Promise<CommandResult> {
    this.commands.push(options.command);
    this.runs.push(options);
    return this.results.shift() ?? commandResult({});
  }
}

describe("WindowsProcessList parsers", () => {
  it("parses tasklist CSV and maps process targets", () => {
    const parsed = parseTasklistCsv(readPcFixture("windows_tasklist_sample.csv"));
    expect(parsed.processes).toHaveLength(2);
    expect(parsed.processes[0]?.pid).toBe(4321);
    const target = processToTarget(parsed.processes[0]!);
    expect(target.id).toContain("pc-windows-process:4321");
    expect(target.tags?.runtimeId).toBe("4321-unknown");
  });

  it("parses tasklist memory values reported in K", () => {
    const parsed = parseTasklistCsv('"Game.exe","4321","Console","1","100 K"');
    expect(parsed.processes[0]?.workingSetBytes).toBe(102400);
  });

  it("parses PowerShell JSON and sanitizes command line", () => {
    const parsed = parsePowerShellProcessJson(readPcFixture("windows_wmic_process_sample.txt"));
    expect(parsed.processes[0]?.name).toBe("Game.exe");
    expect(parsed.processes[0]?.commandLine).toContain("<user-path>");
    expect(parsed.processes[0]?.commandLine).toContain("token <redacted>");
    expect(parsed.processes[0]?.kernelTimeMs).toBe(1200);
    expect(parsed.processes[0]?.startTimeMs).toBeGreaterThan(0);
  });

  it("maps extracted process icon data URLs onto target tags", () => {
    const parsed = parsePowerShellProcessJson(
      JSON.stringify({
        ProcessId: 1000,
        Name: "IconGame.exe",
        IconDataUrl: "data:image/png;base64,AAAA"
      })
    );
    const target = processToTarget(parsed.processes[0]!);
    expect(parsed.processes[0]?.iconDataUrl).toBe("data:image/png;base64,AAAA");
    expect(target.tags?.iconDataUrl).toBe("data:image/png;base64,AAAA");
  });

  it("maps main-window availability without exposing the window title", () => {
    const parsed = parsePowerShellProcessJson(
      JSON.stringify({
        ProcessId: 1000,
        Name: "VisibleGame.exe",
        HasMainWindow: true
      })
    );
    const target = processToTarget(parsed.processes[0]!);
    expect(parsed.processes[0]?.hasMainWindow).toBe(true);
    expect(target.tags?.hasMainWindow).toBe(true);
    expect(target.tags).not.toHaveProperty("mainWindowTitle");
  });

  it("converts Win32_Process 100ns CPU times to milliseconds", () => {
    const parsed = parsePowerShellProcessJson(
      JSON.stringify({
        ProcessId: 1000,
        Name: "Timed.exe",
        KernelModeTime: "20000000",
        UserModeTime: "30000000"
      })
    );
    expect(parsed.processes[0]?.kernelTimeMs).toBe(2000);
    expect(parsed.processes[0]?.userTimeMs).toBe(3000);
  });

  it("parses PowerShell JSON /Date timestamps from Windows PowerShell", () => {
    const parsed = parsePowerShellProcessJson(
      JSON.stringify({
        ProcessId: 1000,
        Name: "DateProcess.exe",
        CreationDate: "/Date(1777467635285)/"
      })
    );
    expect(parsed.processes[0]?.startTimeMs).toBe(1777467635285);
  });

  it("falls back to tasklist when PowerShell JSON is truncated", async () => {
    const runner = new FakeCommandRunner([
      commandResult({
        command: "powershell.exe",
        stdout: "{bad",
        stdoutTruncated: true
      }),
      commandResult({
        command: "tasklist.exe",
        stdout: '"Game.exe","4321","Console","1","100 K"'
      })
    ]);
    const list = new WindowsProcessList({
      commandRunner: runner as never,
      platform: "win32"
    });
    const processes = await list.listProcesses();
    expect(runner.commands).toEqual(["powershell.exe", "tasklist.exe"]);
    expect(processes[0]?.pid).toBe(4321);
    expect(processes[0]?.name).toBe("Game.exe");
  });

  it("forces PowerShell process JSON output to UTF-8", async () => {
    const runner = new FakeCommandRunner([
      commandResult({
        command: "powershell.exe",
        stdout: readPcFixture("windows_wmic_process_sample.txt")
      })
    ]);
    const list = new WindowsProcessList({
      commandRunner: runner as never,
      platform: "win32"
    });
    await list.listProcesses();
    expect(runner.commands).toEqual(["powershell.exe"]);
    expect(runner.runs[0]?.args?.join(" ")).toContain("OutputEncoding");
    expect(runner.runs[0]?.args?.join(" ")).toContain("UTF8Encoding");
    expect(runner.runs[0]?.args?.join(" ")).toContain("ExtractAssociatedIcon");
    expect(runner.runs[0]?.args?.join(" ")).toContain("MainWindowHandle");
  });

  it("returns warnings for malformed output", () => {
    const parsed = parsePowerShellProcessJson("{bad");
    expect(parsed.processes).toHaveLength(0);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});
