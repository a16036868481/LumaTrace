import type { AndroidAdbClientLike } from "../types";
import { parseDisplayRefreshRate, type DisplayRefreshInfo } from "../parsers/parseDisplayRefreshRate";
import { parseSurfaceFlingerLayers, type SurfaceFlingerLayerList } from "../parsers/parseSurfaceFlingerLayers";
import {
  parseSurfaceFlingerTimestats,
  type SurfaceFlingerTimestatsResult
} from "../parsers/parseSurfaceFlingerTimestats";

export class SurfaceFlingerTimestatsProbe {
  constructor(
    private readonly adbClient: AndroidAdbClientLike,
    private readonly serial: string
  ) {}

  async prepare(): Promise<void> {
    await this.adbClient.clearSurfaceFlingerTimestats(this.serial);
    await this.adbClient.enableSurfaceFlingerTimestats(this.serial);
  }

  async dumpTimestats(): Promise<SurfaceFlingerTimestatsResult> {
    return parseSurfaceFlingerTimestats(await this.adbClient.dumpSurfaceFlingerTimestats(this.serial));
  }

  async dumpLayers(): Promise<SurfaceFlingerLayerList> {
    return parseSurfaceFlingerLayers(await this.adbClient.dumpSurfaceFlingerLayers(this.serial));
  }

  async readRefreshRate(): Promise<DisplayRefreshInfo> {
    return parseDisplayRefreshRate(await this.adbClient.readDisplayRefreshRate(this.serial));
  }

  async disable(): Promise<void> {
    await this.adbClient.disableSurfaceFlingerTimestats(this.serial);
  }
}
