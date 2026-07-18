import { useState, useRef, useEffect } from 'react';
import { useFanAssist, useTts } from '../hooks/useData.js';

const LANGUAGES = [
  { code: 'en', label: '🇺🇸 English' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'fr', label: '🇫🇷 Français' },
  { code: 'ar', label: '🇸🇦 العربية' },
  { code: 'zh', label: '🇨🇳 中文' },
  { code: 'pt', label: '🇧🇷 Português' },
  { code: 'de', label: '🇩🇪 Deutsch' },
  { code: 'hi', label: '🇮🇳 हिन्दी' },
];

const NEED_TYPES = [
  { id: 'wheelchair', label: 'Wheelchair', icon: '♿' },
  { id: 'visual', label: 'Visual', icon: '👁️' },
  { id: 'hearing', label: 'Hearing', icon: '👂' },
  { id: 'elderly', label: 'Elderly', icon: '🦯' },
  { id: 'cognitive', label: 'Cognitive', icon: '🧠' },
  { id: 'none', label: 'No assist needed', icon: '✅' },
] as const;

const QUICK_QUESTIONS = [
  'Where is the nearest restroom?',
  'Where is first aid?',
  'How do I get to my seat?',
  'Is there a quiet area?',
  'Where can I get water?',
  'How do I request a wheelchair?',
];

interface Message { id: string; role: 'user' | 'assistant'; text: string; offline?: boolean; }

interface Props { needType?: string; onNeedChange?: (need: string) => void; }

export function FanAssistant({ needType: initialNeed = 'none', onNeedChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'assistant', text: '👋 Welcome to SoFi Stadium! How can I help you today?' },
  ]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('en');
  const [needType, setNeedType] = useState(initialNeed);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showNeedPicker, setShowNeedPicker] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(true);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);

  const { assist, loading } = useFanAssist();
  const { speak, stop, playing } = useTts();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom || messages.length <= 2) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, loading]);

  const langMap: Record<string, string> = { en: 'en-US', es: 'es-US', fr: 'fr-FR', ar: 'ar-XA', zh: 'cmn-CN', pt: 'pt-BR', de: 'de-DE', hi: 'hi-IN' };

  const send = async (q?: string) => {
    const query = (q ?? input).trim();
    if (!query || loading) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: query }]);
    setAudioNotice(null);

    const result = await assist(query, language, needType !== 'none' ? needType : undefined);
    if (result) {
      const msg: Message = { id: crypto.randomUUID(), role: 'assistant', text: result.response, offline: result.offline };
      setMessages(prev => [...prev, msg]);
      if (audioEnabled) {
        if (result.offline) {
          setAudioNotice('🔇 Audio unavailable in offline mode.');
        } else {
          speak(result.response, langMap[language] ?? 'en-US');
        }
      }
    } else {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: '⚠️ Sorry, I encountered an issue connecting to the assistant. Please try asking again or check API connectivity.' }]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleNeedSelect = (need: typeof NEED_TYPES[number]['id']) => {
    setNeedType(need);
    setShowNeedPicker(false);
    onNeedChange?.(need);
  };

  return (
    <div className="chat-container" style={{ height: '100%', minHeight: 500 }}>
      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <select
          className="lang-select"
          value={language}
          onChange={e => setLanguage(e.target.value)}
          aria-label="Select language"
          id="fan-language-select"
        >
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>

        <button
          className="btn btn--ghost btn--sm"
          onClick={() => setShowNeedPicker(v => !v)}
          aria-expanded={showNeedPicker}
          aria-controls="need-picker"
          id="need-picker-toggle"
        >
          ♿ {NEED_TYPES.find(n => n.id === needType)?.icon ?? '✅'} Accessibility
        </button>

        <button
          className="btn btn--ghost btn--sm"
          onClick={() => setShowQuickPrompts(v => !v)}
          aria-expanded={showQuickPrompts}
        >
          💡 Quick Prompts {showQuickPrompts ? '▴' : '▾'}
        </button>

        <button
          className={`audio-toggle ${audioEnabled ? 'active' : ''}`}
          onClick={() => { if (playing) stop(); setAudioEnabled(v => !v); setAudioNotice(null); }}
          aria-pressed={audioEnabled}
          aria-label={audioEnabled ? 'Disable audio responses' : 'Enable audio responses'}
        >
          {playing ? '🔊 Playing…' : audioEnabled ? '🔊 Audio on' : '🔇 Audio off'}
        </button>
      </div>

      {/* Need picker */}
      {showNeedPicker && (
        <div id="need-picker" role="region" aria-label="Accessibility needs" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <p className="section-title" style={{ marginBottom: 'var(--space-3)' }}>Select your accessibility need:</p>
          <div className="need-grid">
            {NEED_TYPES.map(n => (
              <button
                key={n.id}
                className={`need-tile ${needType === n.id ? 'selected' : ''}`}
                onClick={() => handleNeedSelect(n.id)}
                aria-pressed={needType === n.id}
                id={`need-${n.id}`}
              >
                <span className="need-tile__icon" aria-hidden="true">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick questions */}
      {showQuickPrompts && (
        <div style={{ padding: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', borderBottom: '1px solid var(--border)' }}>
          {QUICK_QUESTIONS.map(q => (
            <button key={q} className="btn btn--ghost btn--sm" onClick={() => send(q)} aria-label={q}>
              {q}
            </button>
          ))}
        </div>
      )}

      {audioNotice && (
        <div style={{ padding: 'var(--space-2) var(--space-4)', background: 'rgba(245,158,11,0.1)', color: 'var(--color-amber-400)', fontSize: 'var(--text-xs)' }}>
          {audioNotice}
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="chat-messages" role="log" aria-live="polite" aria-label="Assistant conversation">
        {messages.map(m => (
          <div key={m.id} className={`chat-bubble chat-bubble--${m.role}${m.offline ? ' chat-bubble--offline' : ''}`}>
            {m.text}
            {m.offline && (
              <span
                style={{ display: 'block', fontSize: 'var(--text-xs)', opacity: 0.7, marginTop: 4 }}
                title="Gemini API unavailable or disabled. Using fast local rules engine fallback."
              >
                ⚡ Offline mode (Local Rules Engine)
              </span>
            )}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble chat-bubble--assistant">
            <span aria-label="Thinking" style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map(i => (
                <span key={i} className="skeleton" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', animationDelay: `${i * 0.2}s` }} />
              ))}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="chat-input"
          id="fan-chat-input"
          rows={1}
          placeholder="Ask me anything about SoFi Stadium…"
          value={input}
          onChange={handleInputChange}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          aria-label="Your question"
          style={{ resize: 'none', overflowY: 'auto' }}
        />
        <button
          className="btn btn--primary btn--lg"
          onClick={() => send()}
          disabled={loading || !input.trim()}
          aria-label="Send question"
          style={{ fontSize: 'var(--text-xl)', padding: 'var(--space-2) var(--space-4)' }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
