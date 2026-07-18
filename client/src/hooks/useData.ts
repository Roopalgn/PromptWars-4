/**
 * Custom hooks for data fetching — polling with configurable interval.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api, type Task, type ZoneStatus } from '../api/client.js';

// ── Generic polling hook ─────────────────────────────────────────────────────
export function usePolling<T>(
  fetcher: () => Promise<T>,
  interval = 5000,
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    try {
      const result = await fetcher();
      if (mountedRef.current) { setData(result); setError(null); }
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    fetch();
    const id = setInterval(fetch, interval);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [fetch, interval]);

  return { data, loading, error, refetch: fetch };
}

// ── Zone statuses (5s) ───────────────────────────────────────────────────────
export function useZones() {
  return usePolling(() => api.zones(), 5000);
}

// ── Task queue (3s — faster for volunteer dashboard) ─────────────────────────
export function useTasks(filters?: { type?: string; status?: string }) {
  const fetcher = useCallback(
    () => api.tasks({ ...filters, limit: 30 }),
    [filters?.type, filters?.status],
  );
  return usePolling(fetcher, 3000);
}

// ── AI query (one-shot) ──────────────────────────────────────────────────────
export function useAsk() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (query: string): Promise<{ response: string; offline: boolean } | null> => {
    setLoading(true);
    setError(null);
    try {
      return await api.ask(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { ask, loading, error };
}

// ── Fan assist ───────────────────────────────────────────────────────────────
export function useFanAssist() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assist = useCallback(async (
    query: string,
    language = 'en',
    needType?: string,
  ): Promise<{ response: string; offline: boolean } | null> => {
    setLoading(true);
    setError(null);
    try {
      return await api.fanAssist(query, language, needType);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { assist, loading, error };
}

// ── TTS ──────────────────────────────────────────────────────────────────────
export function useTts() {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async (text: string, languageCode = 'en-US') => {
    // Stop any current audio
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(true);
    try {
      const result = await api.tts(text, languageCode);
      const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => setPlaying(false);
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(false);
  }, []);

  return { speak, stop, playing };
}
