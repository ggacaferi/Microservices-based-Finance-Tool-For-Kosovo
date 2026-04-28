import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../useLanguage';

export const LedgerPage: React.FC = () => {
  const lang = useLanguage();
  const tr = (en: string, sq: string) => (lang === 'en' ? en : sq);
  const [summary, setSummary] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [trialBalance, setTrialBalance] = useState<any[]>([]);
  const [kindFilter, setKindFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [billIdLookup, setBillIdLookup] = useState('');
  const [billWorkflow, setBillWorkflow] = useState<any>(null);
  const [tab, setTab] = useState<'entries' | 'trial' | 'lookup' | 'reports'>('entries');
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());
  const [reportQuarter, setReportQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);

  const download = async (kind: 'profit-loss' | 'balance-sheet') => {
    const res = await api.get(`/ledger/reports/${kind}?year=${reportYear}&quarter=${reportQuarter}`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tak-${kind}-Q${reportQuarter}-${reportYear}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const loadAll = async () => {
    try {
      const [s, e, tb] = await Promise.all([
        api.get('/ledger/summary'),
        api.get(`/ledger/journal-entries${kindFilter ? `?kind=${kindFilter}` : ''}`),
        api.get('/ledger/trial-balance'),
      ]);
      setSummary(s.data);
      setEntries(e.data);
      setTrialBalance(tb.data);
    } catch { /* ignore */ }
  };

  const lookupBill = async () => {
    if (!billIdLookup.trim()) return;
    try {
      const res = await api.get(`/ledger/bill/${billIdLookup.trim()}`);
      setBillWorkflow(res.data);
    } catch { setBillWorkflow(null); }
  };

  useEffect(() => { loadAll(); }, [kindFilter]);

  return (
    <div className="stack-lg">

      {/* KPI summary */}
      {summary && (
        <div className="grid-auto">
          {[
            { label: tr('Total Entries', 'Totali i Regjistrimeve'), value: summary.totalEntries, color: 'var(--blue-700)' },
            { label: tr('Original', 'Origjinale'), value: summary.originalEntries, color: 'var(--green-600)' },
            { label: 'Storno', value: summary.stornoEntries, color: 'var(--amber-600)' },
            { label: tr('Total Debits', 'Debite Totale'), value: `€${(summary.totalDebits ?? 0).toFixed(2)}`, color: 'var(--slate-900)' },
            { label: tr('Total Credits', 'Kredite Totale'), value: `€${(summary.totalCredits ?? 0).toFixed(2)}`, color: 'var(--slate-900)' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ color: s.color, fontSize: 22 }}>{s.value}</div>
            </div>
          ))}
          <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="stat-label">{tr('Books Status', 'Gjendja e Librave')}</div>
            <span className={`badge ${summary.balanced ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 13, padding: '4px 10px', marginTop: 8 }}>
              {summary.balanced ? tr('✓ Balanced', '✓ I balancuar') : tr('✗ Imbalanced', '✗ I pa-balancuar')}
            </span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="card">
        <div className="card-header">
          <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
            <button className={`tab ${tab === 'entries' ? 'active' : ''}`} onClick={() => setTab('entries')}>{tr('Journal Entries', 'Regjistrimet')}</button>
            <button className={`tab ${tab === 'trial'   ? 'active' : ''}`} onClick={() => setTab('trial')}>{tr('Trial Balance', 'Bilanci Provues')}</button>
            <button className={`tab ${tab === 'lookup'  ? 'active' : ''}`} onClick={() => setTab('lookup')}>{tr('Bill Lookup', 'Kërko Faturë')}</button>
            <button className={`tab ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>{tr('Tax Reports', 'Raportet Tatimore')}</button>
          </div>
          <div className="card-header-actions">
            {tab === 'entries' && (
              <select className="select" style={{ width: 140 }} value={kindFilter} onChange={e => setKindFilter(e.target.value)}>
                <option value="">{tr('All Entries', 'Të gjitha')}</option>
                <option value="ORIGINAL">Original</option>
                <option value="STORNO">Storno</option>
              </select>
            )}
            <button className="btn btn-secondary btn-sm" onClick={loadAll}>{tr('↻ Refresh', '↻ Rifresko')}</button>
          </div>
        </div>

        {/* Journal Entries tab */}
        {tab === 'entries' && (
          entries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📒</div>
              <div className="empty-state-text">No journal entries yet</div>
              <div className="empty-state-sub">Post a bill in Daily Operations to generate entries</div>
            </div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Reference</th>
                  <th>Date</th>
                  <th className="text-right">Amount</th>
                  <th>Reversed By</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any) => (
                  <React.Fragment key={e.id}>
                    <tr onClick={() => setExpandedId(expandedId === e.id ? null : e.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className={`badge ${e.kind === 'ORIGINAL' ? 'badge-green' : 'badge-amber'}`}>{e.kind}</span>
                      </td>
                      <td className="text-mono">{e.reference}</td>
                      <td className="muted">{e.date}</td>
                      <td className="col-amount">€{e.amount.toFixed(2)}</td>
                      <td className="muted text-mono" style={{ fontSize: 11 }}>{e.reversedBy ? e.reversedBy.substring(0, 12) + '…' : '—'}</td>
                    </tr>
                    {expandedId === e.id && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--blue-50)', padding: '12px 16px' }}>
                          <div className="text-sm muted mb-2">Entry ID: {e.id}</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                {['Account', 'Debit', 'Credit'].map(h => (
                                  <th key={h} style={{ textAlign: h === 'Account' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--slate-500)', padding: '4px 8px', borderBottom: '1px solid var(--slate-200)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {e.lines.map((l: any, i: number) => (
                                <tr key={i}>
                                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '4px 8px' }}>{l.account}</td>
                                  <td style={{ textAlign: 'right', padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{l.debit > 0 ? `€${l.debit.toFixed(2)}` : '—'}</td>
                                  <td style={{ textAlign: 'right', padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{l.credit > 0 ? `€${l.credit.toFixed(2)}` : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* Trial Balance tab */}
        {tab === 'trial' && (
          trialBalance.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">⚖️</div>
              <div className="empty-state-text">No accounts to balance yet</div>
            </div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="text-right">Total Debits</th>
                  <th className="text-right">Total Credits</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.map((tb: any) => (
                  <tr key={tb.account}>
                    <td className="text-mono fw-700">{tb.account}</td>
                    <td className="col-amount">€{tb.totalDebit.toFixed(2)}</td>
                    <td className="col-amount">€{tb.totalCredit.toFixed(2)}</td>
                    <td className="col-amount" style={{ color: tb.balance >= 0 ? 'var(--green-600)' : 'var(--red-600)' }}>
                      €{tb.balance.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* Bill Lookup tab */}
        {tab === 'lookup' && (
          <div className="card-body stack">
            <div className="field-group">
              <label className="field-label">Bill ID</label>
              <div className="field-row">
                <input className="input" placeholder="Paste bill UUID…" value={billIdLookup} onChange={e => setBillIdLookup(e.target.value)} onKeyDown={e => e.key === 'Enter' && lookupBill()} />
                <button className="btn btn-primary" onClick={lookupBill} style={{ flexShrink: 0 }}>Look Up</button>
              </div>
            </div>
            {billWorkflow && (
              <div>
                <div className="flex gap-2 mb-3">
                  <span className="badge badge-blue">Reference: {billWorkflow.originalReference}</span>
                  <span className="badge badge-slate">{billWorkflow.journalEntries?.length ?? 0} entries</span>
                </div>
                <div className="code-block">{JSON.stringify(billWorkflow, null, 2)}</div>
              </div>
            )}
          </div>
        )}

        {/* Tax reports tab */}
        {tab === 'reports' && (
          <div className="card-body stack">
            <div className="grid-3">
              <div className="field-group">
                <label className="field-label">Fiscal Year</label>
                <input className="input" type="number" min={2000} max={2100} value={reportYear} onChange={e => setReportYear(Number(e.target.value) || new Date().getFullYear())} />
              </div>
              <div className="field-group">
                <label className="field-label">Quarter</label>
                <select className="select" value={reportQuarter} onChange={e => setReportQuarter(Number(e.target.value))}>
                  <option value={1}>Q1 (Jan–Mar)</option>
                  <option value={2}>Q2 (Apr–Jun)</option>
                  <option value={3}>Q3 (Jul–Sep)</option>
                  <option value={4}>Q4 (Oct–Dec)</option>
                </select>
              </div>
            </div>

            <div className="alert alert-info">
              Exports TAK-oriented CSV templates for quarterly filing: Balance Sheet and Profit & Loss.
            </div>

            <div className="btn-group">
              <button className="btn btn-primary" onClick={() => download('balance-sheet')}>Download Balance Sheet</button>
              <button className="btn btn-primary" onClick={() => download('profit-loss')}>Download Profit &amp; Loss</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
