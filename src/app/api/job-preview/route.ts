import { assertAccountActive } from "@/lib/server/account-lifecycle";
import { FieldValue } from "firebase-admin/firestore";
import { authenticated, adminServices, failure, HttpError, smallJson } from "@/lib/server/firebase";
import { extractJobs, fetchJobHtml, publicUrl } from "@/lib/server/job-preview";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await authenticated(request);
    const body = await smallJson(request) as { url?: unknown };
    if (typeof body?.url !== 'string' || body.url.length > 2000) throw new HttpError(400, '求人URLを入力してください。');
    try { publicUrl(body.url); } catch { throw new HttpError(400, '公開された http / https の求人URLを指定してください。'); }
    const db = adminServices().db;
    await db.runTransaction(async tx => {
      await assertAccountActive(tx, user.uid, user.auth_time);
      const ref = db.doc(`users/${user.uid}/serverLimits/jobPreview`); const snap = await tx.get(ref);
      const bucket = Math.floor(Date.now()/60_000); const used = snap.get('bucket') === bucket ? Number(snap.get('count') ?? 0) : 0;
      if (used >= 5) throw new HttpError(429, '取得は1分間に5回までです。少し待ってください。');
      tx.set(ref, { bucket, count: used+1, updatedAt: FieldValue.serverTimestamp() });
    });
    try {
      const page = await fetchJobHtml(body.url); const candidates = extractJobs(page.html, body.url);
      return Response.json({ candidates, message: candidates.length ? '取得内容を確認し、必要なら修正してください。' : '求人情報を取得できませんでした。会社名などを手入力してください。' });
    } catch { throw new HttpError(422, '取得できませんでした。公開された求人ページか確認し、取得できない項目は手入力してください。'); }
  } catch (error) { return failure(error); }
}
