import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { resolve } from "node:path";

type SmokeBrowser = {
  newPage(options?: { viewport?: { width: number; height: number } }): Promise<{
    addInitScript(fn: () => void): Promise<unknown>;
    goto(url: string, options?: { waitUntil?: "networkidle" }): Promise<unknown>;
    getByRole(role: string, options?: { name?: string; exact?: boolean }): {
      waitFor(): Promise<unknown>;
      click(): Promise<unknown>;
    };
    getByText(text: string, options?: { exact?: boolean }): {
      first(): { waitFor(): Promise<unknown> };
      waitFor(): Promise<unknown>;
    };
    locator(selector: string): {
      textContent(): Promise<string | null>;
    };
    waitForFunction(fn: () => boolean, arg?: unknown, options?: { timeout?: number }): Promise<unknown>;
    screenshot(options: { path: string; fullPage?: boolean }): Promise<unknown>;
  }>;
  close(): Promise<unknown>;
};

function step(message: string): void {
  console.log(`- ${message}`);
}

async function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a TCP port.")));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
    server.on("error", reject);
  });
}

function getListeningPort(address: ReturnType<ReturnType<typeof createNetServer>["address"]>): number {
  if (address === null || typeof address === "string") {
    throw new Error("Server did not report a TCP port.");
  }
  return address.port;
}

function pnpmCommand(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function quoteWindowsCommandArg(value: string): string {
  if (/^[A-Za-z0-9_./:@=+-]+$/u.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '\\"')}"`;
}

function toSpawnCommand(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform !== "win32") {
    return { command, args };
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", [command, ...args].map(quoteWindowsCommandArg).join(" ")]
  };
}

function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

async function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolveCommand, reject) => {
    const spawnCommand = toSpawnCommand(command, args);
    const child = spawn(spawnCommand.command, spawnCommand.args, {
      env: cleanEnv(env),
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveCommand();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown"}`));
      }
    });
  });
}

function stopChildProcess(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore"
    });
    return;
  }

  child.kill();
}

async function waitForHttp(url: string, timeoutMs = 15_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function launchBrowser(): Promise<SmokeBrowser> {
  const { chromium } = await import("@playwright/test");
  try {
    return await chromium.launch();
  } catch (firstError) {
    for (const channel of ["msedge", "chrome"]) {
      try {
        return await chromium.launch({ channel });
      } catch {
        // Try the next installed browser channel.
      }
    }
    throw firstError;
  }
}

async function main(): Promise<void> {
  step("prepare local smoke servers");
  const { createServer } = await import("../apps/local-server/dist/src/server.js");
  const app = await createServer({
    dbPath: ":memory:",
    enableLogger: false,
    metricBatchSize: 4,
    metricFlushIntervalMs: 20
  });
  let preview: ChildProcess | null = null;
  let browser: SmokeBrowser | null = null;

  try {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const apiPort = getListeningPort(app.server.address());
    const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
    const wsBaseUrl = `ws://127.0.0.1:${apiPort}`;
    const previewPort = await getFreePort();
    const previewUrl = `http://127.0.0.1:${previewPort}`;
    const env = {
      ...process.env,
      VITE_API_BASE_URL: "",
      VITE_PROXY_API_TARGET: apiBaseUrl,
      VITE_WS_BASE_URL: wsBaseUrl
    };

    step("build desktop");
    await runCommand(pnpmCommand(), ["--filter", "@lumatrace/desktop", "build"], env);

    step("start Vite dev server");
    const previewCommand = toSpawnCommand(pnpmCommand(), [
      "--filter",
      "@lumatrace/desktop",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(previewPort),
      "--strictPort"
    ]);
    preview = spawn(
      previewCommand.command,
      previewCommand.args,
      {
        env: cleanEnv(env),
        stdio: "inherit"
      }
    );
    await waitForHttp(previewUrl);

    const screenshotDir = resolve("tests/screenshots");
    await mkdir(screenshotDir, { recursive: true });

    step("open browser");
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      window.localStorage.setItem("lumatrace.locale", "en-US");
    });

    step("dashboard");
    await page.goto(previewUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Dashboard" }).waitFor();
    await page.getByText("Local PC", { exact: true }).waitFor();
    await page.screenshot({ path: resolve(screenshotDir, "dashboard.png"), fullPage: true });

    step("test session");
    await page.goto(`${previewUrl}/session?deviceId=mock-local-device-1&targetId=mock-game`, {
      waitUntil: "networkidle"
    });
    await page.getByRole("heading", { name: "Test Session" }).waitFor();
    await page.getByRole("button", { name: "Start Test", exact: true }).click();
    try {
      await page.getByText("session: running", { exact: true }).waitFor();
    } catch (error) {
      console.error(await page.locator("body").textContent());
      throw error;
    }

    await page.waitForFunction(
      () => {
        return Array.from(document.querySelectorAll(".metric-card__value")).some(
          (value) => value.textContent !== null && !value.textContent.includes("N/A")
        );
      },
      undefined,
      { timeout: 10_000 }
    );
    await page.screenshot({
      path: resolve(screenshotDir, "test-session-running.png"),
      fullPage: true
    });

    step("stop and report");
    await page.getByRole("button", { name: "End Test", exact: true }).click();
    await page.getByRole("button", { name: "Stop Session" }).click();
    await page.getByRole("link", { name: "View Report" }).waitFor();
    await page.getByRole("link", { name: "View Report" }).click();
    await page.getByRole("heading", { name: "Report" }).waitFor();
    await page.getByText("Mock metrics are for development and testing only").first().waitFor();
    await page.getByRole("button", { name: "Export JSON" }).waitFor();
    await page.getByRole("button", { name: "Export CSV" }).waitFor();
    await page.getByRole("button", { name: "Export HTML" }).waitFor();
    await page.screenshot({ path: resolve(screenshotDir, "report.png"), fullPage: true });

    console.log("MVP-B browser smoke test passed");
  } finally {
    if (browser !== null) {
      await browser.close();
    }
    if (preview !== null) {
      stopChildProcess(preview);
    }
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
