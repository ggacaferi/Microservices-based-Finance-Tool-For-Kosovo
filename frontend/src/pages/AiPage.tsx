import React, { useState, useRef } from 'react';
import axios from 'axios';
import { getLanguage } from '../language';
import { useLanguage } from '../useLanguage';

const api = axios.create({ baseURL: '/api/v1' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('guri_token');
  const rawUser = localStorage.getItem('guri_user');
  let tenantId: string | undefined;
  try { tenantId = rawUser ? JSON.parse(rawUser)?.tenantId : undefined; } catch {}
  config.headers = config.headers || {};
  if (token) (config.headers as any).Authorization = `Bearer ${token}`;
  if (tenantId) (config.headers as any)['x-tenant-id'] = tenantId;
  (config.headers as any)['x-lang'] = getLanguage();
  return config;
});

export const AiPage: React.FC = () => {
  const lang = useLanguage();
  const tr = (en: string, sq: string) => (lang === 'en' ? en : sq);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ query: string; result: any }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const submitQuery = async () => {
    if (!query.trim() || loading) return;
    const q = query.trim();
    setQuery('');
    setLoading(true);
    try {
      const res = await api.post('/ai/query', { query: q });
      setChatHistory(prev => [...prev, { query: q, result: res.data }]);
    } catch (e: any) {
      setChatHistory(prev => [...prev, { query: q, result: { answer: `Error: ${e.response?.data?.message || e.message}`, confidence: 0, sources: [] } }]);
    }
    setLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const suggestedQueries = [
    tr('How much have we spent total?', 'Sa kemi shpenzuar gjithsej?'),
    tr('Give me a financial overview', 'Më jep një përmbledhje financiare'),
    tr('Any issues or warnings?', 'Ka ndonjë problem apo paralajmërim?'),
    tr('What is the net balance?', 'Cili është bilanci neto?'),
  ];

  return (
    <div
      className="ai-analyst-page"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="card"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--r-lg)',
        }}
      >
        <div className="card-header" style={{ flexShrink: 0 }}>
          <div>
            <div className="card-title">{tr('AI Financial Analyst', 'Analisti Financiar AI')}</div>
            <div className="card-subtitle">{tr('Ask anything about your finances in plain language', 'Pyet gjithçka për financat në gjuhë të thjeshtë')}</div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            overflowY: 'auto',
          }}
        >
          {chatHistory.length === 0 && (
            <div className="empty-state" style={{ padding: 24, margin: 'auto 0' }}>
              <div className="empty-state-icon">🤖</div>
              <div className="empty-state-text">{tr('Ask a financial question', 'Bëj një pyetje financiare')}</div>
              <div className="empty-state-sub">{tr('Try one of the suggestions below', 'Provo një nga sugjerimet më poshtë')}</div>
            </div>
          )}
          {chatHistory.map((ch, i) => (
            <div key={i} className="stack-sm">
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div className="chat-bubble chat-bubble-user">{ch.query}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-start', flexDirection: 'column' }}>
                <div className="chat-bubble chat-bubble-ai">
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}>
                    {ch.result.answer}
                  </pre>
                </div>
                <div className="chat-meta" style={{ marginLeft: 4 }}>
                  {tr('Confidence', 'Besueshmëria')}: {(ch.result.confidence * 100).toFixed(0)}%
                  {ch.result.sources?.length > 0 && ` · Sources: ${ch.result.sources.join(', ')}`}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div className="chat-bubble chat-bubble-ai" style={{ color: 'var(--slate-400)' }}>
                {tr('Analysing…', 'Duke analizuar…')}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          {suggestedQueries.map(sq => (
            <button key={sq} className="suggested-chip" type="button" onClick={() => setQuery(sq)}>{sq}</button>
          ))}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--slate-100)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <input
            className="input"
            placeholder="e.g. What is my net balance?"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitQuery()}
          />
          <button className="btn btn-primary" style={{ flexShrink: 0 }} type="button" onClick={submitQuery} disabled={loading || !query.trim()}>
            {tr('Send', 'Dërgo')}
          </button>
        </div>
      </div>
    </div>
  );
};
