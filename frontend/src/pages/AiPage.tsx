import React from 'react';

export const AiPage: React.FC = () => {
  return (
    <div className="content-grid">
      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">AI Query Service</div>
            <div className="card-subtitle">
              Retrieval-Augmented Analyst for non-accountants.
            </div>
          </div>
        </header>
        <div className="stack">
          <p className="muted">
            The AI context ingests summarized financial information from the
            Ledger (e.g., trial balances, KPIs) into a vector/document store.
            It then allows users to ask natural language questions like:
          </p>
          <ul className="muted">
            <li>&quot;What were my total fuel expenses in Q1?&quot;</li>
            <li>&quot;How did revenue trend vs expenses last quarter?&quot;</li>
            <li>&quot;Explain this balance sheet in simple terms.&quot;</li>
          </ul>
          <p className="muted">
            In the future, this screen will provide a chat-style interface
            pinned to specific financial snapshots, with guardrails aligned to
            the Compliance context.
          </p>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Planned capabilities</div>
            <div className="card-subtitle">
              How AI will collaborate with Compliance and Ledger.
            </div>
          </div>
        </header>
        <div className="stack">
          <ul className="muted">
            <li>Ingest journal summaries and financial statements.</li>
            <li>Run retrieval over compliant, curated financial narratives.</li>
            <li>Filter prompts that would lead to non-compliant outputs.</li>
          </ul>
        </div>
      </section>
    </div>
  );
};

