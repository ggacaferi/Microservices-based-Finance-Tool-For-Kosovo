import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../useLanguage';

/* ─── Types ────────────────────────────────────────────── */
interface BillLineForm   { description: string; quantity: string; unitPrice: string; taxCategoryId: string; accountCode: string; isInventoryItem?: boolean; sku?: string; }
interface InvoiceLineForm { description: string; quantity: string; unitPrice: string; accountCode: string; isInventoryItem?: boolean; sku?: string; }
interface BillResponse   { id: string; supplierId: string; issueDate: string; dueDate?: string | null; currency: string; status: string; totalNetAmount: number; lines: any[]; workflow?: any; }
interface InvoiceResponse { id: string; customerId: string; issueDate: string; dueDate?: string | null; currency: string; status: string; totalNetAmount: number; lines: any[]; receiverNui?: string | null; counterpartyEdiId?: string | null; }
interface InventoryValuation { totalValue: number; items: any[]; movements: any[]; }
interface ActivityEntry { id: string; type: string; entityId?: string; summary: string; at: string; }
interface AccountItem { code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'; parentCode?: string; }
interface TaxCategoryItem { id: string; name: string; rate: number; }
interface EdiInboxItem {
  id: string;
  status: string;
  senderBusinessId: string;
  senderTenantId?: string;
  messageId: string;
  receivedAt: string;
  importedBillId?: string | null;
  payload?: {
    issueDate?: string;
    dueDate?: string | null;
    currency?: string;
    totalNetAmount?: number;
    senderTenantName?: string | null;
    lines?: Array<{ description: string; quantity: number; unitPrice: number }>;
  };
}
type BillSortKey = 'issueDate' | 'supplierId' | 'totalNetAmount' | 'status';
type InvoiceSortKey = 'issueDate' | 'customerId' | 'totalNetAmount' | 'status';

const emptyBillLine: BillLineForm    = { description: '', quantity: '1', unitPrice: '', taxCategoryId: '43', accountCode: '665-09', isInventoryItem: false, sku: '' };
const emptyInvLine: InvoiceLineForm  = { description: '', quantity: '1', unitPrice: '', accountCode: '', isInventoryItem: false, sku: '' };

const statusBadge = (s: string) => {
  if (s === 'POSTED' || s === 'SENT' || s === 'PAID') return 'badge-green';
  if (s === 'DRAFT') return 'badge-amber';
  if (s === 'REVERTED' || s === 'REVERSED') return 'badge-red';
  return 'badge-slate';
};

/* ─── Component ────────────────────────────────────────── */
export const DailyOpsPage: React.FC = () => {
  const lang = useLanguage();
  const tr = (en: string, sq: string) => (lang === 'en' ? en : sq);
  const [tab, setTab] = useState<'bills' | 'invoices' | 'inventory' | 'storno'>('bills');

  /* Bills */
  const [supplierId, setSupplierId]   = useState('SUP-1');
  const [issueDate,  setIssueDate]    = useState(new Date().toISOString().slice(0, 10));
  const [currency,   setCurrency]     = useState('EUR');
  const [billLines,  setBillLines]    = useState<BillLineForm[]>([emptyBillLine]);
  const [activeBill, setActiveBill]   = useState<BillResponse | null>(null);
  const [billLookup, setBillLookup]   = useState('');

  /* Invoices */
  const [customerId,    setCustomerId]    = useState('CUS-1');
  const [receiverNui,   setReceiverNui]   = useState('');
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
  const [ediInbox, setEdiInbox] = useState<EdiInboxItem[]>([]);
  const [selectedEdiId, setSelectedEdiId] = useState<string | null>(null);
  const [bills, setBills] = useState<BillResponse[]>([]);
  const [billStatusFilter, setBillStatusFilter] = useState<'ALL' | 'DRAFT' | 'POSTED' | 'PAID' | 'REVERTED'>('ALL');
  const [billSortKey, setBillSortKey] = useState<BillSortKey>('issueDate');
  const [billSortDir, setBillSortDir] = useState<'asc' | 'desc'>('desc');
  const [showCreateBillModal, setShowCreateBillModal] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'ALL' | 'DRAFT' | 'SENT' | 'PAID' | 'REVERTED'>('ALL');
  const [invoiceSortKey, setInvoiceSortKey] = useState<InvoiceSortKey>('issueDate');
  const [invoiceSortDir, setInvoiceSortDir] = useState<'asc' | 'desc'>('desc');
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);

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
  const editBillLine = (i: number, f: keyof BillLineForm, v: any) =>
    setBillLines(p => p.map((l, j) => j !== i ? l : { ...l, [f]: f === 'isInventoryItem' ? Boolean(v) : v }));

