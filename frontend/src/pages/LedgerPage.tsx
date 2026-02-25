import React from 'react';

export const LedgerPage: React.FC = () => {
  return (
    <div className="content-grid">
      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">General Ledger Service</div>
            <div className="card-subtitle">
              Double-entry bookkeeper enforcing Sum(Debits) = Sum(Credits).
            </div>
          </div>
        </header>
        <div className="stack">
          <p className="muted">
            This is the Ledger bounded context. It consumes domain events such
            as <code>BillPosted</code> from Daily Operations and materializes
            them into journal entries.
          </p>
          <ul className="muted">
            <li>Receives <code>BillPosted</code> and creates a JournalEntry.</li>
            <li>
              Applies Storno logic to reverse incorrect entries while preserving
              history.
            </li>
            <li>Produces financial statements and trial balances.</li>
          </ul>
          <p className="muted">
            The UI here will eventually list journal entries, reversals, and
            provide drill-downs from operations documents (bills, invoices) to
            their accounting impact.
          </p>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Event flow (conceptual)</div>
            <div className="card-subtitle">
              How Daily Operations and Ledger collaborate via events.
            </div>
          </div>
        </header>
        <div className="stack">
          <ol className="muted">
            <li>User posts a bill in Daily Operations.</li>
            <li>
              Operations emits <code>BillPosted</code> event with economic
              details.
            </li>
            <li>
              LedgerService subscribes, creates the corresponding JournalEntry,
              enforces the double-entry invariant, and emits{' '}
              <code>JournalEntryPosted</code>.
            </li>
            <li>AI and reporting contexts react to the new financial snapshot.</li>
          </ol>
        </div>
      </section>
    </div>
  );
};

