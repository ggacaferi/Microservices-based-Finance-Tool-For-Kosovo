import React, { useState, useRef } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../useLanguage';

function normalizeAiPayload(raw: unknown): { answer: string; confidence: number; sources: string[] } {
  if (!raw || typeof raw !== 'object') {
    return { answer: 'Unexpected empty response from server.', confidence: 0, sources: [] };
  }
  const o = raw as Record<string, unknown>;
  const ans = o.answer;
  const answer = typeof ans === 'string' ? ans : ans != null ? JSON.stringify(ans) : '(No answer text)';
  const conf = Number(o.confidence);
  const confidence = Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0;
  const src = o.sources;
  const sources = Array.isArray(src) ? src.filter((s): s is string => typeof s === 'string') : [];
  return { answer, confidence, sources };
}

export const AiPage: React.FC = () => {
  const lang = useLanguage();
  const tr = (en: string, sq: string) => (lang === 'en' ? en : sq);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ query: string; result: ReturnType<typeof normalizeAiPayload> }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const submitQuery = async () => {
    if (!query.trim() || loading) return;
    const q = query.trim();
    setQuery('');
    setLoading(true);
    try {
      const res = await api.post('/ai/query', { query: q });
      const result = normalizeAiPayload(res.data);
      setChatHistory((prev) => [...prev, { query: q, result }]);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: unknown } }; message?: string };
      const msg =
        typeof err.response?.data?.message === 'string'
          ? err.response.data.message
          : Array.isArray(err.response?.data?.message)
            ? (err.response?.data?.message as string[]).join(', ')
            : err.message ?? 'Request failed';
      setChatHistory((prev) => [
        ...prev,
        {
          query: q,
          result: {
            answer: tr(`Could not reach the AI service: ${msg}`, `Shërbimi AI nuk u arrit: ${msg}`),
            confidence: 0,
            sources: [],
          },
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const suggestedQueries = [
    tr('How much have we spent total?', 'Sa kemi shpenzuar gjithsej?'),
    tr('Give me a financial overview', 'Më jep një përmbledhje financiare'),
    tr('Any issues or warnings?', 'Ka ndonjë problem apo paralajmërim?'),
    tr('What is the net balance?', 'Cili është bilanci neto?'),
  ];

  return (
    <div className="ai-analyst-page flex min-h-0 flex-1 flex-col">
      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden shadow-md">
        <div className="card-header shrink-0">
          <div className="min-w-0">
            <div className="card-title">{tr('AI Financial Analyst', 'Analisti Financiar AI')}</div>
            <div className="card-subtitle">{tr('Ask anything about your finances in plain language', 'Pyet gjithçka për financat në gjuhë të thjeshtë')}</div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {chatHistory.length === 0 && (
            <div className="empty-state my-auto py-12">
              <div className="empty-state-icon">🤖</div>
              <div className="empty-state-text">{tr('Ask a financial question', 'Bëj një pyetje financiare')}</div>
              <div className="empty-state-sub">{tr('Try one of the suggestions below', 'Provo një nga sugjerimet më poshtë')}</div>
            </div>
          )}
          {chatHistory.map((ch, i) => (
            <div key={i} className="stack-sm">
              <div className="flex justify-end">
                <div className="chat-bubble chat-bubble-user">{ch.query}</div>
              </div>
              <div className="flex flex-col items-start">
                <div className="chat-bubble chat-bubble-ai border-slate-200 bg-white text-on-surface shadow-sm">
                  <pre className="m-0 max-w-full whitespace-pre-wrap break-words font-body-md text-[13px] leading-relaxed text-on-surface">
                    {ch.result.answer}
                  </pre>
                </div>
                <div className="chat-meta ml-1 mt-1">
                  {tr('Confidence', 'Besueshmëria')}: {(ch.result.confidence * 100).toFixed(0)}%
                  {ch.result.sources.length > 0 && ` · ${tr('Sources', 'Burimet')}: ${ch.result.sources.join(', ')}`}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="chat-bubble chat-bubble-ai border border-outline-variant bg-surface-container-low text-on-surface-variant">
                {tr('Analysing…', 'Duke analizuar…')}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 px-5 pb-3">
          {suggestedQueries.map((sq) => (
            <button key={sq} type="button" className="suggested-chip" onClick={() => setQuery(sq)}>
              {sq}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-200 px-5 py-3">
          <input
            className="input min-h-10 min-w-0 flex-1 leading-normal"
            placeholder="e.g. What is my net balance?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitQuery()}
          />
          <button
            className="btn btn-primary shrink-0"
            type="button"
            onClick={submitQuery}
            disabled={loading || !query.trim()}
          >
            {tr('Send', 'Dërgo')}
          </button>
        </div>
      </div>
    </div>
  );
};