  const createBill = () => wrap(async () => {
    const normalizedLines = billLines.map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
    }));
    if (normalizedLines.some(l => !Number.isFinite(l.quantity) || l.quantity <= 0 || !Number.isFinite(l.unitPrice) || l.unitPrice < 0)) {
      msg('error', 'Please enter valid numeric values for quantity and unit price.');
      return;
    }
    const res = await api.post<BillResponse>('/bills/', { supplierId, issueDate, currency, lineItems: normalizedLines });
    setActiveBill(res.data); setBillLookup(res.data.id); setStornoEntityId(res.data.id);
    await loadBills();
    setShowCreateBillModal(false);
    setBillLines([emptyBillLine]);
    msg('success', `Bill created: ${res.data.id}`);
  });

  const postBill = () => wrap(async () => {
    if (!activeBill) return;
    const res = await api.post<BillResponse>(`/bills/${activeBill.id}/post`);
    setActiveBill(res.data); await loadBills(); msg('success', 'Bill posted — journal entry created in Ledger');
  });

  const fetchBill = () => wrap(async () => {
    const res = await api.get<BillResponse>(`/bills/${billLookup}`);
    setActiveBill(res.data); setStornoEntityId(res.data.id);
  });

  const loadBills = async () => {
    const params = billStatusFilter === 'ALL' ? undefined : { status: billStatusFilter };
    const res = await api.get<BillResponse[]>('/bills/', { params });
    setBills(res.data || []);
  };

  const payBill = (id: string) => wrap(async () => {
    const res = await api.post<BillResponse>(`/bills/${id}/pay`);
    if (activeBill?.id === id) setActiveBill(res.data);
    await loadBills();
    msg('success', `Bill marked as paid: ${id}`);
  });

  /* ── Invoice handlers ───────────────────────── */
  const editInvLine = (i: number, f: keyof InvoiceLineForm, v: any) =>
    setInvLines(p => p.map((l, j) => j !== i ? l : { ...l, [f]: f === 'isInventoryItem' ? Boolean(v) : v }));

  const createInvoice = () => wrap(async () => {
    const normalizedLines = invLines.map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
    }));
    if (normalizedLines.some(l => !Number.isFinite(l.quantity) || l.quantity <= 0 || !Number.isFinite(l.unitPrice) || l.unitPrice < 0)) {
      msg('error', 'Please enter valid numeric values for quantity and unit price.');
      return;
    }
    const res = await api.post<InvoiceResponse>('/invoices/', { customerId, receiverNui: receiverNui || undefined, issueDate, currency, lines: normalizedLines });
    setActiveInvoice(res.data); setInvLookup(res.data.id); setStornoEntityId(res.data.id);
    await loadInvoices();
    setShowCreateInvoiceModal(false);
    setInvLines([emptyInvLine]);
    msg('success', `Invoice created: ${res.data.id}`);
  });

  const sendInvoice = (id: string) => wrap(async () => {
    const res = await api.post<InvoiceResponse>(`/invoices/${id}/send`);
    if (activeInvoice?.id === id) setActiveInvoice(res.data);
    await loadInvoices();
    if (res.data.counterpartyEdiId) {
      await loadEdiInbox();
      msg('success', tr('Invoice sent. The receiver will see it under Incoming EDI Documents — they click "Accept to Bills" to import it.', 'Fatura u dërgua. Marrësi e sheh te Dokumentet EDI në hyrje dhe klikon "Prano te Faturat" për ta importuar.'));
    } else {
      msg('success', tr('Invoice sent.', 'Fatura u dërgua.'));
    }
  });

  const payInvoice = (id: string) => wrap(async () => {
    const res = await api.post<InvoiceResponse>(`/invoices/${id}/pay`);
    if (activeInvoice?.id === id) setActiveInvoice(res.data);
    await loadInvoices();
    msg('success', 'Invoice marked as paid');
  });

  const fetchInvoice = () => wrap(async () => {
    const res = await api.get<InvoiceResponse>(`/invoices/${invLookup}`);
    setActiveInvoice(res.data); setStornoEntityId(res.data.id);
  });

  const loadInvoices = async () => {
    const res = await api.get<InvoiceResponse[]>('/invoices/');
    const all = res.data || [];
    setInvoices(invoiceStatusFilter === 'ALL' ? all : all.filter(i => i.status === invoiceStatusFilter));
  };

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
  const loadEdiInbox = async () => {
    try {
      const res = await api.get<EdiInboxItem[]>('/edi/inbox');
      const docs = res.data || [];
      setEdiInbox(docs);
      setSelectedEdiId((prev) => {
        if (docs.length === 0) return null;
        if (prev && docs.some((d) => d.id === prev)) return prev;
        return docs[0].id;
      });
    } catch (e: any) {
      const m = e?.response?.data?.message;
      msg('error', Array.isArray(m) ? m.join(', ') : m ?? e.message ?? 'Failed to load EDI inbox');
    }
  };
  const acceptEdiToBills = (inboxId: string) => wrap(async () => {
    await api.post(`/edi/inbox/${inboxId}/import-to-bill`);
    await loadEdiInbox();
    await loadBills();
    msg('success', `Imported from inbox: ${inboxId}`);
  });

  useEffect(() => {
    loadValuation().catch(() => {});
    loadAccounts().catch(() => {});
    loadTaxCategories().catch(() => {});
    loadEdiInbox();
    loadBills().catch(() => {});
    loadInvoices().catch(() => {});
  }, []);

  useEffect(() => {
    loadBills().catch(() => {});
  }, [billStatusFilter]);

  useEffect(() => {
    loadInvoices().catch(() => {});
  }, [invoiceStatusFilter]);

  useEffect(() => {
    loadAccounts().catch(() => {});
    loadTaxCategories().catch(() => {});
    loadEdiInbox();
  }, [lang]);

  const parentCodes = new Set(accounts.map(a => a.parentCode).filter(Boolean) as string[]);
  const leafAccounts = accounts.filter(a => !parentCodes.has(a.code));
  const expenseLeafAccounts = leafAccounts.filter(a => a.type === 'EXPENSE');
  const selectedEdi = ediInbox.find(d => d.id === selectedEdiId) || null;

  const ediSenderLabel = (d: EdiInboxItem) => {
    const name = d.payload?.senderTenantName?.trim();
    const nui = d.senderBusinessId;
    if (name && nui && nui !== 'UNKNOWN') return `${name} · NUI ${nui}`;
    if (name) return name;
    if (nui && nui !== 'UNKNOWN') return `NUI ${nui}`;
    return tr('Unknown sender', 'Dërgues i panjohur');
  };
  const ediLinesSummary = (d: EdiInboxItem) => {
    const lines = d.payload?.lines;
    if (!lines?.length) return '—';
    const s = lines.map((l) => `${l.description} (×${l.quantity})`).join(' · ');
    return s.length > 140 ? `${s.slice(0, 137)}…` : s;
  };
  const ediFormatTotal = (d: EdiInboxItem) => {
    const amt = d.payload?.totalNetAmount;
    const cur = d.payload?.currency || 'EUR';
    if (amt == null || Number.isNaN(Number(amt))) return '—';
    const sym = cur === 'EUR' ? '€' : `${cur} `;
    return `${sym}${Number(amt).toFixed(2)}`;
  };
  const sortedBills = [...bills].sort((a, b) => {
    const dir = billSortDir === 'asc' ? 1 : -1;
    if (billSortKey === 'issueDate') return (a.issueDate > b.issueDate ? 1 : -1) * dir;
    if (billSortKey === 'supplierId') return a.supplierId.localeCompare(b.supplierId) * dir;
    if (billSortKey === 'status') return a.status.localeCompare(b.status) * dir;
    return ((a.totalNetAmount || 0) - (b.totalNetAmount || 0)) * dir;
  });
  const sortedInvoices = [...invoices].sort((a, b) => {
    const dir = invoiceSortDir === 'asc' ? 1 : -1;
    if (invoiceSortKey === 'issueDate') return (a.issueDate > b.issueDate ? 1 : -1) * dir;
    if (invoiceSortKey === 'customerId') return a.customerId.localeCompare(b.customerId) * dir;
    if (invoiceSortKey === 'status') return a.status.localeCompare(b.status) * dir;
    return ((a.totalNetAmount || 0) - (b.totalNetAmount || 0)) * dir;
  });

  /* ── Render ─────────────────────────────────── */
  return (
    <div className="stack-lg">
      {/* Alerts */}
      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Tabs */}
      <div className="tabs">
        {(['bills', 'invoices', 'inventory', 'storno'] as const).map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {{ bills: tr('Bills', 'Faturat Hyrëse'), invoices: tr('Invoices', 'Faturat Dalëse'), inventory: tr('Inventory', 'Inventari'), storno: 'Storno' }[t]}
          </button>
        ))}
      </div>

      {/* ── Bills tab ──────────────────────────── */}
      {tab === 'bills' && (
        <div className="stack-lg">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Bills Register</div>
                <div className="card-subtitle">{tr('View, sort, post and mark bills as paid', 'Shiko, rendit, posto dhe shëno faturat si të paguara')}</div>
              </div>
              <div className="btn-group">
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateBillModal(true)}>{tr('Add New Bill', 'Shto Faturë të Re')}</button>
                <select className="select" style={{ width: 140, height: 28 }} value={billStatusFilter} onChange={e => setBillStatusFilter(e.target.value as any)}>
                  <option value="ALL">{tr('All statuses', 'Të gjitha statuset')}</option><option value="DRAFT">DRAFT</option><option value="POSTED">POSTED</option><option value="PAID">PAID</option><option value="REVERTED">REVERTED</option>
                </select>
                <select className="select" style={{ width: 160, height: 28 }} value={billSortKey} onChange={e => setBillSortKey(e.target.value as BillSortKey)}>
                  <option value="issueDate">{tr('Date', 'Data')}</option><option value="supplierId">{tr('Supplier', 'Furnitori')}</option><option value="totalNetAmount">{tr('Amount', 'Shuma')}</option><option value="status">Status</option>
                </select>
                <button className="btn btn-secondary btn-sm" onClick={() => setBillSortDir(d => d === 'asc' ? 'desc' : 'asc')}>{billSortDir === 'asc' ? '↑' : '↓'}</button>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 10 }}>
              <table className="erp-table"><thead><tr><th>ID</th><th>Supplier</th><th>Date</th><th>Status</th><th className="text-right">Amount</th><th></th></tr></thead><tbody>
                {sortedBills.slice(0, 100).map((b) => (
                  <tr key={b.id}>
                    <td className="text-mono">{b.id.slice(0, 8)}…</td><td>{b.supplierId}</td><td>{b.issueDate?.slice(0,10)}</td>
                    <td><span className={`badge ${statusBadge(b.status)}`}>{b.status}</span></td>
                    <td className="col-amount">€{(b.totalNetAmount || 0).toFixed(2)}</td>
                    <td className="text-right"><div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary btn-sm" disabled={b.status !== 'DRAFT'} onClick={() => wrap(async () => { await api.post(`/bills/${b.id}/post`); await loadBills(); })}>{tr('Post', 'Posto')}</button>
                      <button className="btn btn-success btn-sm" disabled={b.status !== 'POSTED'} onClick={() => payBill(b.id)}>{tr('Mark Paid', 'Shëno si të Paguar')}</button>
                    </div></td>
                  </tr>
                ))}
                {sortedBills.length === 0 && <tr><td colSpan={6} className="muted">{tr('No bills found', 'Nuk u gjetën fatura')}</td></tr>}
              </tbody></table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div><div className="card-title">{tr('Incoming EDI Documents', 'Dokumente EDI në hyrje')}</div><div className="card-subtitle">{tr('Accept supplier invoices and convert them to bills', 'Prano faturat hyrëse dhe konvertoji në fatura blerëse')}</div></div>
              <button className="btn btn-secondary btn-sm" onClick={() => loadEdiInbox()}>{tr('Refresh', 'Rifresko')}</button>
            </div>
            <div className="card-body">
              {ediInbox.length === 0 ? <div className="empty-state" style={{ padding: 14 }}><div className="empty-state-icon">ED</div><div className="empty-state-text">{tr('No incoming EDI documents', 'Nuk ka dokumente EDI në hyrje')}</div></div> : (
                <table className="erp-table"><thead><tr><th>{tr('Received', 'Pranuar')}</th><th>{tr('Sender', 'Dërguesi')}</th><th>{tr('Amount', 'Shuma')}</th><th>{tr('Description', 'Përshkrimi')}</th></tr></thead><tbody>
                  {ediInbox.map((d) => (
                    <tr key={d.id} onClick={() => setSelectedEdiId(d.id)} style={{ cursor: 'pointer', background: selectedEdiId === d.id ? 'var(--blue-bg)' : undefined }}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(d.receivedAt).toLocaleString()}</td>
                      <td style={{ maxWidth: 220 }}><div style={{ fontWeight: 600 }}>{ediSenderLabel(d)}</div></td>
                      <td className="col-amount" style={{ fontWeight: 600 }}>{ediFormatTotal(d)}</td>
                      <td className="muted" style={{ maxWidth: 360 }}>{ediLinesSummary(d)}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
              {selectedEdi && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{tr('Review before accepting', 'Rishiko para se të pranosh')}</div>
                      <div className="card-subtitle">{tr('This will create a draft bill in your register.', 'Kjo krijon një faturë hyrëse (DRAFT) në regjistrin tuaj.')}</div>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => acceptEdiToBills(selectedEdi.id)}>{tr('Accept to Bills', 'Prano te Faturat')}</button>
                  </div>
                  <div className="card-body" style={{ paddingTop: 0 }}>
                    <div className="grid-2" style={{ marginBottom: 12 }}>
                      <div><div className="field-label">{tr('Sender', 'Dërguesi')}</div><div style={{ fontWeight: 600 }}>{ediSenderLabel(selectedEdi)}</div></div>
                      <div><div className="field-label">{tr('Total (net)', 'Totali (neto)')}</div><div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{ediFormatTotal(selectedEdi)}</div></div>
                      <div><div className="field-label">{tr('Issue date', 'Data e lëshimit')}</div><div>{selectedEdi.payload?.issueDate ?? '—'}</div></div>
                      <div><div className="field-label">{tr('Due date', 'Data e pagesës')}</div><div>{selectedEdi.payload?.dueDate || '—'}</div></div>
                      <div><div className="field-label">{tr('Invoice ref.', 'Ref. faturës')}</div><div className="text-mono" style={{ fontSize: 12 }}>{selectedEdi.messageId}</div></div>
                    </div>
                    <div className="field-label mb-2">{tr('Line items', 'Rreshtat')}</div>
                    <table className="erp-table" style={{ fontSize: 13 }}>
                      <thead><tr><th>{tr('Description', 'Përshkrimi')}</th><th style={{ width: 70 }}>{tr('Qty', 'Sasia')}</th><th style={{ width: 100 }}>{tr('Unit', 'Njësi')}</th><th style={{ width: 100 }}>{tr('Line total', 'Total rreshti')}</th></tr></thead>
                      <tbody>
                        {(selectedEdi.payload?.lines || []).map((l, idx) => (
                          <tr key={idx}>
                            <td>{l.description}</td>
                            <td>{l.quantity}</td>
                            <td>{Number(l.unitPrice).toFixed(2)}</td>
                            <td className="col-amount">{(l.quantity * l.unitPrice).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {showCreateBillModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
              <div className="card" style={{ width: 'min(980px, 92vw)', maxHeight: '88vh', overflow: 'auto' }}>
                <div className="card-header"><div><div className="card-title">{tr('New Bill', 'Faturë e Re')}</div></div><button className="btn btn-secondary btn-sm" onClick={() => setShowCreateBillModal(false)}>{tr('Close', 'Mbyll')}</button></div>
                <div className="card-body form-section">
                  <div className="field-row"><div className="field-group" style={{ flex: 1 }}><label className="field-label">{tr('Supplier ID', 'ID e Furnitorit')}</label><input className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)} /></div><div className="field-group"><label className="field-label">{tr('Issue Date', 'Data e Lëshimit')}</label><input className="input" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div><div className="field-group" style={{ width: 100 }}><label className="field-label">{tr('Currency', 'Valuta')}</label><select className="select" value={currency} onChange={e => setCurrency(e.target.value)}><option value="EUR">EUR</option></select></div></div>
                  <div>
                    <div className="field-label mb-2">{tr('Line Items', 'Rreshtat')}</div>
                    <table className="lines-table">
                      <thead>
                        <tr>
                          <th>{tr('Description', 'Përshkrimi')}</th>
                          <th style={{ width: 90 }}>{tr('Qty', 'Sasia')}</th>
                          <th style={{ width: 110 }}>{tr('Unit Price', 'Çmimi/Njësi')}</th>
                          <th style={{ width: 160 }}>{tr('VAT Category', 'Kategoria TVSH')}</th>
                          <th style={{ width: 220 }}>{tr('Account', 'Llogaria')}</th>
                          <th style={{ width: 90 }}>{tr('Stock?', 'Stok?')}</th>
                          <th style={{ width: 140 }}>SKU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billLines.map((l, i) => (
                          <tr key={i}>
                            <td><input className="input" value={l.description} onChange={e => editBillLine(i, 'description', e.target.value)} /></td>
                            <td><input className="input" type="text" inputMode="decimal" value={l.quantity} onChange={e => editBillLine(i, 'quantity', e.target.value)} /></td>
                            <td><input className="input" type="text" inputMode="decimal" value={l.unitPrice} onChange={e => editBillLine(i, 'unitPrice', e.target.value)} /></td>
                            <td><select className="select" value={l.taxCategoryId} onChange={e => editBillLine(i, 'taxCategoryId', e.target.value)}>{taxCategories.map(tc => <option key={tc.id} value={tc.id}>{tc.name}</option>)}</select></td>
                            <td><select className="select" value={l.accountCode} onChange={e => editBillLine(i, 'accountCode', e.target.value)}>{expenseLeafAccounts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></td>
                            <td><input type="checkbox" checked={Boolean(l.isInventoryItem)} onChange={e => editBillLine(i, 'isInventoryItem', e.target.checked)} /></td>
                            <td><input className="input" placeholder="SKU-001" value={l.sku || ''} onChange={e => editBillLine(i, 'sku', e.target.value.toUpperCase())} disabled={!l.isInventoryItem} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="btn btn-secondary btn-sm mt-3" onClick={() => setBillLines(p => [...p, emptyBillLine])}>{tr('+ Add Line', '+ Shto Rresht')}</button>
                  </div>
                  <div className="btn-group" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary" onClick={() => setShowCreateBillModal(false)}>{tr('Close', 'Mbyll')}</button><button className="btn btn-primary" onClick={createBill} disabled={loading}>{tr('Create Draft Bill', 'Krijo Faturë Draft')}</button></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Invoices tab ───────────────────────── */}
      {tab === 'invoices' && (
        <div className="stack-lg">
          <div className="card">
            <div className="card-header">
              <div><div className="card-title">{tr('Invoices Register', 'Regjistri i Invoice-ve')}</div><div className="card-subtitle">{tr('View, sort, send and mark invoices as paid', 'Shiko, rendit, dërgo dhe shëno invoice-t si të paguara')}</div></div>
              <div className="btn-group">
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateInvoiceModal(true)}>{tr('Add New Invoice', 'Shto Invoice të Ri')}</button>
                <select className="select" style={{ width: 140, height: 28 }} value={invoiceStatusFilter} onChange={e => setInvoiceStatusFilter(e.target.value as any)}><option value="ALL">{tr('All statuses', 'Të gjitha statuset')}</option><option value="DRAFT">DRAFT</option><option value="SENT">SENT</option><option value="PAID">PAID</option><option value="REVERTED">REVERTED</option></select>
                <select className="select" style={{ width: 160, height: 28 }} value={invoiceSortKey} onChange={e => setInvoiceSortKey(e.target.value as InvoiceSortKey)}><option value="issueDate">{tr('Date', 'Data')}</option><option value="customerId">{tr('Customer', 'Klienti')}</option><option value="totalNetAmount">{tr('Amount', 'Shuma')}</option><option value="status">Status</option></select>
                <button className="btn btn-secondary btn-sm" onClick={() => setInvoiceSortDir(d => d === 'asc' ? 'desc' : 'asc')}>{invoiceSortDir === 'asc' ? '↑' : '↓'}</button>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 10 }}>
              <table className="erp-table"><thead><tr><th>ID</th><th>Customer</th><th>Date</th><th>Status</th><th className="text-right">Amount</th><th></th></tr></thead><tbody>
                {sortedInvoices.slice(0, 100).map((i) => (
                  <tr key={i.id}><td className="text-mono">{i.id.slice(0,8)}…</td><td>{i.customerId}</td><td>{i.issueDate?.slice(0,10)}</td><td><span className={`badge ${statusBadge(i.status)}`}>{i.status}</span></td><td className="col-amount">€{(i.totalNetAmount || 0).toFixed(2)}</td><td className="text-right"><div className="btn-group" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary btn-sm" disabled={i.status !== 'DRAFT'} onClick={() => sendInvoice(i.id)}>{tr('Send', 'Dërgo')}</button><button className="btn btn-success btn-sm" disabled={i.status !== 'SENT'} onClick={() => payInvoice(i.id)}>{tr('Mark Paid', 'Shëno si të Paguar')}</button></div></td></tr>
                ))}
                {sortedInvoices.length === 0 && <tr><td colSpan={6} className="muted">{tr('No invoices found', 'Nuk u gjetën invoice')}</td></tr>}
              </tbody></table>
            </div>
          </div>

          {showCreateInvoiceModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
              <div className="card" style={{ width: 'min(920px, 92vw)', maxHeight: '88vh', overflow: 'auto' }}>
                <div className="card-header"><div><div className="card-title">{tr('New Invoice', 'Invoice i Ri')}</div></div><button className="btn btn-secondary btn-sm" onClick={() => setShowCreateInvoiceModal(false)}>{tr('Close', 'Mbyll')}</button></div>
                <div className="card-body form-section">
                  <div className="field-row"><div className="field-group" style={{ flex: 1 }}><label className="field-label">{tr('Customer ID', 'ID e Klientit')}</label><input className="input" value={customerId} onChange={e => setCustomerId(e.target.value)} /></div><div className="field-group" style={{ flex: 1 }}><label className="field-label">{tr('Receiver NUI', 'NUI Marrësit')}</label><input className="input" placeholder="e.g. 810123456" value={receiverNui} onChange={e => setReceiverNui(e.target.value.toUpperCase())} /></div><div className="field-group"><label className="field-label">{tr('Issue Date', 'Data e Lëshimit')}</label><input className="input" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div></div>
                  <div>
                    <div className="field-label mb-2">{tr('Line Items', 'Rreshtat')}</div>
                    <table className="lines-table">
                      <thead>
                        <tr>
                          <th>{tr('Description', 'Përshkrimi')}</th>
                          <th style={{ width: 90 }}>{tr('Qty', 'Sasia')}</th>
                          <th style={{ width: 110 }}>{tr('Unit Price', 'Çmimi/Njësi')}</th>
                          <th style={{ width: 90 }}>{tr('Stock?', 'Stok?')}</th>
                          <th style={{ width: 140 }}>SKU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invLines.map((l, i) => (
                          <tr key={i}>
                            <td><input className="input" value={l.description} onChange={e => editInvLine(i, 'description', e.target.value)} /></td>
                            <td><input className="input" type="text" inputMode="decimal" value={l.quantity} onChange={e => editInvLine(i, 'quantity', e.target.value)} /></td>
                            <td><input className="input" type="text" inputMode="decimal" value={l.unitPrice} onChange={e => editInvLine(i, 'unitPrice', e.target.value)} /></td>
                            <td><input type="checkbox" checked={Boolean(l.isInventoryItem)} onChange={e => editInvLine(i, 'isInventoryItem', e.target.checked)} /></td>
                            <td><input className="input" placeholder="SKU-001" value={l.sku || ''} onChange={e => editInvLine(i, 'sku', e.target.value.toUpperCase())} disabled={!l.isInventoryItem} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="btn btn-secondary btn-sm mt-3" onClick={() => setInvLines(p => [...p, emptyInvLine])}>{tr('+ Add Line', '+ Shto Rresht')}</button>
                  </div>
                  <div className="btn-group" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary" onClick={() => setShowCreateInvoiceModal(false)}>{tr('Close', 'Mbyll')}</button><button className="btn btn-primary" onClick={createInvoice} disabled={loading}>{tr('Create Invoice', 'Krijo Invoice')}</button></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Inventory tab ───────────────────────── */}
      {tab === 'inventory' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Record Movement</div>
                <div className="card-subtitle">{tr('Weighted-average cost method', 'Metoda e kostos mesatare të ponderuar')}</div>
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
                <button className="btn btn-primary" onClick={recordMovement} disabled={loading}>{tr('Record Movement', 'Regjistro Lëvizje')}</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Inventory Valuation</div>
                <div className="card-subtitle">{tr('Current stock value by SKU', 'Vlera aktuale e stokut sipas SKU')}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={loadValuation}>↻</button>
            </div>
            {valuation ? (
              <>
                <div style={{ padding: '12px 20px', background: 'var(--blue-50)', borderBottom: '1px solid var(--blue-100)' }}>
                  <span className="muted">{tr('Total inventory value: ', 'Vlera totale e inventarit: ')}</span>
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
              <div className="empty-state"><div className="empty-state-icon">IN</div><div className="empty-state-text">{tr('No inventory yet', 'Ende nuk ka inventar')}</div></div>
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
                <div className="card-subtitle">{tr('Reverse a posted bill, invoice, or inventory movement', 'Kthe mbrapsht një faturë, invoice ose lëvizje inventari të postuar')}</div>
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
                  {loading ? tr('Applying…', 'Duke aplikuar…') : tr('Apply Storno', 'Apliko Storno')}
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

    </div>
  );
};

