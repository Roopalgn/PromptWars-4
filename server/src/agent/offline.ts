/**
 * Deterministic offline fallback engine.
 * Used when GEMINI_API_KEY is unset or Gemini API returns an error.
 *
 * Processes natural language queries using keyword matching against
 * the rules-engine output. No LLM required — works fully offline.
 */
import type { RulesEngineOutput } from '../types/index.js';

type OfflineIntent =
  | 'zone-status'
  | 'task-queue'
  | 'escort-queue'
  | 'gate-status'
  | 'incident'
  | 'help'
  | 'unknown';

const INTENT_PATTERNS: Array<{ intent: OfflineIntent; keywords: string[] }> = [
  { intent: 'zone-status', keywords: ['zone', 'crowd', 'busy', 'occupancy', 'capacity', 'full', 'critical'] },
  { intent: 'task-queue', keywords: ['task', 'priority', 'what should i do', 'next', 'queue', 'top'] },
  { intent: 'escort-queue', keywords: ['escort', 'wheelchair', 'accessibility', 'help fan', 'assist'] },
  { intent: 'gate-status', keywords: ['gate', 'delay', 'entry', 'entrance', 'queue at gate'] },
  { intent: 'incident', keywords: ['incident', 'medical', 'security', 'emergency', 'alert'] },
  { intent: 'help', keywords: ['help', 'what can you do', 'commands', 'options'] },
];

function detectIntent(query: string): OfflineIntent {
  const normalized = query.toLowerCase().replace(/[^\w\s]/g, ' ');
  for (const { intent, keywords } of INTENT_PATTERNS) {
    if (keywords.some(k => normalized.includes(k))) return intent;
  }
  return 'unknown';
}

function formatTaskList(output: RulesEngineOutput, limit = 5): string {
  const top = output.tasks.slice(0, limit);
  if (top.length === 0) return 'No active tasks right now.';
  return top
    .map((t, i) => `${i + 1}. [P${t.priority}] ${t.type.toUpperCase()} — ${t.reasoning}`)
    .join('\n');
}

function formatZoneSummary(output: RulesEngineOutput): string {
  const critical = output.zoneStatuses.filter(z => z.status === 'critical');
  const busy = output.zoneStatuses.filter(z => z.status === 'busy');
  if (critical.length === 0 && busy.length === 0) {
    return 'All zones are comfortable. No crowd issues at this time.';
  }
  const parts: string[] = [];
  if (critical.length > 0) {
    parts.push(`⚠️ CRITICAL zones (${critical.length}): ${critical.map(z => `${z.zoneId} (${Math.round(z.weatherAdjustedPct)}%)`).join(', ')}`);
  }
  if (busy.length > 0) {
    parts.push(`🟡 Busy zones (${busy.length}): ${busy.map(z => z.zoneId).join(', ')}`);
  }
  return parts.join('\n');
}

function formatEscortSummary(output: RulesEngineOutput): string {
  const escortTasks = output.tasks.filter(t => t.type === 'escort');
  if (escortTasks.length === 0) return 'No pending escort requests right now.';
  return `${escortTasks.length} escort task(s) pending:\n` +
    escortTasks.slice(0, 3).map(t => `• ${t.reasoning}`).join('\n');
}

function formatGateSummary(output: RulesEngineOutput): string {
  const gateTasks = output.tasks.filter(t => t.type === 'gate-rebalance');
  if (gateTasks.length === 0) return 'No gate delays reported.';
  return `${gateTasks.length} gate delay(s):\n` +
    gateTasks.map(t => `• ${t.reasoning}`).join('\n');
}

function formatIncidentSummary(output: RulesEngineOutput): string {
  const incidents = output.tasks.filter(t =>
    t.type === 'medical-response' || t.type === 'security-response'
  );
  if (incidents.length === 0) return 'No active incidents.';
  return `${incidents.length} active incident(s):\n` +
    incidents.map(t => `• [P${t.priority}] ${t.reasoning}`).join('\n');
}

const HELP_TEXT = `I can help you with:
• Zone crowd levels ("Which zones are busy?")
• Task queue ("What's my top task?")
• Escort requests ("Any wheelchair escorts pending?")
• Gate delays ("Gate status?")
• Active incidents ("Any medical incidents?")

This is offline mode — real-time AI responses require GEMINI_API_KEY.`;

/**
 * Language-aware offline notice prepended for non-English queries.
 * Honest acknowledgement that offline mode responds in English only.
 * Covers the 6 languages supported in FanAssistant.tsx.
 */
const OFFLINE_NOTICE: Record<string, string> = {
  es: '⚠️ Modo sin conexión — respondiendo en inglés. / Offline mode — responding in English.\n\n',
  fr: '⚠️ Mode hors ligne — réponse en anglais. / Offline mode — responding in English.\n\n',
  ar: '⚠️ وضع غير متصل — الرد باللغة الإنجليزية. / Offline mode — responding in English.\n\n',
  zh: '⚠️ 离线模式 — 用英语回复。/ Offline mode — responding in English.\n\n',
  pt: '⚠️ Modo offline — respondendo em inglês. / Offline mode — responding in English.\n\n',
  hi: '⚠️ ऑफ़लाइन मोड — अंग्रेज़ी में उत्तर दे रहे हैं। / Offline mode — responding in English.\n\n',
  de: '⚠️ Offline-Modus — Antwort auf Englisch. / Offline mode — responding in English.\n\n',
  ja: '⚠️ オフラインモード — 英語で返答します。/ Offline mode — responding in English.\n\n',
};

/**
 * Process a query offline using keyword matching + rules engine output.
 * Always returns a valid string response.
 *
 * @param query   The user's raw query (may contain a language hint appended by app.ts)
 * @param engineOutput  Current rules engine output for live data
 * @param language  ISO 639-1 language code from the request (default 'en')
 */
export function processOfflineQuery(
  query: string,
  engineOutput: RulesEngineOutput,
  language = 'en',
): string {
  const intent = detectIntent(query);
  const notice = language !== 'en' ? (OFFLINE_NOTICE[language] ?? `⚠️ Offline mode — responding in English.\n\n`) : '';

  let body: string;
  switch (intent) {
    case 'zone-status':
      body = formatZoneSummary(engineOutput);
      break;
    case 'task-queue':
      body = `Top tasks:\n${formatTaskList(engineOutput)}`;
      break;
    case 'escort-queue':
      body = formatEscortSummary(engineOutput);
      break;
    case 'gate-status':
      body = formatGateSummary(engineOutput);
      break;
    case 'incident':
      body = formatIncidentSummary(engineOutput);
      break;
    case 'help':
      body = HELP_TEXT;
      break;
    default:
      body = `I'm in offline mode and couldn't understand your query. Try asking about zones, tasks, escorts, gates, or incidents.\n\n${HELP_TEXT}`;
  }

  return notice + body;
}

