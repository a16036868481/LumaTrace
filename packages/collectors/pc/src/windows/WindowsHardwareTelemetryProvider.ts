import { CommandRunner, type CommandResult, type CommandRunnerOptions } from "@lumatrace/core";
import { parseCpuThermalZoneDiscoveryJson } from "./WindowsAcpiThermalZone";
import { applyWindowsCommandPolicy, WINDOWS_COMMAND_POLICIES } from "./WindowsCommandPolicy";

export interface WindowsGpuEngineSnapshot {
  available: boolean;
  pid: number;
  engineCount: number;
  activeEngineCount: number;
  utilizationPercent?: number;
}

export interface WindowsTemperatureSensorSnapshot {
  available: boolean;
  sensorCount: number;
  temperatureC?: number;
  source?: string;
  provider?: string;
  sensorNames?: string[];
}

export interface WindowsSystemTelemetrySnapshot {
  gpu: WindowsGpuEngineSnapshot;
  cpuTemperature: WindowsTemperatureSensorSnapshot;
  gpuTemperature: WindowsTemperatureSensorSnapshot;
}

export interface NvidiaGpuTelemetry {
  index: number;
  name: string;
  utilizationPercent?: number;
  powerW?: number;
  temperatureC?: number;
}

export interface WindowsHardwareTelemetryWarning {
  code:
    | "GPU_TELEMETRY_FAILED"
    | "POWER_TELEMETRY_FAILED"
    | "CPU_TEMPERATURE_TELEMETRY_FAILED"
    | "GPU_TEMPERATURE_TELEMETRY_FAILED";
  category: "gpu" | "power" | "temperature";
  message: string;
}

export interface WindowsHardwareTelemetrySample {
  windows: WindowsSystemTelemetrySnapshot;
  nvidiaGpus: NvidiaGpuTelemetry[];
  warnings: WindowsHardwareTelemetryWarning[];
}

export interface WindowsHardwareTelemetryProbe {
  processGpuAvailable: boolean;
  processGpuSource?: string;
  powerAvailable: boolean;
  powerSource?: string;
  cpuTemperatureAvailable: boolean;
  cpuTemperatureSource?: string;
  gpuTemperatureAvailable: boolean;
  gpuTemperatureSource?: string;
}

export interface WindowsHardwareTelemetryProviderLike {
  sample(pid: number, signal?: AbortSignal): Promise<WindowsHardwareTelemetrySample>;
  probe(): Promise<WindowsHardwareTelemetryProbe>;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().replace(/%$/, "");
  if (normalized.length === 0 || /^(n\/a|not supported|unsupported)$/i.test(normalized)) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

export function parseNvidiaSmiTelemetryCsv(output: string): NvidiaGpuTelemetry[] {
  const rows: NvidiaGpuTelemetry[] = [];
  for (const line of output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const fields = parseCsvLine(line);
    if (fields.length < 5) {
      continue;
    }
    const index = boundedNumber(fields[0], 0, 1024);
    const name = fields[1]?.trim() ?? "";
    if (index === undefined || !Number.isInteger(index) || name.length === 0) {
      continue;
    }
    const row: NvidiaGpuTelemetry = { index, name: name.slice(0, 160) };
    const utilizationPercent = boundedNumber(fields[2], 0, 100);
    const powerW = boundedNumber(fields[3], 0, 5000);
    const temperatureC = boundedNumber(fields[4], -50, 200);
    if (utilizationPercent !== undefined) {
      row.utilizationPercent = utilizationPercent;
    }
    if (powerW !== undefined) {
      row.powerW = powerW;
    }
    if (temperatureC !== undefined) {
      row.temperatureC = temperatureC;
    }
    rows.push(row);
  }
  return rows;
}

export function parseWindowsSystemTelemetryJson(
  output: string,
  expectedPid: number
): WindowsSystemTelemetrySnapshot | null {
  if (output.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const pid = boundedNumber(parsed.Pid, 0, 0x7fffffff);
    if (pid === undefined || pid !== expectedPid) {
      return null;
    }
    const gpuAvailable = parsed.GpuCounterAvailable === true;
    const engineCount = boundedNumber(parsed.GpuEngineCount, 0, 100000) ?? 0;
    const activeEngineCount = boundedNumber(parsed.ActiveGpuEngineCount, 0, 100000) ?? 0;
    const utilizationPercent = boundedNumber(parsed.GpuUtilizationPercent, 0, 100);
    const gpu: WindowsGpuEngineSnapshot = {
      available: gpuAvailable,
      pid,
      engineCount,
      activeEngineCount
    };
    if (gpuAvailable && utilizationPercent !== undefined) {
      gpu.utilizationPercent = utilizationPercent;
    }

    const temperatureSnapshot = (prefix: "Cpu" | "Gpu"): WindowsTemperatureSensorSnapshot => {
      const sensorCount = boundedNumber(parsed[`${prefix}TemperatureSensorCount`], 0, 10000) ?? 0;
      const temperatureC = boundedNumber(parsed[`${prefix}TemperatureC`], -50, 200);
      const sourceValue = parsed[`${prefix}TemperatureSource`];
      const providerValue = parsed[`${prefix}TemperatureProvider`];
      const snapshot: WindowsTemperatureSensorSnapshot = {
        available: sensorCount > 0 && temperatureC !== undefined,
        sensorCount
      };
      if (snapshot.available && temperatureC !== undefined) {
        snapshot.temperatureC = temperatureC;
        if (typeof sourceValue === "string" && sourceValue.trim().length > 0) {
          snapshot.source = sourceValue.trim().slice(0, 160);
        }
        if (typeof providerValue === "string" && providerValue.trim().length > 0) {
          snapshot.provider = providerValue.trim().slice(0, 160);
        }
        const sensorNamesValue = parsed[`${prefix}TemperatureSensorNames`];
        if (Array.isArray(sensorNamesValue)) {
          snapshot.sensorNames = sensorNamesValue
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 32);
        }
      }
      return snapshot;
    };
    return {
      gpu,
      cpuTemperature: temperatureSnapshot("Cpu"),
      gpuTemperature: temperatureSnapshot("Gpu")
    };
  } catch {
    return null;
  }
}

