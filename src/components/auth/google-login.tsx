"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useRef } from "react";
import { useAuth } from "./auth-provider";

export function GoogleLogin() {
  const auth = useAuth();
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  async function login(opener: HTMLButtonElement) {
    trigger.current = opener;
    if (await auth.login()) router.replace("/home");
  }

  return <div className="landing-auth">
    <div className="auth-actions">
    {auth.loading ? <span className="login-link">確認中…</span> : auth.user && !auth.busy ? <Link className="login-link" href="/home">ホームへ</Link> : <>
    <button className="login-link google-login" onClick={event => void login(event.currentTarget)}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.89-1.74 2.98-4.31 2.98-7.37Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.4l-3.24-2.52c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.06v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.32-1.93v-2.6H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.53l3.34-2.6Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.82 1.51l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.47l3.34 2.6C7.19 7.71 9.4 5.95 12 5.95Z"/></svg>
      Googleで登録
    </button>
    <button className="login-link login-secondary" onClick={event => void login(event.currentTarget)}>ログイン</button>
    </>}
    </div>
    {auth.error && <div className="auth-feedback">
      <p className="auth-error" role="alert">{auth.error}</p>
      <button className="auth-feedback-close" aria-label="ログインの案内を閉じる" onClick={() => { auth.clearError(); trigger.current?.focus(); }}><X size={16} aria-hidden="true" /></button>
    </div>}
  </div>;
}
