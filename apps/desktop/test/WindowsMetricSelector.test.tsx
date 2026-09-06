import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WINDOWS_METRIC_SELECTION,
  MetricSelector,
  WindowsMetricSelector,
  type WindowsMetricAvailability
} from "../src/components/WindowsMetricSelector";

afterEach(cleanup);

describe("WindowsMetricSelector", () => {
  it("hides available and experimental labels while preserving actionable states", () => {
    const availability: WindowsMetricAvailability = {
      fps: "experimental",
      cpu: "available",
      gpu: "unavailable",
      memory: "available",
      power: "available",
      gpuTemperature: "available"
    };

    render(
      <WindowsMetricSelector
        availability={availability}
        value={DEFAULT_WINDOWS_METRIC_SELECTION}
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByText("Experimental")).toBeNull();
    expect(screen.queryByText("Available")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "FPS" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "CPU" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "GPU Unavailable" })).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("CPU Temperature")).toBeNull();
  });

  it("uses the same compact selector layout for mobile metrics", () => {
    const { container } = render(
      <MetricSelector
        options={[
          { key: "fps", labelKey: "metric.fps", availability: "experimental" },
          { key: "frameTime", labelKey: "metric.frameTime", availability: "experimental" },
          { key: "cpu", labelKey: "metric.cpu", availability: "available" },
          { key: "memory", labelKey: "metric.memory", availability: "available" }
        ]}
        value={{ fps: true, frameTime: true, cpu: true, memory: true }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(container.querySelector("[data-columns='4']")).toBeTruthy();
    expect(screen.queryByText("Available")).toBeNull();
    expect(screen.queryByText("Experimental")).toBeNull();
  });
});
