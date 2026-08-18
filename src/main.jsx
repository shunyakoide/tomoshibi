import React from "react";
import ReactDOM from "react-dom/client";
import HarigataStudio from "./HarigataStudio.jsx";
import "./index.css";

// Prevent a render-time exception from turning the whole screen black, and show the cause
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HarigataStudio />
    </ErrorBoundary>
  </React.StrictMode>
);
