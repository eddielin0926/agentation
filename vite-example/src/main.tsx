import React from "react";
import { createRoot } from "react-dom/client";
import { Agentation } from "agentation";
import "./styles.css";

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "teal" | "amber" | "rose";
}) {
  return (
    <section className={`metric-card metric-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function DemoDashboard() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Agentation Vite Bridge</p>
          <h1>Component comments demo</h1>
        </div>
        <button className="primary-action">Ship review</button>
      </header>

      <section className="metrics-grid" aria-label="Product metrics">
        <MetricCard label="Open comments" value="12" tone="teal" />
        <MetricCard label="Needs review" value="4" tone="amber" />
        <MetricCard label="Blocked" value="1" tone="rose" />
      </section>

      <section className="review-panel">
        <div>
          <p className="eyebrow">Try it</p>
          <h2>Leave a comment on any component</h2>
          <p>
            The toolbar should discover <code>/__agentation/status</code>, create a
            component comment, run the local command adapter, and stream the reply
            back into the thread.
          </p>
        </div>
        <div className="preview-card">
          <h3>Pricing card</h3>
          <p>Ask the demo agent to tighten spacing, explain a style, or update the CTA.</p>
          <button className="secondary-action">Start trial</button>
        </div>
      </section>

      <Agentation />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DemoDashboard />
  </React.StrictMode>,
);
