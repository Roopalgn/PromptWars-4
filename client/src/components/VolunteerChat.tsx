import { useState, useRef, useEffect } from 'react';
import { useAsk } from '../hooks/useData.js';

interface Message { id: string; role: 'user' | 'assistant'; text: string; offline?: boolean; }

export function VolunteerChat() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'assistant', text: 'Stadium Copilot ready. Ask me about zone status, tasks, escort requests, or incidents.' },
  ]);
  const [input, setInput] = useState('');
  const { ask, loading } = useAsk();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    const result = await ask(q);
    if (result) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: result.response, offline: result.offline }]);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="chat-container" style={{ height: '100%', minHeight: 400 }}>
      <div className="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
        {messages.map(m => (
          <div key={m.id} className={`chat-bubble chat-bubble--${m.role}${m.offline ? ' chat-bubble--offline' : ''}`}>
            {m.text}
            {m.offline && <span style={{ display: 'block', fontSize: 'var(--text-xs)', opacity: 0.7, marginTop: 4 }}>⚡ Offline mode</span>}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble chat-bubble--assistant">
            <span className="skeleton" style={{ display: 'inline-block', width: 120, height: 14 }} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="chat-input"
          id="volunteer-chat-input"
          rows={1}
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          aria-label="Message input"
        />
        <button className="btn btn--primary" onClick={send} disabled={loading || !input.trim()} aria-label="Send message">
          {loading ? '…' : '↑'}
        </button>
      </div>
    </div>
  );
}