function emptyWindowsSnapshot(pid: number): WindowsSystemTelemetrySnapshot {
  return {
    gpu: {
      available: false,
      pid,
      engineCount: 0,
      activeEngineCount: 0
    },
    cpuTemperature: {
      available: false,
      sensorCount: 0
    },
    gpuTemperature: {
      available: false,
      sensorCount: 0
    }
  };
}

function commandSucceeded(result: CommandResult): boolean {
  return result.exitCode === 0 && !result.timedOut && !result.aborted && !result.stdoutTruncated;
}

function buildPowerShellCpuThermalZoneDiscoveryScript(): string {
  return `
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);
$OutputEncoding=[System.Text.UTF8Encoding]::new($false);
$thermalZoneInstances=@();
try {
  $thermalZoneInstances=@(Get-CimInstance -Namespace root/cimv2 -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction Stop |
    ForEach-Object { [string]$_.Name } | Where-Object { $_.Length -gt 0 });
} catch {}
$zoneNames=@($thermalZoneInstances | ForEach-Object {
  $parts=@([string]$_ -split '[\\\\.]');
  if ($parts.Count -gt 0) { [string]$parts[$parts.Count - 1] }
} | Where-Object { $_ -match '^[A-Za-z_][A-Za-z0-9_]{3}$' } | ForEach-Object { $_.ToUpperInvariant() } | Select-Object -Unique);
$firmwareTables=@();
if ($zoneNames.Count -gt 0) {
  try {
    $registryItems=@(Get-ChildItem -LiteralPath 'Registry::HKEY_LOCAL_MACHINE\\HARDWARE\\ACPI' -Recurse -ErrorAction Stop);
    foreach ($registryItem in $registryItems) {
      $item=Get-Item -LiteralPath $registryItem.PSPath -ErrorAction SilentlyContinue;
      if ($null -eq $item) { continue }
      foreach ($valueName in @($item.GetValueNames())) {
        $bytes=$item.GetValue($valueName,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);
        if ($bytes -isnot [byte[]] -or $bytes.Length -eq 0 -or $bytes.Length -gt 1048576) { continue }
        $text=[Text.Encoding]::GetEncoding(28591).GetString($bytes);
        $hasZone=$false;
        foreach ($zoneName in $zoneNames) {
          if ($text.Contains($zoneName)) { $hasZone=$true; break }
        }
        if (-not $hasZone) { continue }
        $hasListMarker=$text.Contains('_PSL');
        $hasProcessorReference=$text -match '(?:PR[0-9A-F]{2}|CPU[0-9A-F]|CP[0-9A-F]{2})';
        if ($hasListMarker -and $hasProcessorReference) {
          $firmwareTables+=,[PSCustomObject]@{ Data=[Convert]::ToBase64String($bytes) };
        }
      }
    }
  } catch {}
}
[PSCustomObject]@{
  ThermalZoneInstances=@($thermalZoneInstances);
  FirmwareTables=@($firmwareTables);
} | ConvertTo-Json -Depth 4 -Compress
`.trim();
}

function powerShellStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildPowerShellTelemetryScript(pid: number, cpuThermalZoneNames: readonly string[]): string {
  const safeZoneNames = cpuThermalZoneNames
    .filter((value) => /^[A-Z_][A-Z0-9_]{3}$/.test(value))
    .map(powerShellStringLiteral)
    .join(",");
  return `
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);
$OutputEncoding=[System.Text.UTF8Encoding]::new($false);
$targetPid=${pid};
$cpuThermalZoneNames=@(${safeZoneNames});
$gpuAvailable=$false;
$gpuRows=@();
try {
  $allGpuRows=@(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop);
  $gpuAvailable=$true;
  if ($targetPid -gt 0) {
    $gpuRows=@($allGpuRows | Where-Object { $_.Name -like ("pid_" + $targetPid + "_*") });
  }
} catch {
  $gpuAvailable=$false;
}
$gpuValues=@($gpuRows | ForEach-Object { [double]$_.UtilizationPercentage } | Where-Object { $_ -ge 0 -and $_ -le 100 });
$gpuMax=if ($gpuAvailable -and $gpuValues.Count -gt 0) { ($gpuValues | Measure-Object -Maximum).Maximum } elseif ($gpuAvailable) { 0 } else { $null };
$gpuActive=@($gpuValues | Where-Object { $_ -gt 0 }).Count;
$cpuTemperatureValues=@();
$cpuTemperatureSource=$null;
$cpuTemperatureProvider=$null;
$cpuTemperatureSensorNames=@();
$gpuTemperatureValues=@();
$gpuTemperatureSource=$null;
$gpuTemperatureProvider=$null;
$monitorCandidates=@(
  [PSCustomObject]@{ Namespace='root\\LibreHardwareMonitor'; Provider='LibreHardwareMonitor'; Source='librehardwaremonitor:wmi' },
  [PSCustomObject]@{ Namespace='root\\OpenHardwareMonitor'; Provider='OpenHardwareMonitor'; Source='openhardwaremonitor:wmi' }
);
foreach ($candidate in $monitorCandidates) {
  try {
    $sensorRows=@(Get-CimInstance -Namespace $candidate.Namespace -ClassName Sensor -ErrorAction Stop |
      Where-Object { [string]$_.SensorType -eq 'Temperature' });
    if ($cpuTemperatureValues.Count -eq 0) {
      $cpuTemperatureValues=@($sensorRows | Where-Object {
        $identity=(([string]$_.Identifier) + ' ' + ([string]$_.Parent) + ' ' + ([string]$_.Name));
        $identity -match '(?i)(intelcpu|amdcpu|(^|[/\\ _-])cpu([/\\ _-]|$)|processor|cpu package)' -and
          $identity -notmatch '(?i)(gpu|graphics|nvidia|radeon)'
      } | ForEach-Object { [double]$_.Value } | Where-Object { $_ -ge -50 -and $_ -le 200 });
      if ($cpuTemperatureValues.Count -gt 0) {
        $cpuTemperatureSource=$candidate.Source;
        $cpuTemperatureProvider=$candidate.Provider;
        $cpuTemperatureSensorNames=@($sensorRows | Where-Object {
          $identity=(([string]$_.Identifier) + ' ' + ([string]$_.Parent) + ' ' + ([string]$_.Name));
          $identity -match '(?i)(intelcpu|amdcpu|(^|[/\\ _-])cpu([/\\ _-]|$)|processor|cpu package)' -and
            $identity -notmatch '(?i)(gpu|graphics|nvidia|radeon)'
        } | ForEach-Object { [string]$_.Name } | Where-Object { $_.Length -gt 0 });
      }
    }
    if ($gpuTemperatureValues.Count -eq 0) {
      $gpuTemperatureValues=@($sensorRows | Where-Object {
        $identity=(([string]$_.Identifier) + ' ' + ([string]$_.Parent) + ' ' + ([string]$_.Name));
        $identity -match '(?i)(gpu|graphics|nvidia|radeon)'
      } | ForEach-Object { [double]$_.Value } | Where-Object { $_ -ge -50 -and $_ -le 200 });
      if ($gpuTemperatureValues.Count -gt 0) {
        $gpuTemperatureSource=$candidate.Source;
        $gpuTemperatureProvider=$candidate.Provider;
      }
    }
  } catch {}
}
if ($cpuTemperatureValues.Count -eq 0 -and $cpuThermalZoneNames.Count -gt 0) {
  try {
    $cpuThermalRows=@(Get-CimInstance -Namespace root/cimv2 -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction Stop |
      Where-Object {
        $parts=@([string]$_.Name -split '[\\\\.]');
        $zoneName=if ($parts.Count -gt 0) { [string]$parts[$parts.Count - 1] } else { '' };
        $cpuThermalZoneNames -contains $zoneName.ToUpperInvariant()
      });
    $cpuTemperatureValues=@($cpuThermalRows |
      ForEach-Object { ([double]$_.HighPrecisionTemperature / 10.0) - 273.15 } |
      Where-Object { $_ -ge -50 -and $_ -le 200 });
    if ($cpuTemperatureValues.Count -gt 0) {
      $cpuTemperatureSource='windows:acpi-standard-processor-thermal-zone';
      $cpuTemperatureProvider='Win32_PerfFormattedData_Counters_ThermalZoneInformation';
      $cpuTemperatureSensorNames=@($cpuThermalRows | ForEach-Object { [string]$_.Name });
    }
  } catch {
    $cpuTemperatureValues=@();
  }
}
$cpuTemperatureMax=if ($cpuTemperatureValues.Count -gt 0) { ($cpuTemperatureValues | Measure-Object -Maximum).Maximum } else { $null };
$gpuTemperatureMax=if ($gpuTemperatureValues.Count -gt 0) { ($gpuTemperatureValues | Measure-Object -Maximum).Maximum } else { $null };
[PSCustomObject]@{
  Pid=$targetPid;
  GpuCounterAvailable=$gpuAvailable;
  GpuEngineCount=$gpuRows.Count;
  ActiveGpuEngineCount=$gpuActive;
  GpuUtilizationPercent=$gpuMax;
  CpuTemperatureSensorCount=$cpuTemperatureValues.Count;
  CpuTemperatureC=$cpuTemperatureMax;
  CpuTemperatureSource=$cpuTemperatureSource;
  CpuTemperatureProvider=$cpuTemperatureProvider;
  CpuTemperatureSensorNames=@($cpuTemperatureSensorNames);
  GpuTemperatureSensorCount=$gpuTemperatureValues.Count;
  GpuTemperatureC=$gpuTemperatureMax;
  GpuTemperatureSource=$gpuTemperatureSource;
  GpuTemperatureProvider=$gpuTemperatureProvider;
} | ConvertTo-Json -Compress
`.trim();
}

