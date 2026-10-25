import { lookup } from "node:dns/promises";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";

const MAX_BYTES = 2 * 1024 * 1024;
export function publicAddress(address: string) {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}
export function publicUrl(input: string) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80'))) throw new Error("公開された http / https の求人URLを指定してください。");
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || (isIP(host) && !publicAddress(host))) throw new Error("このURLにはアクセスできません。");
  url.hash = '';
  return url;
}
export function decodeHtml(bytes: Buffer, contentType: string) {
  const charset = contentType.match(/charset\s*=\s*[\"']?([^;\s\"']+)/i)?.[1] ?? bytes.subarray(0,4096).toString('latin1').match(/<meta[^>]+charset\s*=\s*[\"']?([^;\s\"'/>]+)/i)?.[1] ?? 'utf-8';
  try { return new TextDecoder(charset, {fatal:true}).decode(bytes); } catch { throw new Error('ページの文字コードに対応していません。手入力してください。'); }
}
export async function fetchJobHtml(input: string): Promise<{ html: string; url: string }> {
  const signal = AbortSignal.timeout(12_000);
  let url = publicUrl(input);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { if (signal.aborted) reject(new Error('取得がタイムアウトしました。')); else signal.addEventListener('abort', () => reject(new Error('取得がタイムアウトしました。')), { once: true }); }),
    ]);
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('このURLにはアクセスできません。');
    const ip = addresses[0];
    const result = await new Promise<{ html?: string; redirect?: string }>((resolve, reject) => {
      const req = (url.protocol === 'https:' ? httpsGet : httpGet)(url, {
        signal,
        lookup: (_host, options, callback) => options.all ? callback(null, [ip]) : callback(null, ip.address, ip.family),
        headers: { 'User-Agent': 'TsugidokoBot/1.0', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
      }, res => {
        if ([301,302,303,307,308].includes(res.statusCode ?? 0) && res.headers.location) { res.destroy(); resolve({ redirect: res.headers.location }); return; }
        if (res.statusCode !== 200 || !/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(res.headers['content-type'] ?? '') || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) { res.destroy(); reject(new Error('このページから取得できません。会社名などを手入力してください。')); return; }
        let size = 0; const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > MAX_BYTES) { res.destroy(); reject(new Error('ページが大きすぎるため取得できません。')); } else chunks.push(chunk); });
        res.on('end', () => { try { resolve({html:decodeHtml(Buffer.concat(chunks), res.headers['content-type'] ?? '')}); } catch(error) {reject(error);} });
        res.on('error', reject);
      });
      req.on('error', reject);
    });
    if (result.redirect) { url = publicUrl(new URL(result.redirect, url).href); continue; }
    return { html: result.html ?? '', url: url.href };
  }
  throw new Error('転送が多すぎるため取得できません。');
}
export type JobCandidate = { company: string; role: string; location: string; salary: string; workStyle: string; url: string };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
function clean(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? load(String(value)).text().replace(/\s+/g, ' ').trim().slice(0,120) : ''; }
export function extractJobs(html: string, url: string): JobCandidate[] {
  const $ = load(html); const jobs: JobCandidate[] = [];
  function visit(value: unknown, depth = 0) {
    if (depth > 8 || jobs.length >= 8) return;
    if (Array.isArray(value)) { value.slice(0,100).forEach(item => visit(item,depth+1)); return; }
    const obj = record(value); const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
    if (types.some(type => typeof type === 'string' && /^(?:https?:\/\/schema\.org\/)?JobPosting$/.test(type))) {
      const org = record(obj.hiringOrganization);
      const locations = (Array.isArray(obj.jobLocation) ? obj.jobLocation : [obj.jobLocation]).map(item => {
        const address = record(record(item).address);
        return [address.addressRegion,address.addressLocality,address.streetAddress].map(clean).filter(Boolean).join(' ');
      }).filter(Boolean).join(' / ');
      const salary = record(obj.baseSalary); const amount = record(salary.value);
      const amountText = amount.value ?? (amount.minValue != null || amount.maxValue != null ? `${amount.minValue ?? ''}〜${amount.maxValue ?? ''}` : salary.value);
      jobs.push({company:clean(org.name ?? obj.hiringOrganization),role:clean(obj.title),location:clean(locations),salary:clean([clean(amountText),clean(salary.currency),clean(amount.unitText)].filter(Boolean).join(' ')),workStyle:obj.jobLocationType === 'TELECOMMUTE' ? 'リモート勤務' : clean(Array.isArray(obj.employmentType) ? obj.employmentType.join(' / ') : obj.employmentType),url});
    }
    if (obj['@graph']) visit(obj['@graph'],depth+1);
  }
  $('script[type="application/ld+json"]').slice(0,60).each((_index,node) => { try { visit(JSON.parse($(node).text())); } catch { /* Malformed blocks are ignored; manual input remains available. */ } });
  return jobs;
}
