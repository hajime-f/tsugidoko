"use client";
import { useRef, useState } from "react";
export function ContactForm() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState("");
  const active = useRef(false);
  if (receipt) return <section className="contact-receipt" role="status"><h2>お問い合わせを受け付けました</h2><p>受付番号：{receipt}</p><p>運営者が内容を確認します。自動返信メールは送信しません。返信が必要な場合は、入力されたメールアドレスへご連絡します。</p></section>;
  return <form className="contact-form" onSubmit={async event => {
    event.preventDefault(); if (active.current) return;
    const fields = new FormData(event.currentTarget); active.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(fields)) });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.id !== "string") throw new Error(result?.error || "お問い合わせを送信できませんでした。時間をおいてお試しください。");
      setReceipt(result.id);
    } catch (cause) { setError(cause instanceof TypeError ? "通信できませんでした。接続を確認してください。" : (cause as Error).message); }
    finally { active.current = false; setBusy(false); }
  }}><fieldset disabled={busy}>
    <label className="field"><span>返信先メールアドレス（必須）</span><input type="email" name="email" maxLength={254} required autoComplete="email" /></label>
    <label className="field"><span>お問い合わせの種類</span><select name="topic"><option value="general">サービスについて</option><option value="privacy">個人情報の取り扱い・開示等</option><option value="deletion">データ削除・退会について</option></select></label>
    <label className="field"><span>お問い合わせ内容（必須・10〜3,000文字）</span><textarea name="message" minLength={10} maxLength={3000} rows={8} required /></label>
    <input type="text" name="website" className="contact-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    <p>パスワード、認証コード、職務経歴書の全文などは送らないでください。内容は公開されません。</p>
  </fieldset>{error && <p role="alert" className="field-error">{error}</p>}<button className="button button-primary" disabled={busy}>{busy ? "送信中…" : "送信する"}</button></form>;
}
