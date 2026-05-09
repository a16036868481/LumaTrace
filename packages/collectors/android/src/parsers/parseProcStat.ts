export interface ProcStatFields {
  user: number;
  nice: number;
  system: number;
  idle: number;
  iowait: number;
  irq: number;
  softirq: number;
  steal: number;
  guest: number;
  guestNice: number;
}

export interface ProcStatSnapshot {
  totalJiffies: number;
  idleJiffies: number;
  activeJiffies: number;
  coreCount: number;
  fields: ProcStatFields;
}

function numberAt(values: readonly string[], index: number): number {
  const parsed = Number.parseInt(values[index] ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseProcStat(output: string): ProcStatSnapshot | null {
  const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
  const cpuLine = lines.find((line) => line.startsWith("cpu "));
  if (cpuLine === undefined) {
    return null;
  }

  const values = cpuLine.split(/\s+/u).slice(1);
  if (values.length < 4) {
    return null;
  }

  const fields: ProcStatFields = {
    user: numberAt(values, 0),
    nice: numberAt(values, 1),
    system: numberAt(values, 2),
    idle: numberAt(values, 3),
    iowait: numberAt(values, 4),
    irq: numberAt(values, 5),
    softirq: numberAt(values, 6),
    steal: numberAt(values, 7),
    guest: numberAt(values, 8),
    guestNice: numberAt(values, 9)
  };
  const totalJiffies = Object.values(fields).reduce((sum, value) => sum + value, 0);
  const idleJiffies = fields.idle + fields.iowait;

  return {
    totalJiffies,
    idleJiffies,
    activeJiffies: totalJiffies - idleJiffies,
    coreCount: lines.filter((line) => /^cpu\d+\s/u.test(line)).length,
    fields
  };
}

export function calculateSystemCpuPercent(
  previous: ProcStatSnapshot,
  next: ProcStatSnapshot
): number | null {
  const totalDelta = next.totalJiffies - previous.totalJiffies;
  const idleDelta = next.idleJiffies - previous.idleJiffies;
  if (totalDelta <= 0 || idleDelta < 0) {
    return null;
  }
  return ((totalDelta - idleDelta) / totalDelta) * 100;
}
