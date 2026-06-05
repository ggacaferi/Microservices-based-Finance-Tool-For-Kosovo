import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { setLanguage } from '../language';
import { useLanguage } from '../useLanguage';

interface LayoutProps {
  title: string;
  subtitle?: string;
  contentFill?: boolean;
  children: React.ReactNode;
}

const navCls = (active: boolean) =>
  [
    "flex items-center gap-3 rounded px-3 py-2 font-['Public_Sans'] text-sm font-medium transition-all duration-200 ease-in-out",
    active
      ? 'border-l-4 border-[#102A43] bg-white text-[#102A43] shadow-sm'
      : 'text-slate-600 hover:bg-slate-100 hover:text-[#102A43]',
  ].join(' ');

export const Layout: React.FC<LayoutProps> = ({ title, subtitle, contentFill, children }) => {
  const navigate = useNavigate();
  const lang = useLanguage();
  const tr = (en: string, sq: string) => (lang === 'en' ? en : sq);
  const raw = localStorage.getItem('guri_user');
  const user = raw ? JSON.parse(raw) : null;
  const role = user?.role as 'admin' | 'accountant' | 'data_clerk' | 'auditor' | undefined;
  const can = (roles: Array<'admin' | 'accountant' | 'data_clerk' | 'auditor'>) =>
    Boolean(role && roles.includes(role));

  const logout = () => {
    localStorage.removeItem('guri_token');
    localStorage.removeItem('guri_user');
    navigate('/auth');
  };

  return (
    <div className="app-shell">
      <aside className="fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-slate-200 bg-[#F8FAFC] py-4">
        <div className="mb-8 min-w-0 px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary-container font-bold text-on-primary">
              G
            </div>
            <div className="min-w-0 flex-1">
              <div className="break-words text-xl font-black tracking-tighter text-[#102A43]">
                {tr('Guri Finance', 'Guri Finance')}
              </div>
              <div className="break-words font-label-caps text-label-caps text-slate-500">
                {tr('Kosovo ERP Platform', 'Platforma ERP e Kosovës')}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {can(['admin', 'accountant', 'data_clerk']) && (
            <>
              <NavLink to="/daily-ops" className={({ isActive }) => navCls(isActive)}>
                <span className="material-symbols-outlined text-lg leading-none">receipt_long</span>
                {tr('Operations', 'Operacionet')}
              </NavLink>
            </>
          )}
          {can(['admin', 'accountant', 'auditor']) && (
            <>
              <NavLink to="/ledger" className={({ isActive }) => navCls(isActive)}>
                <span className="material-symbols-outlined text-lg leading-none">menu_book</span>
                {tr('General Ledger', 'Libri Kryesor')}
              </NavLink>
              <NavLink to="/compliance" className={({ isActive }) => navCls(isActive)}>
                <span className="material-symbols-outlined text-lg leading-none">verified_user</span>
                {tr('Compliance', 'Përputhshmëri')}
              </NavLink>
              <NavLink to="/ai" className={({ isActive }) => navCls(isActive)}>
                <span className="material-symbols-outlined text-lg leading-none">psychology</span>
                {tr('AI Analyst', 'Analisti AI')}
              </NavLink>
            </>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/platform/iam" className={({ isActive }) => navCls(isActive)}>
              <span className="material-symbols-outlined text-lg leading-none">settings</span>
              {tr('Admin', 'Administrator')}
            </NavLink>
          )}
        </nav>

      </aside>

      <main
        className={`ml-64 flex min-h-screen flex-1 flex-col ${contentFill ? 'h-screen max-h-screen overflow-hidden' : ''}`}
      >
        <header className="sticky top-0 z-40 flex h-auto min-h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 font-['Public_Sans'] text-sm tracking-tight text-[#102A43] sm:px-6 sm:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
            <span className="min-w-0 max-w-[38%] shrink truncate text-sm font-bold text-[#102A43] sm:max-w-[11rem] sm:text-lg">
              {tr('Financial Portal', 'Portali financiar')}
            </span>
            <span className="hidden shrink-0 text-slate-300 sm:inline">|</span>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="break-words font-semibold leading-snug text-slate-700 sm:truncate sm:leading-normal">
                {title}
              </div>
              {subtitle && (
                <div className="mt-0.5 break-words text-xs leading-snug text-slate-500 sm:truncate sm:leading-normal">
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2">
            <select
              className="select lang-select-compact max-w-full shrink-0"
              value={lang}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'sq')}
            >
              <option value="en">EN</option>
              <option value="sq">SQ</option>
            </select>
            {user?.role && (
              <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => navigate('/profile')}>
                {tr('Profile', 'Profili')}
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={logout}>
              {tr('Logout', 'Dil')}
            </button>
          </div>
        </header>

        <div
          className={`mx-auto w-full max-w-container-max flex-1 px-margin ${contentFill ? 'flex min-h-0 flex-col overflow-hidden py-4' : 'py-6'}`}
        >
          {children}
        </div>
      </main>
    </div>
  );
};
