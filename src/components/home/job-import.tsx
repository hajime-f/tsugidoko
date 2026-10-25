"use client";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import type { ApplicationInput } from "@/lib/applications";

type Candidate = Pick<ApplicationInput, "company" | "role" | "location" | "salary" | "workStyle" | "url">;
export function JobImport({ apply, rememberUrl }: { apply: (value: Candidate) => void; rememberUrl: (url: string) => void }) {
  const auth = useAuth();
  const [url,setUrl] = useState(''); const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState(''); const [candidates,setCandidates] = useState<Candidate[]>([]);
  async function preview() {
    if (busy || !auth.user) return;
    setBusy(true); setMessage(''); setCandidates([]);
    const input = url.trim();
    try {
      let parsed: URL;
      try { parsed = new URL(input); } catch {throw new Error('http または https の求人URLを入力してください。');}
      if (!['https:','http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('http または https の求人URLを入力してください。');
      rememberUrl(input);
      const response = await fetch('/api/job-preview', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.user.getIdToken()}`},body:JSON.stringify({url:input}),signal:AbortSignal.timeout(20_000) });
      const result = await response.json().catch(() => {throw new Error('取得できませんでした。時間をおくか、手入力で登録してください。');});
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '取得できませんでした。手入力で登録してください。');
      setCandidates(result.candidates);setMessage(result.message);
    } catch (error) { setMessage(error instanceof Error && error.name === 'TimeoutError' ? '取得に時間がかかっています。手入力でも登録できます。' : error instanceof Error ? error.message : '取得できませんでした。手入力してください。'); }
    finally { setBusy(false); }
  }
  return <div className="job-import"><label className="field"><span>求人URLから入力（任意）</span><input inputMode="url" maxLength={2000} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…" disabled={busy} /></label><button className="button button-outline" type="button" disabled={busy || !url.trim()} onClick={() => void preview()}>{busy ? '求人情報を取得中…' : '求人情報を取得'}</button>
    <p className="form-note">公開ページの求人情報を読み取ります。対応していないページは手入力で登録できます。</p>
    {message && <p role="status" className="form-note">{message}</p>}
    {candidates.map((candidate,index) => <div className="job-candidate" key={index}><p>{candidate.company || '会社名を入力してください'} / {candidate.role || '職種未入力'}</p><p>{candidate.location || '勤務地未入力'}</p><button className="button button-outline" type="button" onClick={() => {apply(candidate);setMessage('入力欄に反映しました。確認・修正してから「登録する」を押してください。');setCandidates([]);}}>この求人を入力欄に反映</button></div>)}
  </div>;
}
