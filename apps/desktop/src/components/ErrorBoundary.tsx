import { Component, type ErrorInfo, type ReactNode } from "react";
import { navigateTo } from "../app/routes";

interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  private readonly goDashboard = (): void => {
    this.reset();
    navigateTo("/");
  };

  render() {
    if (this.state.error !== null) {
      return (
        <section className="error-view" role="alert">
          <h1>Something went wrong</h1>
          <p>{this.state.error.message || "The current page could not render."}</p>
          <div className="summary-row">
            <button className="button" type="button" onClick={this.reset}>
              Reset
            </button>
            <button className="button button-secondary" type="button" onClick={this.goDashboard}>
              Go Dashboard
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
