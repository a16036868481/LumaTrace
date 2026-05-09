import type { AndroidAdbClientLike } from "../types";
import { parseGfxinfoFramestats, type GfxinfoFramestatsResult } from "../parsers/parseGfxinfoFramestats";

export class GfxinfoFramestatsProbe {
  constructor(
    private readonly adbClient: AndroidAdbClientLike,
    private readonly serial: string,
    private readonly packageName: string
  ) {}

  async clear(): Promise<void> {
    await this.adbClient.clearGfxinfoFramestats(this.serial, this.packageName);
  }

  async dump(refreshRate?: number): Promise<GfxinfoFramestatsResult> {
    return parseGfxinfoFramestats(
      await this.adbClient.readGfxinfoFramestats(this.serial, this.packageName),
      {
        packageName: this.packageName,
        ...(refreshRate === undefined ? {} : { refreshRate })
      }
    );
  }
}
