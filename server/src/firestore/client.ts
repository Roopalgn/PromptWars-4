/**
 * Firestore client stub.
 * In production: uses real @google-cloud/firestore.
 * In dev/test (no GCP credentials): falls back to an in-memory Map store.
 *
 * Collections:
 *   tasks          — RulesEngineOutput.tasks (latest tick)
 *   zone-statuses  — RulesEngineOutput.zoneStatuses (latest tick)
 *   escort-requests — EscortRequest documents
 *   incidents      — IncidentReport documents
 */
import type { Task, ZoneStatus, EscortRequest, IncidentReport } from '../types/index.js';

type FirestoreDoc = Task | ZoneStatus | EscortRequest | IncidentReport | Record<string, unknown>;

// ---------------------------------------------------------------------------
// In-memory fallback (used when GCP credentials are not available)
// ---------------------------------------------------------------------------
class MemoryStore {
  private collections = new Map<string, Map<string, FirestoreDoc>>();

  private col(name: string): Map<string, FirestoreDoc> {
    let collection = this.collections.get(name);
    if (!collection) {
      collection = new Map<string, FirestoreDoc>();
      this.collections.set(name, collection);
    }
    return collection;
  }

  async get(collection: string, docId: string): Promise<FirestoreDoc | null> {
    return this.col(collection).get(docId) ?? null;
  }

  async set(collection: string, docId: string, data: FirestoreDoc): Promise<void> {
    this.col(collection).set(docId, data);
  }

  async getAll(collection: string): Promise<FirestoreDoc[]> {
    return Array.from(this.col(collection).values());
  }

  async delete(collection: string, docId: string): Promise<void> {
    this.col(collection).delete(docId);
  }
}

// ---------------------------------------------------------------------------
// Firestore wrapper with graceful fallback
// ---------------------------------------------------------------------------
let firestoreClient: import('@google-cloud/firestore').Firestore | null = null;
const memoryFallback = new MemoryStore();
let usingFirestore = false;

async function getFirestoreClient(): Promise<import('@google-cloud/firestore').Firestore | null> {
  if (firestoreClient) return firestoreClient;
  const projectId = process.env['GCP_PROJECT_ID'] ?? process.env['GOOGLE_CLOUD_PROJECT'];
  if (!projectId) return null;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    firestoreClient = new Firestore({ projectId });
    usingFirestore = true;
    console.info('[firestore] Connected to Firestore project:', projectId);
    return firestoreClient;
  } catch {
    console.warn('[firestore] Could not connect — using in-memory fallback');
    return null;
  }
}

export async function dbGet(collection: string, docId: string): Promise<FirestoreDoc | null> {
  const fs = await getFirestoreClient();
  if (fs) {
    const snap = await fs.collection(collection).doc(docId).get();
    return snap.exists ? (snap.data() as FirestoreDoc) : null;
  }
  return memoryFallback.get(collection, docId);
}

export async function dbSet(collection: string, docId: string, data: FirestoreDoc): Promise<void> {
  const fs = await getFirestoreClient();
  if (fs) {
    await fs.collection(collection).doc(docId).set(data as Record<string, unknown>);
    return;
  }
  return memoryFallback.set(collection, docId, data);
}

export async function dbGetAll(collection: string): Promise<FirestoreDoc[]> {
  const fs = await getFirestoreClient();
  if (fs) {
    const snap = await fs.collection(collection).get();
    return snap.docs.map(d => d.data() as FirestoreDoc);
  }
  return memoryFallback.getAll(collection);
}

export async function dbDelete(collection: string, docId: string): Promise<void> {
  const fs = await getFirestoreClient();
  if (fs) {
    await fs.collection(collection).doc(docId).delete();
    return;
  }
  return memoryFallback.delete(collection, docId);
}

export function isUsingFirestore(): boolean {
  return usingFirestore;
}
