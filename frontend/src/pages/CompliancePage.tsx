import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../useLanguage';

const accountTypeBadge: Record<string, string> = {
  ASSET: 'badge-green', LIABILITY: 'badge-red', EQUITY: 'badge-blue',
  REVENUE: 'badge-amber', EXPENSE: 'badge-red',
};

export const CompliancePage: React.FC = () => {
  const lang = useLanguage();
  const tr = (en: string, sq: string) => (lang === 'en' ? en : sq);
  const [summary, setSummary] = useState<any>(null);
  const [taxCategories, setTaxCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [ruleFilter, setRuleFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = async () => {
    try {
      const [s, t, a, r] = await Promise.all([
        api.get('/compliance/summary'),
        api.get('/compliance/tax-categories'),
        api.get('/compliance/chart-of-accounts'),
        api.get('/compliance/rules'),
      ]);
      setSummary(s.data);
      setTaxCategories(t.data);
      setAccounts(a.data);
      setRules(r.data);
    } catch { /* ignore */ }
  };

  const refreshCache = async () => {
    setRefreshing(true);
    try {
      await api.post('/compliance/refresh');
      await loadAll();
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  };

  useEffect(() => { loadAll(); }, [lang]);

  const filteredAccounts = accountFilter ? accounts.filter(a => a.type === accountFilter) : accounts;
  const filteredRules    = ruleFilter    ? rules.filter(r => r.context === ruleFilter)    : rules;

  return (
    <div className="stack-lg">

      {/* KPI row */}
      {summary && (
        <div className="grid-auto">
          {[
            { label: tr('Tax Categories', 'Kategoritë Tatimore'), value: summary.taxCategoryCount, color: '#2563eb', bg: '#eff6ff' },
            { label: tr('SKA Accounts', 'Llogaritë SKA'), value: summary.accountCount, color: '#16a34a', bg: '#f0fdf4' },
            { label: tr('Active Rules', 'Rregulla Aktive'), value: summary.ruleCount, color: '#d97706', bg: '#fffbeb' },
            { label: tr('Law Version', 'Versioni Ligjor'), value: `v${summary.version}`, color: '#7c3aed', bg: '#f5f3ff' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2">
        {/* VAT Categories */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{tr('Kosovo VAT Categories', 'Kategoritë e TVSH-së në Kosovë')}</div>
              <div className="card-subtitle">{tr('TAK-administered rates — Law 06/L-032', 'Norma të administruara nga ATK — Ligji 06/L-032')}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={refreshCache} disabled={refreshing}>
              {refreshing ? '…' : tr('↻ Refresh Cache', '↻ Rifresko Cache')}
            </button>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>{tr('Code', 'Kodi')}</th>
                <th>{tr('Category Name', 'Emri i Kategorisë')}</th>
                <th className="text-right">{tr('Rate', 'Norma')}</th>
                <th>{tr('Legal Basis', 'Baza Ligjore')}</th>
              </tr>
            </thead>
            <tbody>
              {taxCategories.map((t: any) => (
                <tr key={t.id}>
                  <td><span className="badge badge-blue">{t.id}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="muted">{t.description}</div>
                  </td>
                  <td className="col-amount" style={{ color: '#2563eb' }}>{(t.rate * 100).toFixed(0)}%</td>
                  <td className="muted">{t.legalBasis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Compliance Rules */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{tr('Compliance Rules', 'Rregullat e Përputhshmërisë')}</div>
              <div className="card-subtitle">{tr('Enforced across all bounded contexts', 'Zbatohen në të gjitha kontekstet')}</div>
            </div>
            <select className="select" style={{ width: 140 }} value={ruleFilter} onChange={e => setRuleFilter(e.target.value)}>
              <option value="">{tr('All Contexts', 'Të gjitha kontekstet')}</option>
              <option value="bill">{tr('Bills', 'Faturat')}</option>
              <option value="invoice">{tr('Invoices', 'Invoice-t')}</option>
              <option value="journal_entry">{tr('Journal Entries', 'Regjistrimet')}</option>
            </select>
          </div>
          <div className="card-body stack">
            {filteredRules.map((r: any) => (
              <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--slate-100)' }}>
                <div className="flex gap-2 mb-2">
                  <span className="badge badge-blue">{r.id}</span>
                  <span className="badge badge-amber">{r.context}</span>
                </div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{r.rule}</div>
                <div className="muted">{r.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chart of Accounts */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">{tr('Standard Chart of Accounts (SKA)', 'Plani Standard i Llogarive (SKA)')}</div>
            <div className="card-subtitle">{tr('Kosovo accounting structure', 'Struktura kontabël e Kosovës')} — {filteredAccounts.length} {tr('accounts', 'llogari')}</div>
          </div>
          <select className="select" style={{ width: 150 }} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
            <option value="">{tr('All Account Types', 'Të gjitha llojet')}</option>
            <option value="ASSET">{tr('Assets', 'Asete')}</option>
            <option value="LIABILITY">{tr('Liabilities', 'Detyrime')}</option>
            <option value="EQUITY">{tr('Equity', 'Kapital')}</option>
            <option value="REVENUE">{tr('Revenue', 'Të ardhura')}</option>
            <option value="EXPENSE">{tr('Expenses', 'Shpenzime')}</option>
          </select>
        </div>
        <table className="erp-table">
          <thead>
            <tr>
              <th>{tr('Code', 'Kodi')}</th>
              <th>{tr('Account Name', 'Emri i Llogarisë')}</th>
              <th>{tr('Type', 'Lloji')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.map((a: any) => (
              <tr key={a.code}>
                <td className="text-mono fw-700">{a.code}</td>
                <td>{a.name}</td>
                <td><span className={`badge ${accountTypeBadge[a.type] ?? 'badge-slate'}`}>{a.type}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
