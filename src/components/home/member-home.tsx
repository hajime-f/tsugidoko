"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Building2, ChevronRight, LayoutDashboard, FileText, CalendarDays, Columns3, LoaderCircle, LogOut, ShieldCheck, UserRound, X } from "lucide-react";
import { ApplicationWorkspace } from "./application-workspace";
import { useAuth } from "@/components/auth/auth-provider";

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className="member-avatar">{photo && !failed
    ? <img src={photo} alt="プロフィール写真" width={40} height={40} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : name.slice(0, 1).toUpperCase()}</span>;
}

export function MemberHome() {
  const auth = useAuth();
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountOpener = useRef<HTMLElement | null>(null);
  function openAccount(opener: HTMLElement) {
    accountOpener.current = opener;
    auth.clearError();
    setAccountOpen(true);
  }

  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace("/");
  }, [auth.loading, auth.user, router]);

  if (auth.loading || !auth.user) return <main className="member-loading" aria-busy="true"><LoaderCircle className="auth-spinner" size={28} aria-hidden="true" /><p role="status">ログイン状態を確認しています…</p>{auth.error && <p role="alert">{auth.error}</p>}</main>;

  const user = auth.user;
  const name = user.displayName?.trim() || "ユーザー";
  async function logout() {
    await auth.logout();
  }

  return <div className="member-shell">
    <a href="#member-main" className="skip-link">本文へ移動</a>
    <header className="member-header">
      <Link href="/home" className="brand" aria-label="ツギドコ ホーム"><span className="brand-mark"><ArrowUpRight size={24} /></span><span>ツギドコ<span className="brand-dot">.</span></span></Link>
      <Dialog.Root open={accountOpen} onOpenChange={open => { setAccountOpen(open); if (open) auth.clearError(); }}>
        <Dialog.Trigger className="member-account" aria-label={`${name}さんのアカウントを開く`} onClick={event => { accountOpener.current = event.currentTarget; }}><Avatar key={`${user.uid}:${user.photoURL}`} name={name} photo={user.photoURL} /><span>{name}さん</span><ChevronRight size={16} aria-hidden="true" /></Dialog.Trigger>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content account-dialog" onCloseAutoFocus={event => {
          if (accountOpener.current?.isConnected && accountOpener.current !== document.body) { event.preventDefault(); accountOpener.current.focus(); }
        }}>
          <Dialog.Close className="dialog-close" aria-label="閉じる"><X size={20} /></Dialog.Close>
          <Avatar key={`${user.uid}:${user.photoURL}`} name={name} photo={user.photoURL} />
          <Dialog.Title>アカウント</Dialog.Title><Dialog.Description>現在ログインしているアカウントです。</Dialog.Description>
          <dl className="account-details"><div><dt>名前</dt><dd>{name}</dd></div><div><dt>メールアドレス</dt><dd>{user.email || "未設定"}</dd></div><div><dt>ログイン方法</dt><dd>Google</dd></div></dl>
          {auth.error && <p className="auth-error" role="alert">{auth.error}</p>}
          <button className="button button-outline account-logout" disabled={auth.busy} onClick={() => void logout()}><LogOut size={18} aria-hidden="true" />{auth.busy ? "ログアウトしています…" : "ログアウト"}</button>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </header>
    <div className="member-layout">
      <aside className="member-sidebar">
        <nav aria-label="メインメニュー"><Link href="/home" aria-current="page" className="member-nav-active"><LayoutDashboard size={19} aria-hidden="true" />ホーム</Link><a href="#actions"><CalendarDays size={19} aria-hidden="true" />次にやること</a><a href="#comparison"><Columns3 size={19} aria-hidden="true" />比較</a><a href="#applications"><Building2 size={19} aria-hidden="true" />応募先</a><a href="#resumes"><FileText size={19} aria-hidden="true" />職務経歴書</a><button onClick={event => openAccount(event.currentTarget)}><UserRound size={19} aria-hidden="true" />アカウント</button></nav>
        <div className="sidebar-note"><span className="sidebar-symbol"><ArrowUpRight size={24} /></span><p>次は、どこへ行こう。</p><span>焦らず、自分らしい一歩を。</span></div>
        <Link href="/" className="member-site-link">サービスの紹介<ArrowUpRight size={14} /></Link>
      </aside>
      <main id="member-main" className="member-main">
        <div className="member-heading"><div><p className="auth-eyebrow">MY HOME</p><h1>あなたの転職活動</h1><p className="member-greeting">{name}さん、ようこそ。</p></div><span className="member-private"><ShieldCheck size={16} aria-hidden="true" />ログイン済み</span></div>
        <ApplicationWorkspace key={user.uid} uid={user.uid} />
        <footer className="member-footer"><span>ツギドコ / あなたらしい次の一歩へ。</span><span>PROTOTYPE</span></footer>
      </main>
    </div>
  </div>;
}
