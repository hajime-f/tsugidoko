import { FieldValue } from "firebase-admin/firestore";
import { adminServices, authenticated, failure, HttpError, smallJson } from "@/lib/server/firebase";
import { mailConfigured } from "@/lib/server/reminders";
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const token = await authenticated(request);const {db,auth} = adminServices();
    const [settings,user] = await Promise.all([db.doc(`users/${token.uid}/settings/notifications`).get(),auth.getUser(token.uid)]);
    return Response.json({enabled:settings.get('enabled')===true,ready:mailConfigured(),verified:user.emailVerified && !!user.email,email:user.email ?? ''});
  } catch(error) {return failure(error);}
}
export async function PUT(request: Request) {
  try {
    const token = await authenticated(request);const {db,auth} = adminServices();
    const body = await smallJson(request) as {enabled?:unknown};
    if (typeof body?.enabled !== 'boolean' || Object.keys(body).some(key => key !== 'enabled')) throw new HttpError(400,'通知設定を確認してください。');
    if(body.enabled) {
      if(!mailConfigured()) throw new HttpError(503,'メール配信の設定中です。まだ通知を有効にできません。');
      const user = await auth.getUser(token.uid);
      if(!user.emailVerified || !user.email || user.disabled) throw new HttpError(400,'確認済みのメールアドレスが必要です。');
    }
    await db.doc(`users/${token.uid}/settings/notifications`).set({enabled:body.enabled,updatedAt:FieldValue.serverTimestamp()});
    return Response.json({enabled:body.enabled});
  } catch(error) {return failure(error);}
}
