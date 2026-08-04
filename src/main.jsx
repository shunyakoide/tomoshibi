import React from "react";
import ReactDOM from "react-dom/client";
import HarigataStudio from "./HarigataStudio.jsx";
import "./index.css";

// Prevent a render-time exception from turning the whole screen black, and show the cause
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            padding: 20,
            overflow: "auto",
            background: "#0c0c0d",
            color: "#e8e8ec",
            font: "13px/1.6 ui-monospace, monospace",
            WebkitUserSelect: "text",
            userSelect: "text",
          }}
        >
          <div style={{ color: "#e0a060", fontWeight: 600, marginBottom: 8 }}>
            ⚠ 画面の描画でエラーが発生しました
          </div>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
            {(e && (e.stack || e.message)) || String(e)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HarigataStudio />
    </ErrorBoundary>
  </React.StrictMode>
);
