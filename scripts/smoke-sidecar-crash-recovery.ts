import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  canRestartSidecar,
  createSidecarCrashState,
  recordSidecarExit,
  recordSidecarRestartAttempt,
  type SidecarCrashState
} from "../apps/local-server/dist/src/diagnostics/sidecarCrashRecovery.js";

const token = "sidecar-crash-smoke-token-123456789";
const tempRoot = mkdtempSync(join(tmpdir(), "lumatrace-sidecar-crash-smoke-"));
mkdirSync(tempRoot, { recursive: true });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function writeFakeSidecar(name: string, body: string): string {
  const path = join(tempRoot, name);
  writeFileSync(path, body, "utf8");
  return path;
}

class SidecarSupervisorSmoke {
  private child: ChildProcess | undefined;
  private stdout = "";
  private stderr = "";
  state: SidecarCrashState = createSidecarCrashState(
    { status: "stopped", lastKnownAuthRequired: true },
    { maxRestarts: 2, restartCooldownMs: 5000 }
  );

  async start(scriptPath: string): Promise<void> {
    if (this.child?.exitCode === null) {
      this.child.kill();
    }
    this.stdout = "";
    this.stderr = "";
    this.state = { ...this.state, status: "starting" };
    this.child = spawn(process.execPath, [scriptPath, token], {
      cwd: tempRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.child.stdout?.on("data", (chunk) => {
      this.stdout += String(chunk);
    });
    this.child.stderr?.on("data", (chunk) => {
      this.stderr += String(chunk);
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    if (this.child.exitCode === null) {
      this.state = {
        ...this.state,
        status: "running",
        pid: this.child.pid,
        lastKnownPort: 49152,
        lastKnownAuthRequired: true
      };
    } else {
      this.state = recordSidecarExit(this.state, {
        exitCode: this.child.exitCode ?? 1,
        stdout: this.stdout,
        stderr: this.stderr,
        now: Date.now()
      });
    }
  }

  async crash(): Promise<void> {
    if (this.child?.pid !== undefined) {
      this.child.kill();
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    this.state = recordSidecarExit(this.state, {
      exitCode: 1,
      stdout: this.stdout,
      stderr: this.stderr || `EADDRINUSE Bearer ${token} C:\\Users\\Alice\\LumaTrace\\db.sqlite`,
      now: Date.now()
    });
  }

  async restart(scriptPath: string, now: number): Promise<boolean> {
    const eligibility = canRestartSidecar(this.state, now);
    if (!eligibility.ok) {
      this.state = recordSidecarRestartAttempt(this.state, now);
      return false;
    }
    this.state = recordSidecarRestartAttempt(this.state, now);
    await this.start(scriptPath);
    return true;
  }

  dispose(): void {
    if (this.child?.pid !== undefined) {
      this.child.kill();
    }
  }
}

let supervisor: SidecarSupervisorSmoke | undefined;

try {
  const runningScript = writeFakeSidecar(
    "fake-running-sidecar.js",
    "console.log(JSON.stringify({ type: 'lumatrace.local-server.ready', port: 49152 })); setTimeout(() => {}, 30000);\n"
  );
  const crashScript = writeFakeSidecar(
    "fake-crash-sidecar.js",
    "console.error('EADDRINUSE Bearer ' + process.argv[2] + ' C:\\\\Users\\\\Alice\\\\LumaTrace\\\\db.sqlite'); process.exit(1);\n"
  );

  supervisor = new SidecarSupervisorSmoke();
  await supervisor.start(runningScript);
  assert(supervisor.state.status === "running", "Expected fake sidecar running state.");
  await supervisor.crash();
  assert(
    supervisor.state.status === "port_conflict" || supervisor.state.status === "crashed",
    "Expected crash state after fake kill."
  );
  const exported = JSON.stringify(supervisor.state);
  assert(!exported.includes(token), "Crash state leaked token.");
  assert(!exported.includes("C:\\Users\\Alice"), "Crash state leaked full Windows path.");

  const restarted = await supervisor.restart(runningScript, 10_000);
  assert(restarted, "Expected first restart to succeed.");
  const cooldownRestart = await supervisor.restart(runningScript, 10_100);
  assert(!cooldownRestart, "Expected restart during cooldown to be rejected.");
  await supervisor.crash();
  await supervisor.restart(crashScript, 20_000);
  assert(supervisor.state.restartCount >= supervisor.state.maxRestarts, "Expected restart count to reach limit.");
  assert(canRestartSidecar(supervisor.state, 30_000).reason === "restart_limited", "Expected restart_limited.");
  assert(!JSON.stringify(supervisor.state).includes(token), "Limited state leaked token.");

  console.log("Sidecar crash recovery smoke test passed");
} finally {
  supervisor?.dispose();
  rmSync(tempRoot, { recursive: true, force: true });
}
