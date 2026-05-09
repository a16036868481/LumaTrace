import type { WindowsProcessAdapter, WindowsProcessInfo } from "../src";

export class FakeProcessAdapter implements WindowsProcessAdapter {
  processes: WindowsProcessInfo[] = [];
  queue = new Map<number, Array<WindowsProcessInfo | null>>();

  async listProcesses(): Promise<WindowsProcessInfo[]> {
    return this.processes;
  }

  async getProcess(pid: number): Promise<WindowsProcessInfo | null> {
    const queued = this.queue.get(pid);
    if (queued !== undefined && queued.length > 0) {
      return queued.shift() ?? null;
    }
    return this.processes.find((process) => process.pid === pid) ?? null;
  }
}
