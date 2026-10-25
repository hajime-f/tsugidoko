import { OAuth2Client } from 'google-auth-library';
import { adminServices } from '@/lib/server/firebase';
import { deliverReminders, mailConfigured, smtpSend } from '@/lib/server/reminders';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  const audience = process.env.REMINDER_AUDIENCE; const email = process.env.REMINDER_SERVICE_ACCOUNT;
  if (!audience || !email || !mailConfigured()) return Response.json({error:'Not configured'},{status:503});
  try {
    const idToken = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if(!idToken) throw new Error('Missing token');
    const ticket = await new OAuth2Client().verifyIdToken({idToken,audience});const payload = ticket.getPayload();
    if (!payload?.email_verified || payload.email !== email) throw new Error('Wrong identity');
  } catch {return Response.json({error:'Unauthorized'},{status:401});}
  try {
    const {db,auth} = adminServices(); const result = await deliverReminders(db,auth,smtpSend);
    return Response.json(result,{status:result.failed ? 503 : 200});
  } catch {return Response.json({error:'Delivery incomplete'},{status:503});}
}
