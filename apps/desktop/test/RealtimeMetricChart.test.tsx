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
});
