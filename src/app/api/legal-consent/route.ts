import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { LEGAL_VERSION } from "@/lib/legal";
import { adminServices, authenticated, failure, HttpError, smallJson } from "@/lib/server/firebase";
import { assertAccountActive } from "@/lib/server/account-lifecycle";
const schema = z.object({ version: z.literal(LEGAL_VERSION), accepted: z.literal(true) }).strict();
export async function POST(request: Request) {
  try {
    const user = await authenticated(request);
    if (!schema.safeParse(await smallJson(request)).success) throw new HttpError(400, "利用規約とプライバシーポリシーをご確認ください。");
    const db = adminServices().db;
    await db.runTransaction(async transaction => {
      await assertAccountActive(transaction, user.uid, user.auth_time);
      transaction.set(db.doc(`users/${user.uid}/legal/consent`), { version: LEGAL_VERSION, acceptedAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