export class WindowsHardwareTelemetryProvider implements WindowsHardwareTelemetryProviderLike {
  private readonly runner: CommandRunner;
  private readonly platform: NodeJS.Platform;
  private probeCache: WindowsHardwareTelemetryProbe | undefined;
  private cpuThermalZoneNamesPromise: Promise<string[]> | undefined;

  constructor(options: { commandRunner?: CommandRunner; platform?: NodeJS.Platform } = {}) {
    this.runner = options.commandRunner ?? new CommandRunner();
    this.platform = options.platform ?? process.platform;
  }

  async probe(): Promise<WindowsHardwareTelemetryProbe> {
    if (this.probeCache !== undefined) {
      return { ...this.probeCache };
    }
    if (this.platform !== "win32") {
      return {
        processGpuAvailable: false,
        powerAvailable: false,
        cpuTemperatureAvailable: false,
        gpuTemperatureAvailable: false
      };
    }
    const sample = await this.sample(0);
    const nvidiaPower = sample.nvidiaGpus.some((gpu) => gpu.powerW !== undefined);
    const nvidiaGpuTemperature = sample.nvidiaGpus.some((gpu) => gpu.temperatureC !== undefined);
    this.probeCache = {
      processGpuAvailable: sample.windows.gpu.available,
      ...(sample.windows.gpu.available ? { processGpuSource: "windows:cim-gpu-engine" } : {}),
      powerAvailable: nvidiaPower,
      ...(nvidiaPower ? { powerSource: "nvidia-smi:device" } : {}),
      cpuTemperatureAvailable: sample.windows.cpuTemperature.available,
      ...(sample.windows.cpuTemperature.source === undefined
        ? {}
        : { cpuTemperatureSource: sample.windows.cpuTemperature.source }),
      gpuTemperatureAvailable: nvidiaGpuTemperature || sample.windows.gpuTemperature.available,
      ...(nvidiaGpuTemperature
        ? { gpuTemperatureSource: "nvidia-smi:device" }
        : sample.windows.gpuTemperature.source === undefined
          ? {}
          : { gpuTemperatureSource: sample.windows.gpuTemperature.source })
    };
    return { ...this.probeCache };
  }

