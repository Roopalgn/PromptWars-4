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

interface Message { id: string; role: 'user' | 'assistant'; text: string; }

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
  const { assist, loading } = useFanAssist();
  const { speak, stop, playing } = useTts();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const langMap: Record<string, string> = { en: 'en-US', es: 'es-US', fr: 'fr-FR', ar: 'ar-XA', zh: 'cmn-CN', pt: 'pt-BR', de: 'de-DE', hi: 'hi-IN' };

  const send = async (q?: string) => {
    const query = (q ?? input).trim();
    if (!query || loading) return;
    setInput('');
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: query }]);
    const result = await assist(query, language, needType !== 'none' ? needType : undefined);
    if (result) {
      const msg: Message = { id: crypto.randomUUID(), role: 'assistant', text: result.response };
      setMessages(prev => [...prev, msg]);
      if (audioEnabled && !result.offline) {
        speak(result.response, langMap[language] ?? 'en-US');
      }
    }
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
          className={`audio-toggle ${audioEnabled ? 'active' : ''}`}
          onClick={() => { if (playing) stop(); setAudioEnabled(v => !v); }}
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
      {messages.length <= 1 && (
        <div style={{ padding: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {QUICK_QUESTIONS.map(q => (
            <button key={q} className="btn btn--ghost btn--sm" onClick={() => send(q)} aria-label={q}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages" role="log" aria-live="polite" aria-label="Assistant conversation">
        {messages.map(m => (
          <div key={m.id} className={`chat-bubble chat-bubble--${m.role}`}>
            {m.text}
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
          className="chat-input"
          id="fan-chat-input"
          rows={1}
          placeholder="Ask me anything about SoFi Stadium…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          aria-label="Your question"
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
