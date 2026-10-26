"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { LEGAL_VERSION } from "@/lib/legal";
import { getClientAuth, getClientDatabase } from "@/lib/firebase/client";
export function LegalConsent({ uid, children }: { uid: string; children: ReactNode }) {
  const [accepted, setAccepted] = useState(false), [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => onSnapshot(doc(getClientDatabase(), "users", uid, "legal", "consent"), snapshot => {
    setAccepted(snapshot.get("version") === LEGAL_VERSION); setLoading(false);
  }, () => { setLoading(false); setAccepted(false); setError("利用状況を確認できませんでした。削除中の場合はデータ削除ページへ、それ以外は再ログインしてください。"); }), [uid]);
  async function agree() {
    if (!checked || busy) return;
    setBusy(true); setError("");
    try {
      const user = getClientAuth().currentUser;
      if (!user || user.uid !== uid) throw new Error("ログインし直してください。");
      const response = await fetch("/api/legal-consent", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ version: LEGAL_VERSION, accepted: true }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "同意を保存できませんでした。時間をおいてお試しください。");
    } catch (cause) { setError(cause instanceof TypeError ? "通信できませんでした。接続を確認してください。" : (cause as Error).message); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status">利用状況を確認しています…</p>;
  if (accepted) return children;
  return <section className="consent-panel" aria-labelledby="consent-heading"><h2 id="consent-heading">ご利用前にご確認ください</h2><p>転職活動の記録や職務経歴書を保存する前に、利用条件と個人情報の取り扱いをご確認ください。</p><div className="consent-documents"><Link href="/terms" target="_blank" rel="noreferrer">利用規約（別タブ）</Link><Link href="/privacy" target="_blank" rel="noreferrer">プライバシーポリシー（別タブ）</Link></div><label className="check-label"><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} />利用規約に同意し、プライバシーポリシーを確認しました</label>{error && <p role="alert" className="field-error">{error}</p>}<button className="button button-primary" disabled={!checked || busy} onClick={() => void agree()}>{busy ? "保存中…" : "同意して利用を始める"}</button><p><Link href="/data-deletion">同意せずにデータの削除・退会へ進む</Link></p></section>;
}
