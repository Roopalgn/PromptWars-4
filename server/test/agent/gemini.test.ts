/**
 * Unit tests for the Gemini agent (processWithGemini).
 *
 * We test two paths:
 * 1. No GEMINI_API_KEY → immediate offline fallback (no Gemini call made)
 * 2. GEMINI_API_KEY set + Gemini throws → error fallback to offline engine
 * 3. GEMINI_API_KEY set + Gemini returns no function calls → text response used
 * 4. Cache hit → cached response returned without new API call
 *
 * The @google/genai module is mocked so no network calls are made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal RulesEngineOutput fixture
// ---------------------------------------------------------------------------
import type { RulesEngineOutput } from '../../src/types/index.js';

const EMPTY_OUTPUT: RulesEngineOutput = {
  tasks: [],
  zoneStatuses: [
    { zoneId: 'gate-a', status: 'comfortable', occupancyPct: 40, weatherAdjustedPct: 40 },
  ],
  conflicts: [],
};

// ---------------------------------------------------------------------------
// Mock @google/genai
// ---------------------------------------------------------------------------
const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
  Type: {
    OBJECT: 'object',
    STRING: 'string',
    NUMBER: 'number',
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('processWithGemini — offline fallback (no API key)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env['GEMINI_API_KEY'];
    mockGenerateContent.mockReset();
  });

  it('returns offline response when GEMINI_API_KEY is not set', async () => {
    const { processWithGemini } = await import('../../src/agent/gemini.js');
    const result = await processWithGemini('Which zones are busy?', EMPTY_OUTPUT);
    expect(result.usedOffline).toBe(true);
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('offline response contains zone summary', async () => {
    const { processWithGemini } = await import('../../src/agent/gemini.js');
    const outputWithCritical: RulesEngineOutput = {
      ...EMPTY_OUTPUT,
      zoneStatuses: [
        { zoneId: 'concourse-north', status: 'critical', occupancyPct: 92, weatherAdjustedPct: 92 },
      ],
    };
    const result = await processWithGemini('Which zones are busy?', outputWithCritical);
    expect(result.usedOffline).toBe(true);
    expect(result.response).toMatch(/critical/i);
  });
});

describe('processWithGemini — Gemini API available', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GEMINI_API_KEY'] = 'test-api-key-12345';
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    delete process.env['GEMINI_API_KEY'];
  });

  it('returns Gemini text response (no function calls)', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{ text: 'Gate A is comfortable at 40% capacity.' }],
        },
      }],
    });

    const { processWithGemini } = await import('../../src/agent/gemini.js');
    const result = await processWithGemini('What is the status of gate-a?', EMPTY_OUTPUT);
    expect(result.usedOffline).toBe(false);
    expect(result.response).toBe('Gate A is comfortable at 40% capacity.');
  });

  it('falls back to offline when Gemini throws', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Network error'));

    const { processWithGemini } = await import('../../src/agent/gemini.js');
    const result = await processWithGemini('What is the status of gate-a?', EMPTY_OUTPUT);
    expect(result.usedOffline).toBe(true);
    expect(typeof result.response).toBe('string');
  });

  it('returns empty-response error and falls back to offline', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ content: { parts: [] } }],
    });

    const { processWithGemini } = await import('../../src/agent/gemini.js');
    const result = await processWithGemini('What are the top tasks?', EMPTY_OUTPUT);
    // Empty Gemini response throws → falls back to offline
    expect(result.usedOffline).toBe(true);
  });

  it('executes get_zone_status function call and returns response', async () => {
    // First call: Gemini requests a function call
    mockGenerateContent
      .mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{
              functionCall: {
                name: 'get_zone_status',
                args: {},
              },
            }],
          },
        }],
      })
      // Second call: Gemini generates text from function result
      .mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{ text: 'All zones are comfortable right now.' }],
          },
        }],
      });

    const { processWithGemini } = await import('../../src/agent/gemini.js');
    const result = await processWithGemini('How are the zones?', EMPTY_OUTPUT);
    expect(result.usedOffline).toBe(false);
    expect(result.response).toBe('All zones are comfortable right now.');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('caches response and returns it on second call without new API hit', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{ text: 'All zones are comfortable.' }],
        },
      }],
    });

    const { processWithGemini } = await import('../../src/agent/gemini.js');
    const query = 'Status check cache test ' + Date.now(); // unique key
    await processWithGemini(query, EMPTY_OUTPUT);
    await processWithGemini(query, EMPTY_OUTPUT); // same query + same task count → cache hit
    // generateContent should only have been called once (second is from cache)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// executeTool internal logic (tested indirectly via function calls)
// ---------------------------------------------------------------------------
describe('processWithGemini — executeTool via function calling', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GEMINI_API_KEY'] = 'test-key';
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    delete process.env['GEMINI_API_KEY'];
  });

  it('get_task_queue tool returns filtered tasks', async () => {
    const outputWithTasks: RulesEngineOutput = {
      ...EMPTY_OUTPUT,
      tasks: [
        {
          taskId: 't1', priority: 5, type: 'medical-response', zoneId: 'gate-a',
          location: 'Gate A', reasoning: 'High severity', status: 'open',
          conflicts: [], createdAt: new Date().toISOString(),
        },
      ],
    };

    // Gemini requests get_task_queue, then returns text
    mockGenerateContent
      .mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{ functionCall: { name: 'get_task_queue', args: { limit: 5 } } }],
          },
        }],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: 'Top task: medical response at Gate A.' }] } }],
      });

    const { processWithGemini } = await import('../../src/agent/gemini.js');
    const result = await processWithGemini('Top tasks?', outputWithTasks);
    expect(result.usedOffline).toBe(false);
    expect(result.response).toContain('medical response');
  });
});
