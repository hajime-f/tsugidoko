"use client";
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
type Settings = {enabled:boolean;ready:boolean;verified:boolean;email:string};
export function NotificationSettings() {
  const {user} = useAuth(); const [settings,setSettings] = useState<Settings | null>(null);
  const [busy,setBusy] = useState(false);const [message,setMessage] = useState('');const [error,setError] = useState('');
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        const response = await fetch('/api/notifications',{headers:{Authorization:`Bearer ${await user?.getIdToken()}`},signal:AbortSignal.timeout(15_000)});
        const data = await response.json(); if(!response.ok) throw new Error(data.error);
        if(active) setSettings(data);
      } catch { if(active) setError('通知設定を読み込めませんでした。再読み込みしてください。'); }
    }
    void read();return () => {active=false;};
  },[user]);
  async function toggle(enabled: boolean) {
    if(busy || !settings) return;
    setBusy(true);setError('');setMessage('');
    try {
      const response = await fetch('/api/notifications',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user?.getIdToken()}`},body:JSON.stringify({enabled}),signal:AbortSignal.timeout(15_000)});
      const data = await response.json();if(!response.ok) throw new Error(data.error);
      setSettings({...settings,enabled:data.enabled});setMessage(data.enabled ? 'メール通知をオンにしました。' : 'メール通知をオフにしました。');
    } catch {setError('設定を確認できませんでした。再読み込みして現在の設定を確認してください。');}
    finally {setBusy(false);}
  }
  return <section id="notification-settings" className="workspace-section" aria-labelledby="notifications-title"><div className="workspace-title"><div><h2 id="notifications-title">メール通知</h2><p>今日・明日が期限の未完了の予定を、日本時間の朝9時ごろにまとめてお知らせします。</p></div></div>
    <p className="form-note">初期状態はオフです。会社名や予定の内容はメールに載せません。終了した応募先は対象外です。</p>
    {settings ? <><label className="check-label notification-toggle"><input type="checkbox" checked={settings.enabled} disabled={busy || (!settings.enabled && (!settings.ready || !settings.verified))} onChange={event => void toggle(event.target.checked)} />期限のリマインダーをメールで受け取る</label><p className="form-note">送信先：{settings.email || '未設定'}</p>{!settings.ready && <p role="status" className="form-note">メール配信の設定中です。現在は通知を送信しません。</p>}{!settings.verified && <p className="form-note">有効にするには、確認済みのメールアドレスが必要です。</p>}</> : !error && <p role="status">通知設定を読み込んでいます…</p>}
    {error && <p role="alert" className="field-error">{error}</p>}<p role="status" className="workspace-status">{busy ? '保存中…' : message}</p>
  </section>;
}
