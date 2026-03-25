import React, { useState, useEffect } from 'react';
import axios from 'axios';

/* ─── Types ────────────────────────────────────────────── */
interface BillLineForm   { description: string; quantity: number; unitPrice: number; taxCategoryId: string; accountCode: string; }
interface InvoiceLineForm { description: string; quantity: number; unitPrice: number; accountCode: string; }
interface BillResponse   { id: string; supplierId: string; issueDate: string; dueDate?: string | null; currency: string; status: string; totalNetAmount: number; lines: any[]; workflow?: any; }
interface InvoiceResponse { id: string; customerId: string; issueDate: string; dueDate?: string | null; currency: string; status: string; totalNetAmount: number; lines: any[]; }
interface InventoryValuation { totalValue: number; items: any[]; movements: any[]; }
interface ActivityEntry { id: string; type: string; entityId?: string; summary: string; at: string; }
interface AccountItem { code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'; parentCode?: string; }
interface TaxCategoryItem { id: string; name: string; rate: number; }

const emptyBillLine: BillLineForm    = { description: '', quantity: 1, unitPrice: 0, taxCategoryId: '43', accountCode: '665-09' };
const emptyInvLine: InvoiceLineForm  = { description: '', quantity: 1, unitPrice: 0, accountCode: '' };

const statusBadge = (s: string) => {
  if (s === 'POSTED' || s === 'SENT' || s === 'PAID') return 'badge-green';
  if (s === 'DRAFT') return 'badge-amber';
  if (s === 'REVERTED' || s === 'REVERSED') return 'badge-red';
  return 'badge-slate';
};

/* ─── Component ────────────────────────────────────────── */
export const DailyOpsPage: React.FC = () => {
  const [tab, setTab] = useState<'bills' | 'invoices' | 'inventory' | 'storno' | 'activity'>('bills');

  /* Bills */
  const [supplierId, setSupplierId]   = useState('SUP-1');
  const [issueDate,  setIssueDate]    = useState(new Date().toISOString().slice(0, 10));
  const [currency,   setCurrency]     = useState('EUR');
  const [billLines,  setBillLines]    = useState<BillLineForm[]>([emptyBillLine]);
  const [activeBill, setActiveBill]   = useState<BillResponse | null>(null);
  const [billLookup, setBillLookup]   = useState('');

  /* Invoices */
  const [customerId,    setCustomerId]    = useState('CUS-1');
  const [invLines,      setInvLines]      = useState<InvoiceLineForm[]>([emptyInvLine]);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceResponse | null>(null);
  const [invLookup,     setInvLookup]     = useState('');

  /* Inventory */
  const [sku,          setSku]          = useState('SKU-1');
  const [itemDesc,     setItemDesc]     = useState('Office item');
  const [mvType,       setMvType]       = useState<'RECEIPT' | 'ISSUE'>('RECEIPT');
  const [mvQty,        setMvQty]        = useState(1);
  const [mvUnitCost,   setMvUnitCost]   = useState(10);
  const [valuation,    setValuation]    = useState<InventoryValuation | null>(null);

  /* Storno */
  const [stornoType,     setStornoType]     = useState<'bill' | 'invoice' | 'inventory'>('bill');
  const [stornoEntityId, setStornoEntityId] = useState('');
  const [stornoReason,   setStornoReason]   = useState('Correction of erroneous entry');

  /* Shared */
  const [activities,   setActivities]  = useState<ActivityEntry[]>([]);
  const [accounts,     setAccounts]    = useState<AccountItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategoryItem[]>([]);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState<string | null>(null);
  const [success,      setSuccess]     = useState<string | null>(null);

  const api = axios.create({ baseURL: '/api/v1' });
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem('guri_token');
    const rawUser = localStorage.getItem('guri_user');
    let tenantId: string | undefined;
    try { tenantId = rawUser ? JSON.parse(rawUser)?.tenantId : undefined; } catch {}
    config.headers = config.headers || {};
    if (token) (config.headers as any).Authorization = `Bearer ${token}`;
    if (tenantId) (config.headers as any)['x-tenant-id'] = tenantId;
    return config;
  });

  const msg = (type: 'success' | 'error', text: string) => {
    if (type === 'success') { setSuccess(text); setError(null); }
    else                    { setError(text);   setSuccess(null); }
    setTimeout(() => { setSuccess(null); setError(null); }, 6000);
  };

  const wrap = async (fn: () => Promise<void>) => {
    setLoading(true); setError(null); setSuccess(null);
    try { await fn(); }
    catch (e: any) {
      const m = e?.response?.data?.message;
      msg('error', Array.isArray(m) ? m.join(', ') : m ?? e.message ?? 'Request failed');
    }
    finally { setLoading(false); }
  };

  /* ── Bill handlers ──────────────────────────── */
  const editBillLine = (i: number, f: keyof BillLineForm, v: string) =>
    setBillLines(p => p.map((l, j) => j !== i ? l : { ...l, [f]: f === 'description' || f === 'taxCategoryId' || f === 'accountCode' ? v : Number(v) }));

  const createBill = () => wrap(async () => {
    const res = await api.post<BillResponse>('/bills/', { supplierId, issueDate, currency, lineItems: billLines });
    const posted = await api.post<BillResponse>(`/bills/${res.data.id}/post`);
    setActiveBill(posted.data); setBillLookup(posted.data.id); setStornoEntityId(posted.data.id);
    await loadActivities(); msg('success', `Bill created and posted: ${posted.data.id}`);
  });

  const postBill = () => wrap(async () => {
    if (!activeBill) return;
    const res = await api.post<BillResponse>(`/bills/${activeBill.id}/post`);
    setActiveBill(res.data); await loadActivities(); msg('success', 'Bill posted — journal entry created in Ledger');
  });

  const fetchBill = () => wrap(async () => {
    const res = await api.get<BillResponse>(`/bills/${billLookup}`);
    setActiveBill(res.data); setStornoEntityId(res.data.id);
  });

  /* ── Invoice handlers ───────────────────────── */
  const editInvLine = (i: number, f: keyof InvoiceLineForm, v: string) =>
    setInvLines(p => p.map((l, j) => j !== i ? l : { ...l, [f]: f === 'description' || f === 'accountCode' ? v : Number(v) }));

  const createInvoice = () => wrap(async () => {
    const res = await api.post<InvoiceResponse>('/invoices/', { customerId, issueDate, currency, lines: invLines });
    const sent = await api.post<InvoiceResponse>(`/invoices/${res.data.id}/send`);
    setActiveInvoice(sent.data); setInvLookup(sent.data.id); setStornoEntityId(sent.data.id);
    await loadActivities(); msg('success', `Invoice created and sent: ${sent.data.id}`);
  });

  const sendInvoice = () => wrap(async () => {
    if (!activeInvoice) return;
    const res = await api.post<InvoiceResponse>(`/invoices/${activeInvoice.id}/send`);
    setActiveInvoice(res.data); await loadActivities(); msg('success', 'Invoice sent');
  });

  const payInvoice = () => wrap(async () => {
    if (!activeInvoice) return;
    const res = await api.post<InvoiceResponse>(`/invoices/${activeInvoice.id}/pay`);
    setActiveInvoice(res.data); await loadActivities(); msg('success', 'Invoice marked as paid');
  });

  const fetchInvoice = () => wrap(async () => {
    const res = await api.get<InvoiceResponse>(`/invoices/${invLookup}`);
    setActiveInvoice(res.data); setStornoEntityId(res.data.id);
  });

  /* ── Inventory handlers ─────────────────────── */
  const recordMovement = () => wrap(async () => {
    const mv = await api.post('/inventory/movements/', { sku, description: itemDesc, type: mvType, quantity: mvQty, unitCost: mvUnitCost });
    setStornoEntityId(mv.data.id); setStornoType('inventory');
    await Promise.all([loadValuation(), loadActivities()]);
    msg('success', `${mvType} recorded for ${sku}`);
  });

  /* ── Storno ─────────────────────────────────── */
  const runStorno = () => wrap(async () => {
    if (!stornoEntityId) { msg('error', 'Please enter an Entity ID'); return; }
    const res = await api.post('/operations/storno/', { entityType: stornoType, entityId: stornoEntityId, reason: stornoReason });
    if (stornoType === 'bill')      setActiveBill(res.data);
    if (stornoType === 'invoice')   setActiveInvoice(res.data);
    await Promise.all([loadValuation(), loadActivities()]);
    msg('success', `Storno applied for ${stornoType} ${stornoEntityId}`);
  });

  /* ── Loaders ────────────────────────────────── */
  const loadActivities = async () => {
    const res = await api.get<ActivityEntry[]>('/operations/activities?limit=15');
    setActivities(res.data);
  };
  const loadValuation = async () => {
    const res = await api.get<InventoryValuation>('/inventory/valuation');
    setValuation(res.data);
  };
  const loadAccounts = async () => {
    const res = await api.get<AccountItem[]>('/compliance/chart-of-accounts');
    setAccounts(res.data || []);
  };
  const loadTaxCategories = async () => {
    const res = await api.get<TaxCategoryItem[]>('/compliance/tax-categories');
    setTaxCategories(res.data || []);
  };

  useEffect(() => {
    loadActivities().catch(() => {});
    loadValuation().catch(() => {});
    loadAccounts().catch(() => {});
    loadTaxCategories().catch(() => {});
  }, []);

  const parentCodes = new Set(accounts.map(a => a.parentCode).filter(Boolean) as string[]);
  const leafAccounts = accounts.filter(a => !parentCodes.has(a.code));
  const expenseLeafAccounts = leafAccounts.filter(a => a.type === 'EXPENSE');

  /* ── Render ─────────────────────────────────── */
  return (
    <div className="stack-lg">
      {/* Alerts */}
      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Tabs */}
      <div className="tabs">
        {(['bills', 'invoices', 'inventory', 'storno', 'activity'] as const).map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {{ bills: '🧾 Bills', invoices: '📄 Invoices', inventory: '📦 Inventory', storno: '↩ Storno', activity: '🕐 Activity' }[t]}
          </button>
        ))}
      </div>

      {/* ── Bills tab ──────────────────────────── */}
      {tab === 'bills' && (
        <div className="grid-2">
          {/* Create bill */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">New Supplier Bill</div>
                <div className="card-subtitle">Fatura Hyrëse — Accounts Payable</div>
              </div>
            </div>
            <div className="card-body form-section">
              <div className="field-row">
                <div className="field-group" style={{ flex: 1 }}>
                  <label className="field-label">Supplier ID</label>
                  <input className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Issue Date</label>
                  <input className="input" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
                </div>
                <div className="field-group" style={{ width: 100 }}>
                  <label className="field-label">Currency</label>
                  <select className="select" value={currency} onChange={e => setCurrency(e.target.value)}>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="field-label mb-2">Line Items</div>
                <table className="lines-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th style={{ width: 90 }}>Qty</th>
                      <th style={{ width: 110 }}>Unit Price</th>
                      <th style={{ width: 160 }}>VAT Category</th>
                      <th style={{ width: 220 }}>Llogaria (nen-kategori)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billLines.map((l, i) => (
                      <tr key={i}>
                        <td><input className="input" placeholder="Item description" value={l.description} onChange={e => editBillLine(i, 'description', e.target.value)} /></td>
                        <td><input className="input" type="number" value={l.quantity}  onChange={e => editBillLine(i, 'quantity',  e.target.value)} /></td>
                        <td><input className="input" type="number" value={l.unitPrice} onChange={e => editBillLine(i, 'unitPrice', e.target.value)} /></td>
                        <td>
                          <select className="select" value={l.taxCategoryId} onChange={e => editBillLine(i, 'taxCategoryId', e.target.value)}>
                            {taxCategories.map(tc => (
                              <option key={tc.id} value={tc.id}>{tc.name} ({(tc.rate * 100).toFixed(0)}%)</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select className="select" value={l.accountCode} onChange={e => editBillLine(i, 'accountCode', e.target.value)}>
                            {expenseLeafAccounts.map(a => (
                              <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="btn btn-secondary btn-sm mt-3" onClick={() => setBillLines(p => [...p, emptyBillLine])}>+ Add Line</button>
              </div>

              <div className="btn-group">
                <button className="btn btn-primary" onClick={createBill} disabled={loading}>
                  {loading ? 'Working…' : 'Create Draft Bill'}
                </button>
              </div>
            </div>
          </div>

          {/* Bill lifecycle */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Bill Lifecycle</div>
                <div className="card-subtitle">Load, post, and inspect a bill's accounting impact</div>
              </div>
            </div>
            <div className="card-body form-section">
              <div className="field-row">
                <div className="field-group" style={{ flex: 1 }}>
                  <label className="field-label">Bill ID</label>
                  <input className="input" placeholder="Paste UUID…" value={billLookup} onChange={e => setBillLookup(e.target.value)} />
                </div>
                <button className="btn btn-secondary" style={{ alignSelf: 'flex-end' }} onClick={fetchBill} disabled={loading}>Load</button>
                <button className="btn btn-primary"   style={{ alignSelf: 'flex-end' }} onClick={postBill}  disabled={loading || !activeBill || activeBill.status !== 'DRAFT'}>Post</button>
              </div>

              {activeBill ? (
                <div className="stack">
                  <div className="flex gap-2">
                    <span className={`badge ${statusBadge(activeBill.status)}`}>{activeBill.status}</span>
                    <span className="badge badge-slate">€{(activeBill.totalNetAmount ?? 0).toFixed(2)} {activeBill.currency}</span>
                    <span className="badge badge-blue">Supplier: {activeBill.supplierId}</span>
                  </div>

                  <table className="erp-table">
                    <thead><tr><th>Description</th><th>Llogaria</th><th className="text-right">Qty</th><th className="text-right">Unit Price</th><th className="text-right">Net</th></tr></thead>
                    <tbody>
                      {activeBill.lines?.map((l: any, i: number) => (
                        <tr key={i}>
                          <td>{l.description}</td>
                          <td className="text-mono">{l.accountCode ?? '—'}</td>
                          <td className="col-amount">{l.quantity}</td>
                          <td className="col-amount">€{l.unitPrice?.toFixed(2)}</td>
                          <td className="col-amount">€{(l.quantity * l.unitPrice)?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {activeBill.workflow && (
                    <div className="alert alert-info">
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Storno Workflow</div>
                        <div>Event: <strong>{activeBill.workflow.event?.type}</strong></div>
                        <div>Ledger entries: {activeBill.workflow.ledger?.journalEntries?.length ?? 0}</div>
                        <div>AI snapshot expenses: €{activeBill.workflow.aiSnapshot?.totalExpenses?.toFixed(2) ?? '0.00'}</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 20 }}>
                  <div className="empty-state-icon">🧾</div>
                  <div className="empty-state-text">No bill loaded</div>
                  <div className="empty-state-sub">Create a bill or paste an ID above</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Invoices tab ───────────────────────── */}
      {tab === 'invoices' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">New Customer Invoice</div>
                <div className="card-subtitle">Fatura Dalëse — Accounts Receivable</div>
              </div>
            </div>
            <div className="card-body form-section">
              <div className="field-row">
                <div className="field-group" style={{ flex: 1 }}>
                  <label className="field-label">Customer ID</label>
                  <input className="input" value={customerId} onChange={e => setCustomerId(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Issue Date</label>
                  <input className="input" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
                </div>
              </div>

              <div>
                <div className="field-label mb-2">Line Items</div>
                <table className="lines-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th style={{ width: 90 }}>Qty</th>
                      <th style={{ width: 110 }}>Unit Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invLines.map((l, i) => (
                      <tr key={i}>
                        <td><input className="input" placeholder="Service description" value={l.description} onChange={e => editInvLine(i, 'description', e.target.value)} /></td>
                        <td><input className="input" type="number" value={l.quantity}  onChange={e => editInvLine(i, 'quantity',  e.target.value)} /></td>
                        <td><input className="input" type="number" value={l.unitPrice} onChange={e => editInvLine(i, 'unitPrice', e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="btn btn-secondary btn-sm mt-3" onClick={() => setInvLines(p => [...p, emptyInvLine])}>+ Add Line</button>
              </div>

              <div className="btn-group">
                <button className="btn btn-primary" onClick={createInvoice} disabled={loading}>Create Invoice</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Invoice Lifecycle</div>
                <div className="card-subtitle">Draft → Sent → Paid</div>
              </div>
            </div>
            <div className="card-body form-section">
              <div className="field-row">
                <div className="field-group" style={{ flex: 1 }}>
                  <label className="field-label">Invoice ID</label>
                  <input className="input" placeholder="Paste UUID…" value={invLookup} onChange={e => setInvLookup(e.target.value)} />
                </div>
                <button className="btn btn-secondary" style={{ alignSelf: 'flex-end' }} onClick={fetchInvoice} disabled={loading}>Load</button>
              </div>

              {activeInvoice ? (
                <div className="stack">
                  <div className="flex gap-2">
                    <span className={`badge ${statusBadge(activeInvoice.status)}`}>{activeInvoice.status}</span>
                    <span className="badge badge-slate">€{(activeInvoice.totalNetAmount ?? 0).toFixed(2)} {activeInvoice.currency}</span>
                  </div>

                  <table className="erp-table">
                    <thead><tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Net</th></tr></thead>
                    <tbody>
                      {activeInvoice.lines?.map((l: any, i: number) => (
                        <tr key={i}>
                          <td>{l.description}</td>
                          <td className="col-amount">{l.quantity}</td>
                          <td className="col-amount">€{(l.quantity * l.unitPrice)?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="btn-group">
                    <button className="btn btn-secondary" onClick={sendInvoice} disabled={loading || activeInvoice.status !== 'DRAFT'}>Send Invoice</button>
                    <button className="btn btn-success"  onClick={payInvoice}  disabled={loading || activeInvoice.status !== 'SENT'}>Mark as Paid</button>
                  </div>
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 20 }}>
                  <div className="empty-state-icon">📄</div>
                  <div className="empty-state-text">No invoice loaded</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Inventory tab ───────────────────────── */}
      {tab === 'inventory' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Record Movement</div>
                <div className="card-subtitle">Weighted-average cost method</div>
              </div>
            </div>
            <div className="card-body form-section">
              <div className="grid-2">
                <div className="field-group">
                  <label className="field-label">SKU</label>
                  <input className="input" value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. SKU-001" />
                </div>
                <div className="field-group">
                  <label className="field-label">Description</label>
                  <input className="input" value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="Item name" />
                </div>
                <div className="field-group">
                  <label className="field-label">Movement Type</label>
                  <select className="select" value={mvType} onChange={e => setMvType(e.target.value as any)}>
                    <option value="RECEIPT">Receipt (IN)</option>
                    <option value="ISSUE">Issue (OUT)</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Quantity</label>
                  <input className="input" type="number" value={mvQty} onChange={e => setMvQty(Number(e.target.value))} />
                </div>
                <div className="field-group">
                  <label className="field-label">Unit Cost (€)</label>
                  <input className="input" type="number" value={mvUnitCost} onChange={e => setMvUnitCost(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <button className="btn btn-primary" onClick={recordMovement} disabled={loading}>Record Movement</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Inventory Valuation</div>
                <div className="card-subtitle">Current stock value by SKU</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={loadValuation}>↻</button>
            </div>
            {valuation ? (
              <>
                <div style={{ padding: '12px 20px', background: 'var(--blue-50)', borderBottom: '1px solid var(--blue-100)' }}>
                  <span className="muted">Total inventory value: </span>
                  <strong style={{ color: 'var(--blue-700)', fontSize: 16 }}>€{valuation.totalValue.toFixed(2)}</strong>
                </div>
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Description</th>
                      <th className="text-right">Qty on Hand</th>
                      <th className="text-right">Avg Cost</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valuation.items.map((item: any) => (
                      <tr key={item.sku}>
                        <td className="text-mono fw-700">{item.sku}</td>
                        <td>{item.description}</td>
                        <td className="col-amount">{item.quantityOnHand}</td>
                        <td className="col-amount">€{item.averageUnitCost.toFixed(2)}</td>
                        <td className="col-amount">€{(item.quantityOnHand * item.averageUnitCost).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <div className="empty-state"><div className="empty-state-icon">📦</div><div className="empty-state-text">No inventory yet</div></div>
            )}
          </div>
        </div>
      )}

      {/* ── Storno tab ──────────────────────────── */}
      {tab === 'storno' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Apply Storno Correction</div>
                <div className="card-subtitle">Reverse a posted bill, invoice, or inventory movement</div>
              </div>
            </div>
            <div className="card-body form-section">
              <div className="alert alert-info">
                Storno reverses the accounting effect by creating an equal and opposite journal entry.
                This satisfies Kosovo Law 06/L-032 correction requirements.
              </div>

              <div className="field-group">
                <label className="field-label">Entity Type</label>
                <select className="select" value={stornoType} onChange={e => setStornoType(e.target.value as any)}>
                  <option value="bill">Supplier Bill</option>
                  <option value="invoice">Customer Invoice</option>
                  <option value="inventory">Inventory Movement</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Entity ID</label>
                <input className="input" placeholder="Paste the UUID of the entity to reverse" value={stornoEntityId} onChange={e => setStornoEntityId(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">Reason for Correction</label>
                <input className="input" value={stornoReason} onChange={e => setStornoReason(e.target.value)} placeholder="e.g. Incorrect amount entered" />
              </div>

              <div>
                <button className="btn btn-danger" onClick={runStorno} disabled={loading || !stornoEntityId}>
                  {loading ? 'Applying…' : 'Apply Storno'}
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Storno Workflow</div>
                <div className="card-subtitle">How corrections propagate through the system</div>
              </div>
            </div>
            <div className="card-body">
              <div className="workflow-steps">
                {[
                  { n: 1, title: 'User initiates storno',     sub: 'POST /api/v1/operations/storno with entityId + reason' },
                  { n: 2, title: 'Operations Service',        sub: 'Marks entity REVERTED, publishes billReverted domain event' },
                  { n: 3, title: 'Ledger Service',            sub: 'Consumes event, creates STORNO journal entry with swapped debits/credits' },
                  { n: 4, title: 'AI Service',                sub: 'Ingests journalEntryPosted event, updates financial snapshot' },
                  { n: 5, title: 'Correction complete',       sub: 'Books remain balanced — Kosovo Law 06/L-032 §44 compliant' },
                ].map(s => (
                  <div key={s.n} className="workflow-step">
                    <div className="step-dot">{s.n}</div>
                    <div className="step-content">
                      <div className="step-title">{s.title}</div>
                      <div className="step-sub">{s.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Activity tab ────────────────────────── */}
      {tab === 'activity' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Activity Log</div>
              <div className="card-subtitle">Timeline of all operations — last 15 events</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadActivities}>↻ Refresh</button>
          </div>
          {activities.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🕐</div>
              <div className="empty-state-text">No activity yet</div>
              <div className="empty-state-sub">Create a bill or invoice to see activity here</div>
            </div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event Type</th>
                  <th>Summary</th>
                  <th>Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {activities.map(a => (
                  <tr key={a.id}>
                    <td className="muted">{new Date(a.at).toLocaleString()}</td>
                    <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{a.type}</span></td>
                    <td>{a.summary}</td>
                    <td className="text-mono muted">{a.entityId ? `${a.entityId.substring(0, 10)}…` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};


interface BillLineForm {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCategoryId: string;
}

interface BillResponse {
  id: string;
  supplierId: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  status: string;
  totalNetAmount: number;
  lines: BillLineForm[] & { netAmount?: number }[];
  workflow?: {
    event?: {
      type: string;
      payload: {
        OriginalReference: string;
        Date: string;
        Reason?: string;
      };
    };
    ledger?: {
      originalReference: string;
      journalEntries: Array<{
        id: string;
        kind: 'ORIGINAL' | 'STORNO';
        date: string;
        amount: number;
      }>;
    };
    aiSnapshot?: {
      totalExpenses: number;
    };
  };
}

interface InvoiceLineForm {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceResponse {
  id: string;
  customerId: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  status: string;
  totalNetAmount: number;
  lines: InvoiceLineForm[];
}

interface InventoryValuation {
  totalValue: number;
  items: {
    sku: string;
    description: string;
    quantityOnHand: number;
    averageUnitCost: number;
  }[];
  movements: {
    id: string;
    sku: string;
    type: 'RECEIPT' | 'ISSUE';
    quantity: number;
    unitCost: number;
    createdAt: string;
  }[];
}

interface ActivityEntry {
  id: string;
  type: string;
  entityId?: string;
  summary: string;
  at: string;
}

const emptyLine: BillLineForm = {
  description: '',
  quantity: 1,
  unitPrice: 0,
  taxCategoryId: '43'
};

