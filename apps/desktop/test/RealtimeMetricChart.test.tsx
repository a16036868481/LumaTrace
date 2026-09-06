import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RealtimeMetricChart } from "../src/components/charts/RealtimeMetricChart";

import "../src/styles/tokens.css";
import "../src/styles/globals.css";
import "../src/styles/layout.css";

describe("RealtimeMetricChart", () => {
  it("renders title, N/A state, and mock marker", () => {
    const { unmount } = render(
      <RealtimeMetricChart
        title="FPS"
        unit="fps"
        series={[
          {
            timestampMs: 1000,
            value: null,
            source: "mock",
            precision: "estimated",
            confidence: "high"
          }
        ]}
      />
    );

    expect(screen.getByRole("img", { name: "FPS" })).toBeTruthy();
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
    expect(screen.getByText("source: mock")).toBeTruthy();
    expect(() => unmount()).not.toThrow();
  });

  it("shows loading progress until the first numeric value arrives", () => {
    const { rerender } = render(<RealtimeMetricChart title="CPU" unit="%" series={[]} loading />);

    expect(screen.getByRole("progressbar", { name: "CPU" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "CPU" })).toBeNull();
    expect(screen.queryByText("N/A")).toBeNull();

    rerender(
      <RealtimeMetricChart
        title="CPU"
        unit="%"
        loading
        series={[
          {
            timestampMs: 1000,
            value: 12.5,
            source: "windows:process-times",
            precision: "estimated",
            confidence: "medium"
          }
        ]}
      />
    );

    expect(screen.queryByRole("progressbar", { name: "CPU" })).toBeNull();
    expect(screen.getByRole("img", { name: "CPU" })).toBeTruthy();
    expect(screen.getAllByText("12.5%").length).toBeGreaterThan(0);
  });
});
