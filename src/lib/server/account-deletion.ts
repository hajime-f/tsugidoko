import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { adminServices, HttpError } from "./firebase";

export type DeletionMode = "data" | "account";
const LEASE_MS = 90_000;
const MARKER_DAYS = 7;
const MAX_BATCH = 200;
const MAX_SCAN_MS = 20_000;
function isMissing(error: unknown) { return (error as {code?:string})?.code === "auth/user-not-found"; }

// A deleted user's still-unexpired signed token may only read its deletion result.
// It cannot authorize a new deletion, a data write, or another user's operation.
export async function deletionIdentity(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new HttpError(401, "ログインし直してください。");
  const { auth } = adminServices();
  try { return { token, identity: await auth.verifyIdToken(token) }; }
  catch { throw new HttpError(401, "ログインし直してください。"); }
}

async function accountMissing(uid: string) {
  try { await adminServices().auth.getUser(uid); return false; }
  catch (error) { if (isMissing(error)) return true; throw error; }
}

export async function deletionStatus(request: Request) {
  const { identity } = await deletionIdentity(request);
  const marker = await adminServices().db.doc(`accountLifecycle/${identity.uid}`).get();
  if (!marker.exists) return { state: "none" as const };
  const data = marker.data()!;
  const done = data.state === "complete" || (data.mode === "account" && data.phase === "auth-deleting" && await accountMissing(identity.uid));
  return { state: done ? "complete" as const : "deleting" as const, mode: data.mode as DeletionMode, sessionCompleted: done && identity.auth_time <= data.cutoff };
}

// listDocuments includes missing parent documents that still have subcollections.
// Parents enter the batch only after all their descendants, so a retry finds the rest.
async function deletionBatch(root: DocumentReference) {
  const refs: DocumentReference[] = [];
  const deadline = Date.now() + MAX_SCAN_MS;
  async function visit(ref: DocumentReference): Promise<boolean> {
    if (Date.now() > deadline) {
      if (refs.length) return false;
      throw new HttpError(503, "削除対象の確認に時間がかかっています。もう一度お試しください。");
    }
    for (const collection of await ref.listCollections()) {
      for (const child of await collection.listDocuments()) {
        if (!await visit(child)) return false;
      }
    }
    refs.push(ref);
    return refs.length < MAX_BATCH;
  }
  await visit(root);
  return { refs, complete: refs.some(ref => ref.path === root.path) };
}

export async function deleteAccountStep(request: Request, mode: DeletionMode) {
  const { identity, token } = await deletionIdentity(request);
  const { db, auth } = adminServices();
  const marker = db.doc(`accountLifecycle/${identity.uid}`);
  const existing = await marker.get();
  // Handle a lost final response, including Auth deletion or token revocation.
  if (existing.exists && existing.get("mode") === mode && identity.auth_time <= existing.get("cutoff")) {
    if (existing.get("state") === "complete") return { done: true, mode };
    if (mode === "account" && existing.get("phase") === "auth-deleting" && await accountMissing(identity.uid)) {
      await marker.update({ state: "complete", leaseUntil: Timestamp.fromMillis(0), updatedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + MARKER_DAYS * 86400_000) });
      return { done: true, mode };
    }
  }
  try { await auth.verifyIdToken(token, true); }
  catch { throw new HttpError(401, "ログインし直して削除を再開してください。"); }
  const leaseId = randomUUID();
  const acquired = await db.runTransaction(async transaction => {
    const snap = await transaction.get(marker);
    const active = snap.exists && snap.get("state") !== "complete";
    if (active && snap.get("mode") !== mode) throw new HttpError(409, "前回選んだ削除方法で処理を再開してください。");
    if (active && snap.get("leaseUntil")?.toMillis() > Date.now()) return null;
    if (!active && (identity.auth_time < Math.floor(Date.now() / 1000) - 300 || (snap.exists && identity.auth_time <= snap.get("cutoff")))) {
      throw new HttpError(401, "Googleで本人確認をやり直してください。");
    }
    const phase = active ? snap.get("phase") as string : "purging";
    transaction.set(marker, {
      state: "deleting", mode, phase, cutoff: active ? snap.get("cutoff") : Math.floor(Date.now() / 1000),
      requestedAt: active ? snap.get("requestedAt") : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(), leaseId, leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MS),
    });
    return phase;
  });
  if (!acquired) return { done: false, mode, busy: true };
  try {
    let finished = acquired === "auth-deleting";
    if (!finished) {
      const batch = await deletionBatch(db.doc(`users/${identity.uid}`));
      await db.runTransaction(async transaction => {
        const current = await transaction.get(marker);
        if (current.get("leaseId") !== leaseId || current.get("state") !== "deleting" || current.get("leaseUntil").toMillis() <= Date.now()) throw new HttpError(409, "削除処理が更新されました。再開してください。");
        for (const ref of batch.refs) transaction.delete(ref);
        transaction.update(marker, { phase: batch.complete ? "auth-deleting" : "purging", updatedAt: FieldValue.serverTimestamp() });
      });
      finished = batch.complete;
    }
    if (!finished) return { done: false, mode };
    // All Firestore data is gone before the Auth account is removed.
    if (mode === "account") { try { await auth.deleteUser(identity.uid); } catch (error) { if (!isMissing(error)) throw error; } }
    else await auth.revokeRefreshTokens(identity.uid);
    await db.runTransaction(async transaction => {
      const current = await transaction.get(marker);
      if (current.get("leaseId") !== leaseId) throw new HttpError(409, "削除結果を確認しています。もう一度お試しください。");
      transaction.update(marker, { state: "complete", updatedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + MARKER_DAYS * 86400_000) });
    });
    return { done: true, mode };
  } finally {
    await db.runTransaction(async transaction => {
      const current = await transaction.get(marker);
      if (current.get("leaseId") === leaseId) transaction.update(marker, { leaseUntil: Timestamp.fromMillis(0) });
    }).catch(() => { /* A lease expires if the cleanup itself cannot reach Firestore. */ });
  }
}
