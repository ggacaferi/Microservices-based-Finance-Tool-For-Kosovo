import React from 'react';

export const CompliancePage: React.FC = () => {
  return (
    <div className="content-grid">
      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Kosovo Compliance Engine</div>
            <div className="card-subtitle">
              Single source of truth for SKA, VAT rules, and legality checks.
            </div>
          </div>
        </header>
        <div className="stack">
          <p className="muted">
            This view represents the Compliance bounded context. In the full
            system, this module:
          </p>
          <ul className="muted">
            <li>Defines the Standard Chart of Accounts (SKA).</li>
            <li>Publishes valid VAT tax categories (43, 31, 28...).</li>
            <li>Exposes APIs / events for &quot;is this account legal?&quot;.</li>
          </ul>
          <p className="muted">
            In your current implementation, the Daily Operations service keeps a
            cached copy of tax rules via `TaxRuleService`. When Compliance
            changes, it would push new rules to that cache.
          </p>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Rule distribution (conceptual)</div>
            <div className="card-subtitle">
              How other bounded contexts consume Compliance data.
            </div>
          </div>
        </header>
        <div className="service-grid">
          <div className="service-badge">
            <span>Daily Operations</span>
            <span>Consumes tax rules for invoices &amp; bills</span>
          </div>
          <div className="service-badge">
            <span>General Ledger</span>
            <span>Validates account codes on journal entries</span>
          </div>
          <div className="service-badge">
            <span>AI Analyst</span>
            <span>Uses taxonomy for compliant narratives</span>
          </div>
          <div className="service-badge">
            <span>IAM</span>
            <span>Guards access to compliance-sensitive actions</span>
          </div>
        </div>
      </section>
    </div>
  );
};

