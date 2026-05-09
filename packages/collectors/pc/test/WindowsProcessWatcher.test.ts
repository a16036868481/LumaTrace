import { describe, expect, it } from "vitest";
import { WindowsProcessWatcher } from "../src";
import { FakeProcessAdapter } from "./fakeProcessAdapter";

describe("WindowsProcessWatcher", () => {
  it("detects running, exited, and PID reused", async () => {
    const adapter = new FakeProcessAdapter();
    adapter.processes = [{ pid: 1, name: "Game.exe", startTimeMs: 10 }];
    const watcher = new WindowsProcessWatcher({ adapter, pid: 1, processName: "Game.exe", processStartTimeMs: 10 });
    expect((await watcher.check()).status).toBe("running");
    adapter.processes = [];
    expect((await watcher.check()).status).toBe("exited");
    adapter.processes = [{ pid: 1, name: "Other.exe", startTimeMs: 11 }];
    expect((await watcher.check()).status).toBe("pid_reused");
  });

  it("does not rebind by name unless enabled", async () => {
    const adapter = new FakeProcessAdapter();
    adapter.processes = [{ pid: 2, name: "Game.exe", startTimeMs: 12 }];
    const noRebind = new WindowsProcessWatcher({ adapter, pid: 1, processName: "Game.exe" });
    expect((await noRebind.check()).status).toBe("exited");
    const rebind = new WindowsProcessWatcher({ adapter, pid: 1, processName: "Game.exe", allowProcessRebindByName: true });
    expect((await rebind.check()).status).toBe("rebound");
  });
});
