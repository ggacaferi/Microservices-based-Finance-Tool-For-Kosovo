import React, { useState } from 'react';
import axios from 'axios';

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

const emptyInvoiceLine: InvoiceLineForm = {
  description: '',
  quantity: 1,
  unitPrice: 0
};

export const DailyOpsPage: React.FC = () => {
  const [supplierId, setSupplierId] = useState('SUP-1');
  const [issueDate, setIssueDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [currency, setCurrency] = useState('EUR');
  const [lines, setLines] = useState<BillLineForm[]>([emptyLine]);
  const [loading, setLoading] = useState(false);
  const [activeBill, setActiveBill] = useState<BillResponse | null>(null);
  const [lookupId, setLookupId] = useState('');
  const [customerId, setCustomerId] = useState('CUS-1');
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineForm[]>([
    emptyInvoiceLine
  ]);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceResponse | null>(null);
  const [invoiceLookupId, setInvoiceLookupId] = useState('');
  const [sku, setSku] = useState('SKU-1');
  const [itemDescription, setItemDescription] = useState('Office item');
  const [movementType, setMovementType] = useState<'RECEIPT' | 'ISSUE'>('RECEIPT');
  const [movementQty, setMovementQty] = useState(1);
  const [movementUnitCost, setMovementUnitCost] = useState(10);
  const [valuation, setValuation] = useState<InventoryValuation | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [stornoType, setStornoType] = useState<'bill' | 'invoice' | 'inventory'>('bill');
  const [stornoEntityId, setStornoEntityId] = useState('');
  const [stornoReason, setStornoReason] = useState('Correction of erroneous entry');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const api = axios.create({
    baseURL: '/api/v1'
  });

  const getErrorMessage = (e: any, fallback: string): string => {
    const message = e?.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    if (typeof e?.message === 'string') return e.message;
    return fallback;
  };

  const handleLineChange = (
    index: number,
    field: keyof BillLineForm,
    value: string
  ) => {
    setLines((prev) =>
      prev.map((l, i) =>
        i === index
          ? {
              ...l,
              [field]:
                field === 'quantity' || field === 'unitPrice'
                  ? Number(value)
                  : value
            }
          : l
      )
    );
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine]);

  const handleInvoiceLineChange = (
    index: number,
    field: keyof InvoiceLineForm,
    value: string
  ) => {
    setInvoiceLines((prev) =>
      prev.map((l, i) =>
        i === index
          ? {
              ...l,
              [field]: field === 'quantity' || field === 'unitPrice' ? Number(value) : value
            }
          : l
      )
    );
  };

  const addInvoiceLine = () => setInvoiceLines((prev) => [...prev, emptyInvoiceLine]);

  const loadActivities = async () => {
    const res = await api.get<ActivityEntry[]>('/operations/activities?limit=12');
    setActivities(res.data);
  };

  const loadValuation = async () => {
    const res = await api.get<InventoryValuation>('/inventory/valuation');
    setValuation(res.data);
  };

  const createBill = async () => {
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const payload = {
        supplierId,
        issueDate,
        currency,
        lineItems: lines
      };
      const res = await api.post<BillResponse>('/bills', payload);
      setActiveBill(res.data);
      setLookupId(res.data.id);
      setStornoEntityId(res.data.id);
      await loadActivities();
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to create bill'));
    } finally {
      setLoading(false);
    }
  };

  const postBill = async () => {
    if (!activeBill) return;
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const res = await api.post<BillResponse>(`/bills/${activeBill.id}/post`);
      setActiveBill(res.data);
      await loadActivities();
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to post bill'));
    } finally {
      setLoading(false);
    }
  };

  const fetchBill = async () => {
    if (!lookupId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<BillResponse>(`/bills/${lookupId}`);
      setActiveBill(res.data);
      setStornoEntityId(res.data.id);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to fetch bill'));
    } finally {
      setLoading(false);
    }
  };

  const createInvoice = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<InvoiceResponse>('/invoices', {
        customerId,
        issueDate,
        currency,
        lines: invoiceLines
      });
      setActiveInvoice(res.data);
      setInvoiceLookupId(res.data.id);
      setStornoEntityId(res.data.id);
      await loadActivities();
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to create invoice'));
    } finally {
      setLoading(false);
    }
  };

  const sendInvoice = async () => {
    if (!activeInvoice) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<InvoiceResponse>(`/invoices/${activeInvoice.id}/send`);
      setActiveInvoice(res.data);
      await loadActivities();
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to send invoice'));
    } finally {
      setLoading(false);
    }
  };

  const payInvoice = async () => {
    if (!activeInvoice) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<InvoiceResponse>(`/invoices/${activeInvoice.id}/pay`);
      setActiveInvoice(res.data);
      await loadActivities();
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to mark invoice as paid'));
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoice = async () => {
    if (!invoiceLookupId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<InvoiceResponse>(`/invoices/${invoiceLookupId}`);
      setActiveInvoice(res.data);
      setStornoEntityId(res.data.id);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to fetch invoice'));
    } finally {
      setLoading(false);
    }
  };

  const recordMovement = async () => {
    setError(null);
    setLoading(true);
    try {
      const movement = await api.post('/inventory/movements', {
        sku,
        description: itemDescription,
        type: movementType,
        quantity: movementQty,
        unitCost: movementUnitCost
      });
      setStornoEntityId(movement.data.id);
      setStornoType('inventory');
      await loadValuation();
      await loadActivities();
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to record inventory movement'));
    } finally {
      setLoading(false);
    }
  };

  const runStorno = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (!stornoEntityId) {
      setError('Please enter an Entity ID');
      return;
    }
    
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    
    try {
      console.log('Starting storno for:', { stornoType, stornoEntityId, stornoReason });
      
      const res = await api.post('/operations/storno', {
        entityType: stornoType,
        entityId: stornoEntityId,
        reason: stornoReason
      });

      console.log('Storno response received:', res.data);

      // Safely update state based on entity type
      if (stornoType === 'bill' && res.data) {
        console.log('Setting activeBill to:', res.data);
        setActiveBill(res.data);
      }
      if (stornoType === 'invoice' && res.data) {
        console.log('Setting activeInvoice to:', res.data);
        setActiveInvoice(res.data);
      }
      
      // Reload data
      console.log('Reloading valuation and activities...');
      await Promise.all([
        loadValuation().catch((err) => { console.error('loadValuation error:', err); }),
        loadActivities().catch((err) => { console.error('loadActivities error:', err); })
      ]);
      
      console.log('Storno completed successfully');
      setSuccessMessage(`✓ Storno applied successfully for ${stornoType} ${stornoEntityId}`);
    } catch (e: any) {
      console.error('Storno error:', e);
      console.error('Error response:', e?.response?.data);
      setError(getErrorMessage(e, 'Failed storno operation'));
    } finally {
      setLoading(false);
      console.log('Storno operation finished');
    }
  };

  React.useEffect(() => {
    loadActivities().catch(() => undefined);
    loadValuation().catch(() => undefined);
  }, []);

  return (
    <div className="content-grid">
      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Capture Supplier Bill (Fatura Hyrëse)</div>
            <div className="card-subtitle">
              Draft a bill in Daily Operations before it flows to the Ledger.
            </div>
          </div>
          <div className="pill-row">
            <span className="tag-muted">Context: OperationsService</span>
            <span className="tag">POST /api/bills</span>
          </div>
        </header>

        <div className="stack">
          <div className="field-row">
            <div style={{ flex: 1 }}>
              <div className="field-label">Supplier ID</div>
              <input
                className="input"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              />
            </div>
            <div>
              <div className="field-label">Issue date</div>
              <input
                type="date"
                className="input"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div style={{ width: 120 }}>
              <div className="field-label">Currency</div>
              <select
                className="select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div>
            <div className="field-label">Line items</div>
            <div className="muted" style={{ marginBottom: 8 }}>
              Description = what was bought, Quantity = units, Unit Price = price per unit,
              Tax Category = VAT treatment for that line.
            </div>
            <div className="stack">
              <div className="field-row">
                <div style={{ flex: 1 }}>
                  <div className="field-label">Description</div>
                </div>
                <div style={{ width: 120 }}>
                  <div className="field-label">Quantity</div>
                </div>
                <div style={{ width: 120 }}>
                  <div className="field-label">Unit Price</div>
                </div>
                <div style={{ width: 180 }}>
                  <div className="field-label">Tax Category</div>
                </div>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="field-row">
                  <input
                    className="input"
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) =>
                      handleLineChange(idx, 'description', e.target.value)
                    }
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    className="input"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) =>
                      handleLineChange(idx, 'quantity', e.target.value)
                    }
                    style={{ width: 120 }}
                  />
                  <input
                    type="number"
                    className="input"
                    placeholder="Unit price"
                    value={line.unitPrice}
                    onChange={(e) =>
                      handleLineChange(idx, 'unitPrice', e.target.value)
                    }
                    style={{ width: 120 }}
                  />
                  <select
                    className="select"
                    value={line.taxCategoryId}
                    onChange={(e) =>
                      handleLineChange(idx, 'taxCategoryId', e.target.value)
                    }
                    style={{ width: 180 }}
                  >
                    <option value="43">43 · Standard VAT</option>
                    <option value="31">31 · Exempt</option>
                    <option value="28">28 · Reverse charge</option>
                  </select>
                </div>
              ))}
              <button
                type="button"
                className="button-secondary"
                onClick={addLine}
              >
                + Add line
              </button>
            </div>
          </div>

          <div>
            <button
              type="button"
              className="button"
              disabled={loading}
              onClick={createBill}
            >
              {loading ? 'Working…' : 'Create Draft Bill'}
            </button>
          </div>

          {error && <div className="muted" style={{ color: '#fecaca' }}>{error}</div>}
          {successMessage && <div className="muted" style={{ color: '#86efac' }}>{successMessage}</div>}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Bill lifecycle &amp; Compliance view</div>
            <div className="card-subtitle">
              Post the bill and see TaxCategory validation via cached rules.
            </div>
          </div>
        </header>

        <div className="stack">
          <div className="field-row">
            <div style={{ flex: 1 }}>
              <div className="field-label">Bill ID</div>
              <input
                className="input"
                placeholder="Paste bill UUID"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="button-secondary"
              disabled={loading || !lookupId}
              onClick={fetchBill}
            >
              Load
            </button>
            <button
              type="button"
              className="button"
              disabled={loading || !activeBill}
              onClick={postBill}
            >
              Post bill
            </button>
          </div>

          {activeBill ? (
            <>
              <div className="pill-row">
                <span
                  className={
                    activeBill.status === 'POSTED'
                      ? 'tag-success'
                      : activeBill.status === 'DRAFT'
                      ? 'tag-warning'
                      : 'tag-muted'
                  }
                >
                  Status: {activeBill.status}
                </span>
                <span className="tag-muted">
                  Total net: {(activeBill.totalNetAmount ?? 0).toFixed(2)}{' '}
                  {activeBill.currency}
                </span>
              </div>
              <div className="json-preview">
                <pre>{JSON.stringify(activeBill, null, 2)}</pre>
              </div>
              {activeBill.workflow && (
                <div className="json-preview" style={{ maxHeight: 'none' }}>
                  <div><strong>Storno workflow (domain event driven)</strong></div>
                  <div className="muted">
                    Event emitted: {activeBill.workflow.event?.type} with payload
                    {' '}
                    {activeBill.workflow.event?.payload?.OriginalReference}
                  </div>
                  <div className="muted">
                    Ledger storno entries: {activeBill.workflow.ledger?.journalEntries?.length ?? 0}
                  </div>
                  <div className="muted">
                    AI financial snapshot total expenses:{' '}
                    {activeBill.workflow.aiSnapshot?.totalExpenses?.toFixed(2) ?? '0.00'}
                  </div>
                </div>
              )}
              <div className="muted">
                Tax codes are validated against cached Compliance rules:
                43/31/28. No round-trip to Compliance at posting time.
              </div>
            </>
          ) : (
            <div className="muted">
              Create or load a bill to inspect its lifecycle. Once integrated,
              posting will emit a domain event to the Ledger service.
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Invoicing (Accounts Receivable)</div>
            <div className="card-subtitle">
              Manage Fatura Dalëse lifecycle: Draft → Sent → Paid.
            </div>
          </div>
          <div className="pill-row">
            <span className="tag">POST /api/v1/invoices</span>
          </div>
        </header>

        <div className="stack">
          <div className="field-row">
            <div style={{ flex: 1 }}>
              <div className="field-label">Customer ID</div>
              <input
                className="input"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="field-label">Invoice ID</div>
              <input
                className="input"
                value={invoiceLookupId}
                onChange={(e) => setInvoiceLookupId(e.target.value)}
              />
            </div>
            <button type="button" className="button-secondary" onClick={fetchInvoice}>
              Load
            </button>
          </div>

          {invoiceLines.map((line, idx) => (
            <div key={idx} className="field-row">
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Description"
                value={line.description}
                onChange={(e) => handleInvoiceLineChange(idx, 'description', e.target.value)}
              />
              <input
                className="input"
                style={{ width: 120 }}
                type="number"
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) => handleInvoiceLineChange(idx, 'quantity', e.target.value)}
              />
              <input
                className="input"
                style={{ width: 120 }}
                type="number"
                placeholder="Unit price"
                value={line.unitPrice}
                onChange={(e) => handleInvoiceLineChange(idx, 'unitPrice', e.target.value)}
              />
            </div>
          ))}

          <div className="field-row">
            <button type="button" className="button-secondary" onClick={addInvoiceLine}>
              + Add invoice line
            </button>
            <button type="button" className="button" onClick={createInvoice} disabled={loading}>
              Create Draft Invoice
            </button>
            <button type="button" className="button-secondary" onClick={sendInvoice} disabled={loading || !activeInvoice}>
              Send
            </button>
            <button type="button" className="button-secondary" onClick={payInvoice} disabled={loading || !activeInvoice}>
              Mark Paid
            </button>
          </div>

          {activeInvoice && (
            <div className="json-preview">
              <pre>{JSON.stringify(activeInvoice, null, 2)}</pre>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Inventory Monitoring</div>
            <div className="card-subtitle">
              Track receipts/issues and calculate simple inventory valuation.
            </div>
          </div>
          <div className="pill-row">
            <span className="tag">GET /api/v1/inventory/valuation</span>
          </div>
        </header>

        <div className="stack">
          <div className="field-row">
            <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" />
            <input
              className="input"
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              placeholder="Item description"
            />
          </div>
          <div className="field-row">
            <select
              className="select"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as 'RECEIPT' | 'ISSUE')}
            >
              <option value="RECEIPT">RECEIPT</option>
              <option value="ISSUE">ISSUE</option>
            </select>
            <input
              className="input"
              type="number"
              value={movementQty}
              onChange={(e) => setMovementQty(Number(e.target.value))}
              placeholder="Quantity"
            />
            <input
              className="input"
              type="number"
              value={movementUnitCost}
              onChange={(e) => setMovementUnitCost(Number(e.target.value))}
              placeholder="Unit cost"
            />
            <button className="button" type="button" onClick={recordMovement} disabled={loading}>
              Record movement
            </button>
          </div>

          <div className="muted">
            Total valuation: {valuation ? valuation.totalValue.toFixed(2) : '0.00'} {currency}
          </div>
          <div className="json-preview">
            <pre>{JSON.stringify(valuation, null, 2)}</pre>
          </div>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Correction Logic (Storno)</div>
            <div className="card-subtitle">
              Reverse erroneous bill, invoice, or inventory movements.
            </div>
          </div>
        </header>

        <div className="stack">
          <div className="field-row">
            <select
              className="select"
              value={stornoType}
              onChange={(e) => setStornoType(e.target.value as 'bill' | 'invoice' | 'inventory')}
            >
              <option value="bill">Bill</option>
              <option value="invoice">Invoice</option>
              <option value="inventory">Inventory movement</option>
            </select>
            <input
              className="input"
              value={stornoEntityId}
              onChange={(e) => setStornoEntityId(e.target.value)}
              placeholder="Entity ID"
            />
          </div>
          <input
            className="input"
            value={stornoReason}
            onChange={(e) => setStornoReason(e.target.value)}
            placeholder="Reason for storno"
          />
          <button className="button" type="button" onClick={(e) => runStorno(e)} disabled={loading || !stornoEntityId}>
            Apply storno
          </button>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Daily Activity Documentation</div>
            <div className="card-subtitle">
              Timeline of intent captured in OperationsService.
            </div>
          </div>
          <button className="button-secondary" type="button" onClick={loadActivities}>
            Refresh
          </button>
        </header>

        <div className="stack">
          {activities.length === 0 ? (
            <div className="muted">No activity yet.</div>
          ) : (
            activities.map((entry) => (
              <div key={entry.id} className="json-preview" style={{ maxHeight: 'none' }}>
                <div className="muted">{new Date(entry.at).toLocaleString()}</div>
                <div>{entry.type}</div>
                <div className="muted">{entry.summary}</div>
                {entry.entityId && <div className="muted">ID: {entry.entityId}</div>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

