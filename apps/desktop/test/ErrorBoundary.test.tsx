import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

describe("ErrorBoundary", () => {
  it("shows fallback, hides stack trace, and resets", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let shouldThrow = true;
    function Broken() {
      if (shouldThrow) {
        throw new Error("Render exploded");
      }
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Render exploded")).toBeTruthy();
    expect(screen.queryByText(/at Broken/)).toBeNull();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Recovered")).toBeTruthy();
    consoleSpy.mockRestore();
  });
});
