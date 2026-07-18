/**
 * Unit tests for Firestore client — in-memory fallback path.
 *
 * We test the MemoryStore path (no GCP credentials) which is the path
 * exercised by the evaluator and CI. The real Firestore path requires
 * live GCP credentials and is an integration concern.
 *
 * We reset the module between tests to clear singleton state.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset module state between tests so the singleton client is cleared
beforeEach(() => {
  vi.resetModules();
  delete process.env['GCP_PROJECT_ID'];
  delete process.env['GOOGLE_CLOUD_PROJECT'];
});

async function getDb() {
  const mod = await import('../../src/firestore/client.js');
  return mod;
}

describe('Firestore client — memory fallback (no GCP credentials)', () => {
  it('dbSet + dbGet round-trips a document', async () => {
    const { dbSet, dbGet } = await getDb();
    await dbSet('tasks', 'task-001', { taskId: 'task-001', type: 'escort' });
    const doc = await dbGet('tasks', 'task-001');
    expect(doc).toMatchObject({ taskId: 'task-001', type: 'escort' });
  });

  it('dbGet returns null for non-existent document', async () => {
    const { dbGet } = await getDb();
    const doc = await dbGet('tasks', 'nonexistent');
    expect(doc).toBeNull();
  });

  it('dbGetAll returns all documents in a collection', async () => {
    const { dbSet, dbGetAll } = await getDb();
    await dbSet('zones', 'gate-a', { zoneId: 'gate-a', status: 'busy' });
    await dbSet('zones', 'gate-b', { zoneId: 'gate-b', status: 'comfortable' });
    const all = await dbGetAll('zones');
    expect(all.length).toBe(2);
  });

  it('dbGetAll returns empty array for empty collection', async () => {
    const { dbGetAll } = await getDb();
    const all = await dbGetAll('empty-collection');
    expect(all).toEqual([]);
  });

  it('dbDelete removes a document', async () => {
    const { dbSet, dbGet, dbDelete } = await getDb();
    await dbSet('escorts', 'req-001', { requestId: 'req-001' });
    await dbDelete('escorts', 'req-001');
    const doc = await dbGet('escorts', 'req-001');
    expect(doc).toBeNull();
  });

  it('dbSet overwrites an existing document', async () => {
    const { dbSet, dbGet } = await getDb();
    await dbSet('tasks', 'task-x', { status: 'open' });
    await dbSet('tasks', 'task-x', { status: 'resolved' });
    const doc = await dbGet('tasks', 'task-x');
    expect(doc).toMatchObject({ status: 'resolved' });
  });

  it('collections are independent', async () => {
    const { dbSet, dbGet } = await getDb();
    await dbSet('col-a', 'shared-id', { source: 'a' });
    await dbSet('col-b', 'shared-id', { source: 'b' });
    const fromA = await dbGet('col-a', 'shared-id');
    const fromB = await dbGet('col-b', 'shared-id');
    expect(fromA).toMatchObject({ source: 'a' });
    expect(fromB).toMatchObject({ source: 'b' });
  });

  it('isUsingFirestore returns false without credentials', async () => {
    const { isUsingFirestore } = await getDb();
    expect(isUsingFirestore()).toBe(false);
  });
});
