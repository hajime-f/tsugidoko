import { z } from "zod";
import { deleteAccountStep, deletionStatus } from "@/lib/server/account-deletion";
import { failure, HttpError, smallJson } from "@/lib/server/firebase";
export const runtime = "nodejs";
const schema = z.object({ mode: z.enum(["data", "account"]), confirmation: z.literal("削除") }).strict();
export async function GET(request: Request) {
  try { return Response.json(await deletionStatus(request), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const value = schema.safeParse(await smallJson(request));
    if (!value.success) throw new HttpError(400, "削除方法と確認文字を確認してください。");
    return Response.json(await deleteAccountStep(request, value.data.mode), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