  async sample(pid: number, signal?: AbortSignal): Promise<WindowsHardwareTelemetrySample> {
    if (this.platform !== "win32") {
      return {
        windows: emptyWindowsSnapshot(pid),
        nvidiaGpus: [],
        warnings: []
      };
    }
    const cpuThermalZoneNames = await this.getCpuThermalZoneNames(signal);
    const [windowsResult, nvidiaResult] = await Promise.all([
      this.runWindowsTelemetry(pid, cpuThermalZoneNames, signal),
      this.runNvidiaTelemetry(signal)
    ]);
    const warnings: WindowsHardwareTelemetryWarning[] = [];
    const windows = commandSucceeded(windowsResult)
      ? parseWindowsSystemTelemetryJson(windowsResult.stdout, pid)
      : null;
    if (windows === null) {
      warnings.push({
        code: "GPU_TELEMETRY_FAILED",
        category: "gpu",
        message: "Windows GPU Engine counters could not be read; process GPU usage is unavailable."
      });
    }

    const nvidiaGpus = commandSucceeded(nvidiaResult)
      ? parseNvidiaSmiTelemetryCsv(nvidiaResult.stdout)
      : [];
    if (!nvidiaGpus.some((gpu) => gpu.powerW !== undefined)) {
      warnings.push({
        code: "POWER_TELEMETRY_FAILED",
        category: "power",
        message: "No supported GPU power sensor was available. NVIDIA driver telemetry was not returned."
      });
    }
    if (!(windows?.cpuTemperature.available ?? false)) {
      warnings.push({
        code: "CPU_TEMPERATURE_TELEMETRY_FAILED",
        category: "temperature",
        message: "No supported CPU temperature provider returned a valid reading."
      });
    }
    if (
      !nvidiaGpus.some((gpu) => gpu.temperatureC !== undefined) &&
      !(windows?.gpuTemperature.available ?? false)
    ) {
      warnings.push({
        code: "GPU_TEMPERATURE_TELEMETRY_FAILED",
        category: "temperature",
        message: "No supported GPU temperature provider returned a valid reading."
      });
    }

    return {
      windows: windows ?? emptyWindowsSnapshot(pid),
      nvidiaGpus,
      warnings
    };
  }

  private async getCpuThermalZoneNames(signal?: AbortSignal): Promise<string[]> {
    if (this.cpuThermalZoneNamesPromise === undefined) {
      this.cpuThermalZoneNamesPromise = this.discoverCpuThermalZoneNames(signal);
    }
    return this.cpuThermalZoneNamesPromise;
  }

  private async discoverCpuThermalZoneNames(signal?: AbortSignal): Promise<string[]> {
    const options = applyWindowsCommandPolicy(
      {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          buildPowerShellCpuThermalZoneDiscoveryScript()
        ],
        timeoutMs: WINDOWS_COMMAND_POLICIES.hardware_telemetry.timeoutMs,
        ...(signal === undefined ? {} : { signal })
      } satisfies CommandRunnerOptions,
      WINDOWS_COMMAND_POLICIES.hardware_telemetry
    );
    const result = await this.runner.run(options);
    return commandSucceeded(result) ? parseCpuThermalZoneDiscoveryJson(result.stdout) : [];
  }

  private runWindowsTelemetry(
    pid: number,
    cpuThermalZoneNames: readonly string[],
    signal?: AbortSignal
  ): Promise<CommandResult> {
    const options = applyWindowsCommandPolicy(
      {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          buildPowerShellTelemetryScript(pid, cpuThermalZoneNames)
        ],
        timeoutMs: WINDOWS_COMMAND_POLICIES.hardware_telemetry.timeoutMs,
        ...(signal === undefined ? {} : { signal })
      } satisfies CommandRunnerOptions,
      WINDOWS_COMMAND_POLICIES.hardware_telemetry
    );
    return this.runner.run(options);
  }

  private runNvidiaTelemetry(signal?: AbortSignal): Promise<CommandResult> {
    const options = applyWindowsCommandPolicy(
      {
        command: "nvidia-smi.exe",
        args: [
          "--query-gpu=index,name,utilization.gpu,power.draw,temperature.gpu",
          "--format=csv,noheader,nounits"
        ],
        timeoutMs: WINDOWS_COMMAND_POLICIES.nvidia_smi.timeoutMs,
        ...(signal === undefined ? {} : { signal })
      } satisfies CommandRunnerOptions,
      WINDOWS_COMMAND_POLICIES.nvidia_smi
    );
    return this.runner.run(options);
  }
}
