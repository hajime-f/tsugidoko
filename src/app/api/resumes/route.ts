import { assertAccountActive } from "@/lib/server/account-lifecycle";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { resumeSchema } from "@/lib/resumes";
import { authenticated, adminServices, failure, HttpError, smallJson } from "@/lib/server/firebase";

export const runtime = "nodejs";
const requestSchema = z.object({
  value: resumeSchema,
  id: z.string().min(1).max(128).regex(/^[^/]+$/).optional(),
  revision: z.number().int().positive().optional(),
  submitted: z.boolean(),
}).strict().refine(value => !!value.id === (value.revision !== undefined));

export async function POST(request: Request) {
  try {
    const user = await authenticated(request);
    // Ten careers and the summary fields remain well below Firestore's 1 MiB limit.
    const parsed = requestSchema.safeParse(await smallJson(request, 768 * 1024));
    if (!parsed.success) throw new HttpError(400, "入力内容と文字数、在籍期間を確認してください。");
    const { value, id, revision, submitted } = parsed.data;
    if (submitted && !value.applicationId) throw new HttpError(400, "提出先の応募先を選んでください。");
    const db = adminServices().db;
    // Ownership comes only from the verified token, never from the request body.
    const parent = db.collection("users").doc(user.uid);
    const ref = id ? parent.collection("resumes").doc(id) : parent.collection("resumes").doc();
    await db.runTransaction(async transaction => {
      await assertAccountActive(transaction, user.uid, user.auth_time);
      const current = id ? await transaction.get(ref) : null;
      if (id && (!current?.exists || current.get("submitted") || current.get("revision") !== revision || submitted)) {
        throw new HttpError(409, "別の画面で更新されているか、編集できない書類です。入力内容を残す場合は「複製して保存」を選んでください。");
      }
      if (value.applicationId && !(await transaction.get(parent.collection("applications").doc(value.applicationId))).exists) {
        throw new HttpError(400, "応募先を選び直してください。");
      }
      if (id) transaction.update(ref, { ...value, revision: revision! + 1, updatedAt: FieldValue.serverTimestamp() });
      else transaction.create(ref, { ...value, submitted, revision: 1, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ id: ref.id });
  } catch (error) { return failure(error); }
}
