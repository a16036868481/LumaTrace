export interface ProcStatusMemory {
  rssKb?: number;
  rssMb?: number;
  vmSizeKb?: number;
  vmSizeMb?: number;
  rssAnonKb?: number;
  rssFileKb?: number;
  rssShmemKb?: number;
}

function kbToMb(kb: number): number {
  return kb / 1024;
}

function readKb(output: string, key: string): number | undefined {
  const match = new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, "imu").exec(output);
  if (match?.[1] === undefined) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

export function parseProcStatus(output: string): ProcStatusMemory {
  const memory: ProcStatusMemory = {};
  const rssKb = readKb(output, "VmRSS");
  const vmSizeKb = readKb(output, "VmSize");
  const rssAnonKb = readKb(output, "RssAnon");
  const rssFileKb = readKb(output, "RssFile");
  const rssShmemKb = readKb(output, "RssShmem");

  if (rssKb !== undefined) {
    memory.rssKb = rssKb;
    memory.rssMb = kbToMb(rssKb);
  }
  if (vmSizeKb !== undefined) {
    memory.vmSizeKb = vmSizeKb;
    memory.vmSizeMb = kbToMb(vmSizeKb);
  }
  if (rssAnonKb !== undefined) {
    memory.rssAnonKb = rssAnonKb;
  }
  if (rssFileKb !== undefined) {
    memory.rssFileKb = rssFileKb;
  }
  if (rssShmemKb !== undefined) {
    memory.rssShmemKb = rssShmemKb;
  }

  return memory;
}
