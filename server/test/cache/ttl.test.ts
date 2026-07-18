/**
 * Unit tests for TtlCache — in-memory TTL cache with auto-eviction.
 * No mocking required — tests use real timers and vi.useFakeTimers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TtlCache } from '../../src/cache/ttl.js';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves a value', () => {
    const cache = new TtlCache<string>(60);
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('returns undefined for unknown key', () => {
    const cache = new TtlCache<string>(60);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns undefined after TTL expires', () => {
    const cache = new TtlCache<string>(10); // 10 second TTL
    cache.set('key', 'value');
    // Advance time past TTL
    vi.advanceTimersByTime(11_000);
    expect(cache.get('key')).toBeUndefined();
  });

  it('still returns value before TTL expires', () => {
    const cache = new TtlCache<string>(10);
    cache.set('key', 'value');
    vi.advanceTimersByTime(9_000);
    expect(cache.get('key')).toBe('value');
  });

  it('delete removes a key', () => {
    const cache = new TtlCache<string>(60);
    cache.set('key', 'value');
    cache.delete('key');
    expect(cache.get('key')).toBeUndefined();
  });

  it('clear removes all entries', () => {
    const cache = new TtlCache<string>(60);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('size counts only non-expired entries', () => {
    const cache = new TtlCache<string>(10);
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.size()).toBe(2);
    vi.advanceTimersByTime(11_000);
    expect(cache.size()).toBe(0);
  });

  it('size is accurate after partial expiry', () => {
    const cache = new TtlCache<number>(30);
    cache.set('short', 1);
    // Advance 15s, then add a longer-lived entry
    vi.advanceTimersByTime(15_000);
    cache.set('long', 2);
    // Advance another 16s — 'short' total 31s (expired), 'long' only 16s (alive)
    vi.advanceTimersByTime(16_000);
    expect(cache.size()).toBe(1);
  });

  it('overwriting a key resets the TTL', () => {
    const cache = new TtlCache<string>(10);
    cache.set('key', 'v1');
    vi.advanceTimersByTime(8_000);
    cache.set('key', 'v2'); // reset TTL
    vi.advanceTimersByTime(8_000); // 16s total — original would have expired
    expect(cache.get('key')).toBe('v2');
  });

  it('handles number values', () => {
    const cache = new TtlCache<number>(60);
    cache.set('count', 42);
    expect(cache.get('count')).toBe(42);
  });

  it('handles object values', () => {
    const cache = new TtlCache<{ x: number }>(60);
    cache.set('obj', { x: 1 });
    expect(cache.get('obj')).toEqual({ x: 1 });
  });
});
