import type { Transaction } from "firebase-admin/firestore";
import { adminServices, HttpError } from "./firebase";

export async function assertAccountActive(transaction: Transaction, uid: string, authTime: number) {
  const snapshot = await transaction.get(adminServices().db.doc(`accountLifecycle/${uid}`));
  if (snapshot.exists && (snapshot.get("state") !== "complete" || snapshot.get("mode") === "account" || authTime <= snapshot.get("cutoff"))) {
    throw new HttpError(409, "データ削除中、またはログインの更新が必要です。データ削除ページを確認して、ログインし直してください。");
  }
}
