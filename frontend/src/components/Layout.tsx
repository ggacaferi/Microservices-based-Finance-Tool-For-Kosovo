import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { setLanguage } from '../language';
import { useLanguage } from '../useLanguage';

interface LayoutProps {
  title: string;
  subtitle?: string;
  /** Main content grows to fill viewport below the topbar (for full-page tools). */
  contentFill?: boolean;
  children: React.ReactNode;
}

const ShieldIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const CheckIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
  </svg>
);
const BriefcaseIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
    <line x1="12" y1="12" x2="12" y2="12"/>
  </svg>
);
const BookIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
  </svg>
);
const SparkleIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l1.5 4.5L11 9l-4.5 1.5L5 15l-1.5-4.5L-1 9l4.5-1.5L5 3zM19 11l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/>
  </svg>
);
export const Layout: React.FC<LayoutProps> = ({ title, subtitle, contentFill, children }) => {
  const navigate = useNavigate();
  const lang = useLanguage();
  const tr = (en: string, sq: string) => (lang === 'en' ? en : sq);
  const raw = localStorage.getItem('guri_user');
  const user = raw ? JSON.parse(raw) : null;
  const role = user?.role as 'admin' | 'accountant' | 'data_clerk' | 'auditor' | undefined;
  const can = (roles: Array<'admin' | 'accountant' | 'data_clerk' | 'auditor'>) => Boolean(role && roles.includes(role));

  const logout = () => {
    localStorage.removeItem('guri_token');
    localStorage.removeItem('guri_user');
    navigate('/auth');
  };

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">G</div>
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-name">Guri Finance</div>
            <div className="sidebar-brand-sub">Kosovo ERP Platform</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {(can(['admin', 'accountant', 'data_clerk']) || can(['admin', 'accountant', 'auditor'])) && (
            <div className="nav-group">
              <div className="nav-group-label">{tr('Accounting', 'Kontabilitet')}</div>
              {can(['admin', 'accountant', 'data_clerk']) && (
                <NavLink to="/daily-ops" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <BriefcaseIcon />
                  {tr('Daily Operations', 'Operacionet Ditore')}
                </NavLink>
              )}
              {can(['admin', 'accountant', 'auditor']) && (
                <NavLink to="/ledger" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <BookIcon />
                  {tr('General Ledger', 'Libri Kryesor')}
                </NavLink>
              )}
            </div>
          )}

          {can(['admin', 'accountant', 'auditor']) && (
            <div className="nav-group">
              <div className="nav-group-label">{tr('Intelligence', 'Inteligjencë')}</div>
              <NavLink to="/ai" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <SparkleIcon />
                {tr('AI Analyst', 'Analisti AI')}
              </NavLink>
              <NavLink to="/compliance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <CheckIcon />
                {tr('Compliance', 'Përputhshmëri')}
              </NavLink>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <div className="status-dot" />
            <span>{tr('API · All systems operational', 'API · Të gjitha sistemet operative')}</span>
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────── */}
      <main className={`main${contentFill ? ' main--fill-viewport' : ''}`}>
        <header className="topbar">
          <div className="topbar-left">
            <div className="page-title">{title}</div>
            {subtitle && <div className="page-subtitle">{subtitle}</div>}
          </div>
          <div className="topbar-right">
            <select
              className="select"
              style={{ width: 90, height: 30 }}
              value={lang}
              onChange={(e) => setLanguage((e.target.value as 'en' | 'sq'))}
            >
              <option value="en">EN</option>
              <option value="sq">SQ</option>
            </select>
            {user?.role === 'admin' && (
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/platform/iam')}>
                {tr('Dashboard', 'Paneli')}
              </button>
            )}
            {user?.role && (
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/profile')}>
                {tr('Profile', 'Profili')}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={logout}>{tr('Logout', 'Dil')}</button>
            <div className="topbar-badge">
              <div className="status-dot" style={{ width: 6, height: 6 }} />
              {tr('Live — Kosovo Law 06/L-032', 'Live — Ligji i Kosovës 06/L-032')}
            </div>
          </div>
        </header>

        <div className={`page-content${contentFill ? ' page-content--fill' : ''}`}>
          {children}
        </div>
      </main>
    </div>
  );
};
