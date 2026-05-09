import type { Platform, Tags } from "./common";

export interface Target {
  id: string;
  name: string;
  type: "app" | "process" | "game";
  packageName?: string;
  bundleId?: string;
  pid?: number;
  executablePath?: string;
  platform: Platform;
  tags?: Tags;
}
