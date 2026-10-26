import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminServices, failure, HttpError, smallJson } from "@/lib/server/firebase";
export const runtime = "nodejs";
const schema = z.object({
  email: z.string().trim().email().max(254),
  topic: z.enum(["general", "privacy", "deletion"]),
  message: z.string().trim().min(10).max(3000),
  website: z.literal(""),
}).strict();
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await smallJson(request, 16 * 1024));
    if (!parsed.success) throw new HttpError(400, "メールアドレスとお問い合わせ内容（10〜3,000文字）を確認してください。");
    const { email, topic, message } = parsed.data;
    const db = adminServices().db, now = Date.now();
    const emailRef = db.doc(`contactLimits/email-${createHash("sha256").update(email.toLowerCase()).digest("hex")}`);
    const globalRef = db.doc("contactLimits/global");
    const item = db.collection("supportRequests").doc();
    await db.runTransaction(async transaction => {
      const [perEmail, global] = await Promise.all([transaction.get(emailRef), transaction.get(globalRef)]);
      const day = Math.floor(now / 86400_000), minute = Math.floor(now / 60_000);
      const emailCount = perEmail.get("day") === day ? Number(perEmail.get("count") || 0) : 0;
      const dailyCount = global.get("day") === day ? Number(global.get("dailyCount") || 0) : 0;
      const minuteCount = global.get("minute") === minute ? Number(global.get("minuteCount") || 0) : 0;
      // A global cap remains effective even if a client rotates email addresses or IP headers.
      if (emailCount >= 3 || dailyCount >= 500 || minuteCount >= 30) throw new HttpError(429, "受付回数の上限に達しました。時間をおいてお試しください。");
      const expiresAt = Timestamp.fromMillis(now + 2 * 86400_000);
      transaction.set(emailRef, { day, count: emailCount + 1, expiresAt });
      transaction.set(globalRef, { day, dailyCount: dailyCount + 1, minute, minuteCount: minuteCount + 1, expiresAt });
      transaction.create(item, { email, topic, message, status: "new", createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(now + 90 * 86400_000) });
    });
    return Response.json({ id: item.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
