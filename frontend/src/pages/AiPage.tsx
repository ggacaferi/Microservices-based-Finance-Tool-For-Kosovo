import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const severityBadge: Record<string, string> = { critical: 'badge-red', warning: 'badge-amber', info: 'badge-blue' };

export const AiPage: React.FC = () => {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [eventHistory, setEventHistory] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ query: string; result: any }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadAll = async () => {
    try {
      const [s, i, e] = await Promise.all([
        axios.get('/api/v1/ai/snapshot'),
        axios.get('/api/v1/ai/insights'),
        axios.get('/api/v1/ai/event-history'),
      ]);
      setSnapshot(s.data);
      setInsights(i.data);
      setEventHistory(e.data);
    } catch { /* ignore */ }
  };

  const submitQuery = async () => {
    if (!query.trim() || loading) return;
    const q = query.trim();
    setQuery('');
    setLoading(true);
    try {
      const res = await axios.post('/api/v1/ai/query', { query: q });
      setChatHistory(prev => [...prev, { query: q, result: res.data }]);
    } catch (e: any) {
      setChatHistory(prev => [...prev, { query: q, result: { answer: `Error: ${e.response?.data?.message || e.message}`, confidence: 0, sources: [] } }]);
    }
    setLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  useEffect(() => { loadAll(); }, []);

  const suggestedQueries = [
    'How much have we spent total?',
    'Show me storno corrections',
    'Give me a financial overview',
    'Any issues or warnings?',
    'What is the net balance?',
  ];

  return (
    <div className="stack-lg">

      {/* KPI snapshot */}
      {snapshot && (
        <div className="grid-auto">
          {[
            { label: 'Net Expenses',     value: `€${(snapshot.totalExpenses ?? 0).toFixed(2)}`, color: 'var(--blue-700)' },
            { label: 'Events Ingested',  value: snapshot.entryCount,   color: 'var(--slate-900)' },
            { label: 'Storno Events',    value: snapshot.totalStornos, color: 'var(--amber-600)' },
            { label: 'AI Insights',      value: snapshot.insights?.length ?? 0, color: 'var(--green-600)' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-sub">Updated: {snapshot.lastUpdated ? new Date(snapshot.lastUpdated).toLocaleTimeString() : '—'}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2">
        {/* Chat panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <div>
              <div className="card-title">AI Financial Analyst</div>
              <div className="card-subtitle">Ask anything about your finances in plain language</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadAll}>↻</button>
          </div>

          {/* Chat history */}
          <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 300, maxHeight: 480, overflowY: 'auto' }}>
            {chatHistory.length === 0 && (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-state-icon">🤖</div>
                <div className="empty-state-text">Ask a financial question</div>
                <div className="empty-state-sub">Try one of the suggestions below</div>
              </div>
            )}
            {chatHistory.map((ch, i) => (
              <div key={i} className="stack-sm">
                {/* User bubble */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div className="chat-bubble chat-bubble-user">{ch.query}</div>
                </div>
                {/* AI bubble */}
                <div style={{ display: 'flex', justifyContent: 'flex-start', flexDirection: 'column' }}>
                  <div className="chat-bubble chat-bubble-ai">
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}>
                      {ch.result.answer}
                    </pre>
                  </div>
                  <div className="chat-meta" style={{ marginLeft: 4 }}>
                    Confidence: {(ch.result.confidence * 100).toFixed(0)}%
                    {ch.result.sources?.length > 0 && ` · Sources: ${ch.result.sources.join(', ')}`}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div className="chat-bubble chat-bubble-ai" style={{ color: 'var(--slate-400)' }}>
                  Analysing…
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestions */}
          <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {suggestedQueries.map(sq => (
              <button key={sq} className="suggested-chip" onClick={() => setQuery(sq)}>{sq}</button>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--slate-100)', display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="e.g. What is my net balance?"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitQuery()}
            />
            <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={submitQuery} disabled={loading || !query.trim()}>
              Send
            </button>
          </div>
        </div>

        <div className="stack-lg" style={{ minWidth: 0 }}>
          {/* AI Insights */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">AI Insights</div>
                <div className="card-subtitle">Automatic pattern detection</div>
              </div>
              <span className="badge badge-blue">{insights.length} active</span>
            </div>
            {insights.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-state-icon">✅</div>
                <div className="empty-state-text">No concerns detected</div>
              </div>
            ) : (
              <div className="card-body stack">
                {insights.slice(0, 8).map((ins: any) => (
                  <div key={ins.id} className="flex gap-3" style={{ alignItems: 'flex-start', paddingBottom: 10, borderBottom: '1px solid var(--slate-100)' }}>
                    <span className={`badge ${severityBadge[ins.severity] ?? 'badge-slate'}`} style={{ flexShrink: 0 }}>{ins.severity}</span>
                    <div>
                      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{ins.message}</div>
                      <div className="muted mt-2">{new Date(ins.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Event history */}
          {eventHistory.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Ingested Events</div>
                  <div className="card-subtitle">Read-model from domain events</div>
                </div>
                <span className="badge badge-slate">{eventHistory.length}</span>
              </div>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Kind</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {eventHistory.slice().reverse().slice(0, 12).map((ev: any, i: number) => (
                    <tr key={i}>
                      <td className="text-mono">{ev.reference}</td>
                      <td><span className={`badge ${ev.isStorno ? 'badge-amber' : 'badge-green'}`}>{ev.isStorno ? 'STORNO' : 'POSTED'}</span></td>
                      <td className="col-amount" style={{ color: ev.amount >= 0 ? 'var(--green-600)' : 'var(--amber-600)' }}>
                        €{Math.abs(ev.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
