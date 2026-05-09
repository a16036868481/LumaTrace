import { readPackagedEnv, validatePackagedEnv, type PackagedRuntimeOptions } from "./packagedEnv";

export interface LocalServerEnv {
  host: string;
  port: number;
  dbPath: string;
  packaged: boolean;
  reportsDir?: string;
  diagnosticsDir?: string;
  logsDir?: string;
  sidecarManifestPath?: string;
  authToken?: string;
  parentPid?: number;
}

export function readEnv(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2)
): LocalServerEnv {
  const packaged = readPackagedEnv(env, argv);
  validatePackagedEnv(packaged);
  return {
    host: packaged.host,
    port: packaged.port,
    dbPath: packaged.dbPath,
    packaged: packaged.packaged,
    ...(packaged.reportsDir === undefined ? {} : { reportsDir: packaged.reportsDir }),
    ...(packaged.diagnosticsDir === undefined ? {} : { diagnosticsDir: packaged.diagnosticsDir }),
    ...(packaged.logsDir === undefined ? {} : { logsDir: packaged.logsDir }),
    ...(packaged.sidecarManifestPath === undefined
      ? {}
      : { sidecarManifestPath: packaged.sidecarManifestPath }),
    ...(packaged.authToken === undefined ? {} : { authToken: packaged.authToken }),
    ...(packaged.parentPid === undefined ? {} : { parentPid: packaged.parentPid })
  };
}

export type { PackagedRuntimeOptions };
