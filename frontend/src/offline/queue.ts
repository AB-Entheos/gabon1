import { openDB, type IDBPDatabase } from "idb";

interface QueuedUpload {
  id: number;
  caseUid: string;
  caseUidForSynthetic?: string;
  submissionId?: number;
  filename: string;
  mime: string;
  size: number;
  data: ArrayBuffer;
  fileType?: string;
  description?: string;
  uploadedByName?: string;
  enqueuedAt: number;
}

interface QueuedSubmission {
  id: number;
  slug: string;
  version: number;
  caseUid: string;
  payload: Record<string, unknown>;
  enqueuedAt: number;
}

const DB_NAME = "hec-offline";
const DB_VERSION = 1;
const STORE_UPLOADS = "uploads";
const STORE_SUBMISSIONS = "submissions";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_UPLOADS)) {
          db.createObjectStore(STORE_UPLOADS, { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORE_SUBMISSIONS)) {
          db.createObjectStore(STORE_SUBMISSIONS, { keyPath: "id", autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export async function enqueueUpload(item: Omit<QueuedUpload, "id" | "enqueuedAt">): Promise<number> {
  const db = await getDb();
  return (await db.add(STORE_UPLOADS, { ...item, enqueuedAt: Date.now() })) as number;
}

export async function enqueueSubmission(item: Omit<QueuedSubmission, "id" | "enqueuedAt">): Promise<number> {
  const db = await getDb();
  return (await db.add(STORE_SUBMISSIONS, { ...item, enqueuedAt: Date.now() })) as number;
}

export async function listQueued(): Promise<{ uploads: QueuedUpload[]; submissions: QueuedSubmission[] }> {
  const db = await getDb();
  const uploads = (await db.getAll(STORE_UPLOADS)) as QueuedUpload[];
  const submissions = (await db.getAll(STORE_SUBMISSIONS)) as QueuedSubmission[];
  return { uploads, submissions };
}

export async function deleteQueuedUpload(id: number) {
  const db = await getDb();
  await db.delete(STORE_UPLOADS, id);
}

export async function deleteQueuedSubmission(id: number) {
  const db = await getDb();
  await db.delete(STORE_SUBMISSIONS, id);
}

export async function countQueued(): Promise<number> {
  const db = await getDb();
  return (await db.count(STORE_UPLOADS)) + (await db.count(STORE_SUBMISSIONS));
}

/**
 * Drain the queue when we come back online. Each upload needs a fresh
 * presign + PUT + finish; each submission is just a POST.
 */
export async function drainQueue(): Promise<{ uploaded: number; submitted: number; failed: number }> {
  if (!isOnline()) return { uploaded: 0, submitted: 0, failed: 0 };
  const { uploads, submissions } = await listQueued();
  let uploaded = 0, submitted = 0, failed = 0;

  // Drain from the main thread on the `online` event. We use raw fetch()
  // to avoid re-running the RTK Query cache invalidation here; the call
  // site (a route mount or the offline indicator) re-fetches anyway.

  for (const u of uploads) {
    try {
      const presigned = await fetch("/api/v1/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: u.filename,
          mime: u.mime,
          size: u.size,
          case_uid: u.caseUidForSynthetic ?? u.caseUid,
          submission_id: u.caseUidForSynthetic ? undefined : u.submissionId,
          file_type: u.fileType,
          description: u.description,
          uploaded_by_name: u.uploadedByName,
        }),
      }).then((r) => r.json());

      const put = await fetch(presigned.url, {
        method: "PUT",
        body: u.data,
        headers: { "Content-Type": u.mime },
      });
      if (!put.ok) throw new Error(`PUT ${put.status}`);

      const hash = await crypto.subtle.digest("SHA-256", u.data);
      const sha = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      await fetch("/api/v1/uploads/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: presigned.key,
          filename: u.filename,
          mime: u.mime,
          size: u.size,
          sha256: sha,
          submission_id: u.caseUidForSynthetic ? undefined : (u.submissionId ?? 0),
          case_uid: u.caseUidForSynthetic ?? undefined,
          file_type: u.fileType,
          description: u.description,
          uploaded_by_name: u.uploadedByName,
        }),
      });
      await deleteQueuedUpload(u.id);
      uploaded += 1;
    } catch {
      failed += 1;
    }
  }

  for (const s of submissions) {
    try {
      const r = await fetch(`/api/v1/forms/${s.slug}/v${s.version}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_uid: s.caseUid, payload: s.payload }),
      });
      if (!r.ok) throw new Error(`POST ${r.status}`);
      await deleteQueuedSubmission(s.id);
      submitted += 1;
    } catch {
      failed += 1;
    }
  }

  return { uploaded, submitted, failed };
}
