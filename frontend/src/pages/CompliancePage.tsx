import React, { useState, useEffect } from 'react';
import axios from 'axios';

const accountTypeBadge: Record<string, string> = {
  ASSET: 'badge-green', LIABILITY: 'badge-red', EQUITY: 'badge-blue',
  REVENUE: 'badge-amber', EXPENSE: 'badge-red',
};

export const CompliancePage: React.FC = () => {
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
        axios.get('/api/v1/compliance/summary'),
        axios.get('/api/v1/compliance/tax-categories'),
        axios.get('/api/v1/compliance/chart-of-accounts'),
        axios.get('/api/v1/compliance/rules'),
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
      await axios.post('/api/v1/compliance/refresh');
      await loadAll();
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const filteredAccounts = accountFilter ? accounts.filter(a => a.type === accountFilter) : accounts;
  const filteredRules    = ruleFilter    ? rules.filter(r => r.context === ruleFilter)    : rules;

  return (
    <div className="stack-lg">

      {/* KPI row */}
      {summary && (
        <div className="grid-auto">
          {[
            { label: 'Tax Categories', value: summary.taxCategoryCount, color: '#2563eb', bg: '#eff6ff' },
            { label: 'SKA Accounts',   value: summary.accountCount,      color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Active Rules',   value: summary.ruleCount,         color: '#d97706', bg: '#fffbeb' },
            { label: 'Law Version',    value: `v${summary.version}`,     color: '#7c3aed', bg: '#f5f3ff' },
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
              <div className="card-title">Kosovo VAT Categories</div>
              <div className="card-subtitle">TAK-administered rates — Law 06/L-032</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={refreshCache} disabled={refreshing}>
              {refreshing ? '…' : '↻ Refresh Cache'}
            </button>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Category Name</th>
                <th className="text-right">Rate</th>
                <th>Legal Basis</th>
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
              <div className="card-title">Compliance Rules</div>
              <div className="card-subtitle">Enforced across all bounded contexts</div>
            </div>
            <select className="select" style={{ width: 140 }} value={ruleFilter} onChange={e => setRuleFilter(e.target.value)}>
              <option value="">All Contexts</option>
              <option value="bill">Bills</option>
              <option value="invoice">Invoices</option>
              <option value="journal_entry">Journal Entries</option>
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
            <div className="card-title">Standard Chart of Accounts (SKA)</div>
            <div className="card-subtitle">Kosovo accounting structure — {filteredAccounts.length} accounts</div>
          </div>
          <select className="select" style={{ width: 150 }} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
            <option value="">All Account Types</option>
            <option value="ASSET">Assets</option>
            <option value="LIABILITY">Liabilities</option>
            <option value="EQUITY">Equity</option>
            <option value="REVENUE">Revenue</option>
            <option value="EXPENSE">Expenses</option>
          </select>
        </div>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Account Name</th>
              <th>Type</th>
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
