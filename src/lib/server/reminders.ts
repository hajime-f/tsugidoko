import { isEnded, getApplicationStatus } from "../applications";
import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import nodemailer from "nodemailer";

export function mailConfigured() { return !!(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.APP_BASE_URL && process.env.REMINDER_AUDIENCE && process.env.REMINDER_SERVICE_ACCOUNT); }
export function reminderDates(now = new Date()) {
  const date = (value: Date) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
  return {today:date(now),tomorrow:date(new Date(now.getTime()+86_400_000))};
}
export function reminderMessage(count: number, baseUrl: string) {
  const url = new URL('/home#notification-settings',baseUrl).href;
  return { subject:'ツギドコからのお知らせ', text:`今日・明日が期限の未完了の予定が${count}件あります。\n\n内容はログインして確認してください。\n${new URL('/home',baseUrl).href}\n\nこのメールには会社名や予定の内容を記載していません。\n通知を停止するには、ホームの「メール通知」をオフにしてください。\n${url}\n` };
}
export async function smtpSend(to: string, message: { subject:string; text:string }, deliveryId: string) {
  if (!mailConfigured()) throw new Error('Mail is not configured');
  const testing = process.env.NODE_ENV !== 'production' && process.env.E2E_AUTH_EMULATOR === '1';
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:!testing && port!==465,
    auth:process.env.SMTP_USER ? {user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD} : undefined,
    connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:20_000,disableFileAccess:true,disableUrlAccess:true});
  try {
    const result = await transport.sendMail({from:process.env.SMTP_FROM,to:{name:'',address:to},...message,list:{unsubscribe:{url:new URL('/home#notification-settings',process.env.APP_BASE_URL!).href}},messageId:`<${deliveryId}@tsugidoko.invalid>`});
    if (!result.accepted.length) throw Object.assign(new Error('Recipient rejected'),{responseCode:550});
  } finally { transport.close(); }
}
export type Sender = typeof smtpSend;
// SMTP cannot provide an atomic commit with Firestore. Ambiguous deliveries are held,
// not automatically resent, to prevent duplicate reminders after a process failure.
export async function deliverReminders(db: Firestore, auth: Pick<Auth,'getUser'>, send: Sender, now = new Date()) {
  const {today,tomorrow} = reminderDates(now); const stats = {sent:0,skipped:0,failed:0,uncertain:0};
  let after: string | undefined;
  const started = Date.now();
  while (true) {
    let query = db.collectionGroup('settings').where('enabled','==',true).orderBy(FieldPath.documentId()).limit(100);
    if (after) query = query.startAfter(db.doc(after));
    const page = await query.get();
    if (page.empty) break;
    for (const settings of page.docs) {
      if (Date.now()-started > 150_000) throw new Error('Run time exceeded; retry continues from delivery logs');
      after = settings.ref.path;
      const path = settings.ref.path.split('/');
      if (path.length !== 4 || path[0] !== 'users' || path[2] !== 'settings' || path[3] !== 'notifications') continue;
      const uid = path[1]; const log = db.doc(`users/${uid}/notificationLog/${today}`);
      const claim = await db.runTransaction(async tx => {
        const existing = await tx.get(log);
        if (existing.exists && existing.get('state') !== 'failed' && !(existing.get('state') === 'claimed' && Date.now() - (existing.get('attemptAt')?.toMillis() ?? Date.now()) > 15 * 60_000)) return false;
        tx.set(log,{state:'claimed',attemptAt:FieldValue.serverTimestamp()});return true;
      });
      if (!claim) {stats.skipped++;continue;}
      let sending = false;
      try {
        const user = await auth.getUser(uid);
        if (user.disabled || !user.emailVerified || !user.email) {await log.set({state:'skipped',reason:'account-unavailable'});stats.skipped++;continue;}
        // Re-read settings and records after the claim; completed tasks and ended applications are excluded.
        const [latest,tasks,apps] = await Promise.all([settings.ref.get(),db.collection(`users/${uid}/tasks`).where('dueDate','in',[today,tomorrow]).get(),db.collection(`users/${uid}/applications`).get()]);
        const available = new Set(apps.docs.filter(app => !isEnded(getApplicationStatus(app.get('stage'), app.get('endReason')))).map(app => app.id));
        const count = tasks.docs.filter(task => task.get('done') === false && available.has(task.get('applicationId'))).length;
        if (!latest.get('enabled') || count === 0) {await log.delete();stats.skipped++;continue;}
        await log.set({state:'sending',attemptAt:FieldValue.serverTimestamp(),count}); sending = true;
        await send(user.email,reminderMessage(count,process.env.APP_BASE_URL!),`${today}-${uid}`);
        await log.update({state:'sent',sentAt:FieldValue.serverTimestamp()});stats.sent++;
      } catch (error) {
        const responseCode = error && typeof error === 'object' && 'responseCode' in error ? Number(error.responseCode) : 0;
        const missing = error && typeof error === 'object' && 'code' in error && error.code === 'auth/user-not-found';
        const state = missing ? 'skipped' : !sending || responseCode >= 400 ? 'failed' : 'uncertain';
        await log.set({state,attemptAt:FieldValue.serverTimestamp()},{merge:true});
        stats[state === 'skipped' ? 'skipped' : state === 'failed' ? 'failed' : 'uncertain']++;
      }
    }
    if (page.size < 100) break;
  }
  return stats;
}
