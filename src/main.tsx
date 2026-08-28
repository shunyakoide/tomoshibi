import React from "react";
import ReactDOM from "react-dom/client";
import TomoshibiStudio from "./TomoshibiStudio.tsx";
import "./index.css";

// Prevent a render-time exception from turning the whole screen black, and show the cause
type BoundaryProps = { children: React.ReactNode };
type BoundaryState = { error: Error | null };

class ErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): BoundaryState { return { error }; }
  override render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <div className="crash">
        <b>⚠ A rendering error occurred</b>
        <pre>{e.stack || e.message || String(e)}</pre>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TomoshibiStudio />
    </ErrorBoundary>
  </React.StrictMode>
);
