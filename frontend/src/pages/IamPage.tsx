import React from 'react';

export const IamPage: React.FC = () => {
  return (
    <div className="content-grid">
      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Identity &amp; Access Management</div>
            <div className="card-subtitle">
              Gatekeeper for tenants, users, and permissions.
            </div>
          </div>
        </header>
        <div className="stack">
          <p className="muted">
            The IAM context centralizes authentication, authorization, and
            tenant management. It is a generic domain but critical for
            compliance:
          </p>
          <ul className="muted">
            <li>Login/logout, password hashing, and secure token issuance.</li>
            <li>Role- and permission-based access across SME users.</li>
            <li>
              Audit trails for login attempts, password changes, and sensitive
              profile edits.
            </li>
          </ul>
          <p className="muted">
            This screen will later surface user/role management and permission
            mappings across the other bounded contexts.
          </p>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Planned integration points</div>
            <div className="card-subtitle">
              Where IAM enforces guardrails in the domain.
            </div>
          </div>
        </header>
        <div className="stack">
          <ul className="muted">
            <li>
              Restrict who can Post a bill, approve reversals, or modify tax
              mappings.
            </li>
            <li>
              Expose a unified audit view across Compliance, DailyOps, and
              Ledger.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
};

