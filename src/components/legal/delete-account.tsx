"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GoogleAuthProvider, reauthenticateWithPopup } from "firebase/auth";
import { useAuth } from "@/components/auth/auth-provider";
type Mode = "data" | "account";
type Status = { state: "none" | "deleting" | "complete"; mode?: Mode; sessionCompleted?: boolean };

export function DeleteAccount() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("data");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [statusFailed, setStatusFailed] = useState(false);
  const [finishReady, setFinishReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<Mode | null>(null);
  const acting = useRef(false);
  useEffect(() => {
    let current = true;
    if (auth.loading) return;
    if (!auth.user) { setChecking(false); return; }
    setChecking(true);
    void auth.user.getIdToken().then(async token => {
      const response = await fetch("/api/account/delete", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const status = await response.json() as Status;
      if (!response.ok) throw new Error();
      if (current) { setPending(status.state === "deleting"); if ((status.state === "deleting" || status.sessionCompleted) && status.mode) setMode(status.mode); setFinishReady(Boolean(status.sessionCompleted)); setStatusFailed(false); setChecking(false); }
    }).catch(() => { if (current) { setChecking(false); setStatusFailed(true); setError("削除の状態を確認できませんでした。ページを再読み込みしてください。"); } });
    return () => { current = false; };
  }, [auth.loading, auth.user]);
  async function finish(result: Mode, uid: string) {
    try {
      localStorage.setItem("tsugidoko-account-deleted", JSON.stringify({ uid, at: Date.now() }));
      localStorage.removeItem("tsugidoko-account-deleted");
    } catch { /* Server rules also reject old sessions if browser storage is unavailable. */ }
    await auth.logout();
    setCompleted(result);
  }
  async function remove() {
    if (acting.current || !auth.user || confirmation !== "削除") return;
    acting.current = true; setBusy(true); setError("");
    const user = auth.user;
    let finished = false;
    try {
      // A previous final response may have been lost after the account was deleted.
      if (pending || finishReady) {
        const statusResponse = await fetch("/api/account/delete", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
        if (statusResponse.ok) {
          const status = await statusResponse.json() as Status;
          if (status.sessionCompleted && status.mode) {
            const finalized = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ mode: status.mode, confirmation }) });
            if (!finalized.ok) throw new Error("削除結果を確認できませんでした。時間をおいて再開してください。");
            await finish(status.mode, user.uid); finished = true; return;
          }
        }
      }
      await reauthenticateWithPopup(user, new GoogleAuthProvider().setCustomParameters({ prompt: "select_account" }));
      const token = await user.getIdToken(true);
      for (;;) {
        const response = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ mode, confirmation }) });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) throw new Error(result?.error || "削除できませんでした。接続を確認して再開してください。");
        if (result.done) { await finish(result.mode as Mode, user.uid); finished = true; return; }
        setPending(true);
        await new Promise(resolve => setTimeout(resolve, result.busy ? 5000 : 1000));
      }
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      if (!["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"].includes(code || "")) {
        setError(code ? "本人確認を完了できませんでした。ログイン状態とポップアップの許可を確認してください。" : cause instanceof TypeError ? "通信できませんでした。接続を確認して削除を再開してください。" : (cause as Error).message);
      }
    } finally {
      if (!finished) {
        try {
          const response = await fetch("/api/account/delete", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
          if (response.ok) {
            const status = await response.json() as Status;
            setPending(status.state === "deleting"); setFinishReady(Boolean(status.sessionCompleted));
            if ((status.state === "deleting" || status.sessionCompleted) && status.mode) setMode(status.mode);
          }
        } catch { /* The next attempt checks the server again; no deletion bypass is allowed. */ }
      }
      acting.current = false; setBusy(false);
    }
  }
  if (completed) return <section className="deletion-panel" role="status"><h2>{completed === "account" ? "退会が完了しました" : "保存データを削除しました"}</h2><p>{completed === "account" ? "ツギドコの保存データとアカウントを削除しました。Googleアカウント自体は削除されません。" : "保存データを削除し、ログアウトしました。Googleで再ログインすると、新しく記録を始められます。"}</p><Link href="/">トップページへ</Link></section>;
  if (auth.loading || checking) return <p role="status">ログイン状態と削除状況を確認しています…</p>;
  if (!auth.user) return <section className="deletion-panel"><h2>ログインして削除する</h2><p>本人の記録だけを削除するため、Googleでログインしてください。ログインできない場合は<Link href="/contact">お問い合わせ</Link>から削除をご相談いただけます。</p><Link className="button button-primary" href="/">ログインへ</Link></section>;
  return <section className="deletion-panel" aria-labelledby="delete-heading"><h2 id="delete-heading">自分のデータを削除する</h2><p>対象アカウント：{auth.user.email || auth.user.displayName || "現在のアカウント"}</p>
    {pending && <p role="status">前回の削除処理が残っています。同じ削除方法で再開できます。</p>}
    <fieldset disabled={busy || pending} className="deletion-options"><legend>削除する範囲</legend>
      <label><input type="radio" name="deletion-mode" checked={mode === "data"} onChange={() => setMode("data")} /><span>保存データをすべて削除<span>アカウントを残し、応募先・予定・メモ・職務経歴書などを削除します。</span></span></label>
      <label><input type="radio" name="deletion-mode" checked={mode === "account"} onChange={() => setMode("account")} /><span>退会してアカウントも削除<span>保存データに加え、ツギドコの認証アカウントも削除します。</span></span></label>
    </fieldset>
    <p>削除は取り消せません。必要なCSV・PDFを先に保存してください。処理中は別のタブからも読み書きできなくなり、完了後はログアウトします。Googleで本人確認を行った後、削除を開始します。</p>
    <label className="field"><span>確認のため「削除」と入力してください</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" /></label>
    {error && <p role="alert" className="field-error">{error}</p>}
    {busy && <p role="status">本人確認・削除処理を進めています。この画面を開いたままお待ちください。</p>}
    <button type="button" className="button button-danger" disabled={busy || statusFailed || confirmation !== "削除"} onClick={() => void remove()}>{busy ? "処理中…" : finishReady ? "削除結果を確認" : pending ? "本人確認して削除を再開" : "本人確認して削除する"}</button>
  </section>;
}
