import React from 'react';
import { NavLink } from 'react-router-dom';

interface LayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ title, subtitle, children }) => {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">Guri Finance Console</div>
          <div className="sidebar-subtitle">Kosovo-compliant accounting workspace</div>
        </div>

        <div>
          <div className="nav-section-title">Core domains</div>
          <nav className="nav-list">
            <NavLink
              to="/compliance"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <span>Compliance Engine</span>
              <span className="nav-pill">Rule keeper</span>
            </NavLink>
            <NavLink
              to="/daily-ops"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <span>Daily Operations</span>
              <span className="nav-pill">Workspace</span>
            </NavLink>
            <NavLink
              to="/ledger"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <span>General Ledger</span>
              <span className="nav-pill">Truth</span>
            </NavLink>
            <NavLink
              to="/ai"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <span>AI Analyst</span>
              <span className="nav-pill">RAG</span>
            </NavLink>
          </nav>
        </div>

        <div>
          <div className="nav-section-title">Platform</div>
          <nav className="nav-list">
            <NavLink
              to="/iam"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <span>Identity &amp; Access</span>
              <span className="nav-pill">Gatekeeper</span>
            </NavLink>
          </nav>
        </div>
      </aside>

      <main className="main">
        <header className="main-header">
          <div>
            <div className="main-title">{title}</div>
            {subtitle && <div className="main-subtitle">{subtitle}</div>}
          </div>
          <div className="top-meta">
            <span className="badge">
              <span style={{ marginRight: 6 }} className="badge-dot" />
              Connected to DailyOps API
            </span>
            <span>BCs: Compliance · DailyOps · Ledger · AI · IAM</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
};

