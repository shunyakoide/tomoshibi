import React from "react";
import ReactDOM from "react-dom/client";
import TomoshibiStudio from "./studio/TomoshibiStudio.tsx";
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
      // Literal colours, not the palette tokens: whatever went wrong may well BE the theme, and
      // this screen must not depend on anything the app sets up at startup.
      <div className="fixed inset-0 p-20 overflow-auto bg-[#0c0c0d] text-[#e8e8ec]
        [font:13px/1.6_ui-monospace,SFMono-Regular,Menlo,monospace] select-text">
        <b className="block mb-8 text-[#e0a060] font-semibold">⚠ A rendering error occurred</b>
        <pre className="m-0 whitespace-pre-wrap break-words">{e.stack || e.message || String(e)}</pre>
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
