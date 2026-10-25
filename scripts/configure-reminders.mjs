// Run after deploying the reviewed API and SMTP secrets, never during a build.
import { spawnSync } from 'node:child_process';
const project = 'tsugidoko-prod-hajime-f';
const base = process.argv[2];
if (!base || new URL(base).protocol !== 'https:') throw new Error('Usage: node scripts/configure-reminders.mjs https://DEPLOYED_HOST');
const audience = new URL('/api/internal/reminders', base).href;
const account = `tsugidoko-reminders@${project}.iam.gserviceaccount.com`;
const binary = process.env.GCLOUD_BIN || 'gcloud';
function run(args, probe = false) {
  const result = spawnSync(binary, [...args, '--project',project], {stdio:probe ? 'pipe' : 'inherit'});
  if(result.error) throw result.error;
  if(!probe && result.status !== 0) throw new Error('gcloud command failed');
  return result.status === 0;
}
run(['services','enable','cloudscheduler.googleapis.com']);
if(!run(['iam','service-accounts','describe',account],true)) run(['iam','service-accounts','create','tsugidoko-reminders','--display-name=Tsugidoko reminder scheduler']);
const exists = run(['scheduler','jobs','describe','daily-reminders','--location=asia-east1'],true);
run(['scheduler','jobs',exists ? 'update' : 'create','http','daily-reminders','--location=asia-east1','--schedule=0 9 * * *','--time-zone=Asia/Tokyo',`--uri=${audience}`,'--http-method=POST',`--oidc-service-account-email=${account}`,`--oidc-token-audience=${audience}`,'--attempt-deadline=300s','--max-retry-attempts=3','--min-backoff=60s','--max-backoff=900s']);
console.log(`REMINDER_AUDIENCE=${audience}\nREMINDER_SERVICE_ACCOUNT=${account}`);
