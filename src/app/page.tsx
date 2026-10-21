"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, ArrowRight, Check, ChevronDown, Plus, ListChecks, X, CalendarDays, CheckCheck, Building2, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Application = { id: number; company: string; role: string; stage: string; note: string };
const initialApplications: Application[] = [
  { id: 1, company: "株式会社ミドリ", role: "プロダクトデザイナー", stage: "一次面接", note: "面接の日程を確認する" },
  { id: 2, company: "合同会社ヒトトキ", role: "UI / UXデザイナー", stage: "書類選考", note: "選考結果を待っています" },
  { id: 3, company: "株式会社シロ", role: "Webデザイナー", stage: "最終面接", note: "面接で聞きたいことを整理" },
];
const stages = ["検討中", "応募済み", "書類選考", "一次面接", "最終面接", "内定", "終了"];
const questions = [
  ["どんなサービスですか？", "ツギドコは、応募した会社と選考の進み具合を一か所で整理する転職活動管理サービスです。複数の転職サイトやエージェントを使うときも、自分の活動をまとめて見渡せることを目指しています。"],
  ["複数の転職サイトを使っていても利用できますか？", "はい。応募経路にかかわらず、自分で応募先を登録して管理する想定です。求人サイトやエージェントとの自動連携は、現在の試作には含まれていません。"],
  ["スマートフォンからも使えますか？", "はい。PCで応募先をまとめて整理し、外出先ではスマートフォンで確認・更新する使い方を想定しています。このページのサンプルは、どちらのブラウザでもお試しいただけます。"],
  ["今すぐ登録して使えますか？", "現在は試作版です。アカウントの登録やログインはまだ利用できません。このページでは登録不要でサンプルを体験できます。入力内容はサーバーに保存されず、ページを再読み込みするとリセットされます。料金は未定です。"],
];

function Brand({ light = false }: { light?: boolean }) {
  return <a href="#" className={`brand ${light ? "brand-light" : ""}`} aria-label="ツギドコ トップ"><span className="brand-mark"><ArrowUpRight size={24} strokeWidth={2.8} /></span><span>ツギドコ<span className="brand-dot">.</span></span></a>;
}

export default function Home() {
  const dialogOpener = useRef<HTMLElement | null>(null);
  function openDialog(kind: "login" | "privacy") {
    dialogOpener.current = document.activeElement as HTMLElement;
    setDialog(kind);
  }
  const [dialog, setDialog] = useState<"login" | "privacy" | null>(null);
  const [applications, setApplications] = useState(initialApplications);
  const [company, setCompany] = useState("");
  const [heroCompany, setHeroCompany] = useState("");
  const [heroStage, setHeroStage] = useState("検討中");
  const [adding, setAdding] = useState(false);
  const [activeTab, setActiveTab] = useState("すべて");
  const [announcement, setAnnouncement] = useState("");
  const [previous, setPrevious] = useState<Application[] | null>(null);
  const visibleApplications = applications.filter(app => activeTab === "終了" ? app.stage === "終了" : app.stage !== "終了" && (activeTab === "すべて" || app.stage === activeTab));
  const activeCount = applications.filter(app => app.stage !== "終了").length;

  function jumpToDemo() {
    setDialog(null);
    window.setTimeout(() => document.getElementById("demo")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }), 60);
  }
  function updateStage(id: number, stage: string) {
    setPrevious(applications);
    setApplications(applications.map(app => app.id === id ? { ...app, stage, note: "いま更新しました" } : app));
    setAnnouncement(`選考状況を「${stage}」に変更しました。`);
  }
  function appendCompany(name: string, stage: string) {
    setPrevious(applications);
    setApplications([...applications, { id: Date.now(), company: name.trim(), role: "職種はあとから追加", stage, note: "いま登録しました" }]);
    setActiveTab(stage === "終了" ? "終了" : "すべて");
    setAnnouncement("応募先を追加しました。");
  }
  function addCompany(event: React.FormEvent) {
    event.preventDefault();
    if (!company.trim()) return;
    appendCompany(company, "検討中");
    setCompany("");
    setAdding(false);
  }
  function startSample(event: React.FormEvent) {
    event.preventDefault();
    if (!heroCompany.trim()) return;
    appendCompany(heroCompany, heroStage);
    setHeroCompany("");
    jumpToDemo();
    window.setTimeout(() => document.getElementById("demo")?.focus({ preventScroll: true }), 80);
  }

  return <>
    <a className="skip-link" href="#main">本文へ移動</a>
    <header className="site-header">
      <div className="container nav-inner">
        <Brand />
        <div className="nav-actions"><button className="login-link" onClick={() => openDialog("login")}>ログイン</button><Button size="small" onClick={jumpToDemo}>サンプルを試す</Button></div>
      </div>
    </header>
    <main id="main">
      <section className="hero">
        <div className="hero-visual"><Image src="/images/career-desk.jpg" alt="ノートパソコンと手帳、コーヒーが置かれたデスク" fill priority sizes="100vw" className="hero-photo" /><div className="photo-shade" /></div>
        <div className="container hero-content">
          <p className="hero-kicker">転職活動の応募先・進捗管理</p>
          <h1>転職活動を、<br className="mobile-break" />ひとまとめ。</h1>
          <p className="hero-description">どの会社を受けて、いまどこまで進んだか。<br />ひと目でわかれば、次の一歩に集中できる。</p>
          <form className="hero-form" onSubmit={startSample} aria-label="応募管理を体験する">
            <label className="hero-company"><Building2 size={23} /><span className="sr-only">試す会社名</span><input value={heroCompany} onChange={event => setHeroCompany(event.target.value)} placeholder="会社名を入力してください" maxLength={60} required aria-describedby="hero-trial-note" /></label>
            <label className="hero-stage"><ListChecks size={23} /><span className="sr-only">現在の選考段階</span><select value={heroStage} onChange={event => setHeroStage(event.target.value)}>{stages.map(stage => <option key={stage}>{stage}</option>)}</select><ChevronDown size={18} /></label>
            <Button type="submit">この会社で試す<ArrowRight size={20} /></Button>
          </form>
          <p className="trial-note" id="hero-trial-note">登録不要のサンプルです。入力内容は保存されません。</p>
          <button className="text-link" onClick={jumpToDemo}>入力せずにサンプルを見る<ArrowRight size={16} /></button>
        </div>
      </section>

      <section id="how" className="how-section section-space container">
        <div className="section-heading"><h2>管理の手間を、もっと少なく。</h2></div>
        <div className="steps">
          <article><div className="step-art"><span className="step-index">STEP 01</span><div className="mini-input"><span>会社名</span><div>株式会社ミドリ<span className="cursor" /></div><span className="mini-save"><Plus size={13} />応募先を追加</span></div></div><h3>会社名を入れて、登録。</h3><p>最初は会社名だけで大丈夫。<br />職種や求人URLは、あとから追加。</p></article>
          <article><div className="step-art"><span className="step-index">STEP 02</span><div className="mini-stages"><span>書類選考<Check size={14} /></span><span className="selected-stage">一次面接<Check size={14} /></span><span>最終面接<Check size={14} /></span></div></div><h3>いまの選考段階を、選ぶ。</h3><p>進捗が変わったら、その場で更新。<br />どこまで進んだかを、迷わず残せます。</p></article>
          <article><div className="step-art"><span className="step-index">STEP 03</span><div className="mini-summary"><span><CalendarDays size={15} />MY NEXT STEP</span><p>次の一歩に、集中しよう。</p><div><i /><i /><i /><i /><i /></div><span className="summary-bottom"><CheckCheck size={15} />活動が、すっきり。</span></div></div><h3>全体を見渡して、次へ。</h3><p>進行中の応募をひと目で確認。<br />管理より、これからのことに時間を。</p></article>
        </div>
      </section>

      <section id="features" className="features-section section-space">
        <div className="container">
          <div className="section-heading"><h2>応募先の「いま」が、ひと目で。</h2><p>会社名を入れて、選考段階を選ぶ。管理は、それだけ。</p></div>
          <div className="features-layout">
            <div className="app-preview" id="demo" tabIndex={-1} role="region" aria-label="応募管理サンプル">
              <div className="app-chrome"><span className="window-dots"><i /><i /><i /></span><span>ツギドコ / 応募管理</span><span className="sample-label">操作できるサンプル</span></div>
              <div className="app-content">
                <div className="app-title"><div><span className="app-date">MY APPLICATIONS</span><h3>あなたの応募先<span>{activeCount}件</span></h3></div><button className="add-button" onClick={() => setAdding(!adding)} aria-expanded={adding} aria-controls="add-application"><Plus size={15} />追加</button></div>
                <div className="app-tabs" role="group" aria-label="選考状況で絞り込み">{["すべて", "書類選考", "一次面接", "終了"].map(tab => <button key={tab} className={activeTab === tab ? "active" : ""} aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)}>{tab}<span>{applications.filter(app => tab === "すべて" ? app.stage !== "終了" : app.stage === tab).length}</span></button>)}</div>
                {adding && <form className="add-form" id="add-application" onSubmit={addCompany}><label htmlFor="company-name">会社名</label><div><input id="company-name" autoFocus value={company} onChange={event => setCompany(event.target.value)} placeholder="例：株式会社ツギドコ" maxLength={60} required /><Button size="small" type="submit">登録</Button><button type="button" className="icon-button" aria-label="追加をキャンセル" onClick={() => setAdding(false)}><X size={17} /></button></div></form>}
                <div className="application-list">{visibleApplications.map(app => <div className="application-row" key={app.id}><span className={`company-icon company-icon-${app.id % 3}`}><Building2 size={18} /></span><div className="company-info"><h4>{app.company}</h4><p>{app.role}</p><span className="company-note">{app.note}</span></div><div className="stage-select"><select aria-label={`${app.company}の選考状況`} value={app.stage} onChange={event => updateStage(app.id, event.target.value)} className={`stage-${stages.indexOf(app.stage)}`}>{stages.map(stage => <option key={stage}>{stage}</option>)}</select><ChevronDown size={12} /></div></div>)}{visibleApplications.length === 0 && <p className="empty-state">この段階の応募先はありません。</p>}</div>
                <div className="app-status"><span role="status">{announcement || "選考状況を選んで、変更してみましょう。"}</span>{previous ? <button onClick={() => { setApplications(previous); setPrevious(null); setAnnouncement("変更を取り消しました。"); }}>取り消す</button> : <CheckCheck size={14} />}</div>
              </div>
              <div className="demo-caption"><span>架空の応募先です。入力内容は再読み込みでリセットされます。</span><button aria-label="サンプルをリセット" onClick={() => { setApplications(initialApplications); setPrevious(null); setActiveTab("すべて"); setAnnouncement("サンプルをリセットしました。"); }}><RotateCcw size={14} /></button></div>
            </div>
            <div className="feature-list">
              <article><span className="feature-number">01</span><div><h3>応募先が、ひとつにまとまる。</h3><p>転職サイトも、エージェントも、直接応募も。<br />どこから応募しても、一緒に見渡せます。</p></div></article>
              <article><span className="feature-number">02</span><div><h3>進み具合が、すぐに分かる。</h3><p>書類選考、一次面接、最終面接。<br />会社ごとの「いま」を、一覧ですっきり。</p></div></article>
              <article><span className="feature-number">03</span><div><h3>更新は、段階を選ぶだけ。</h3><p>表の書式や集計を整える手間は不要。<br />変わったところだけ、さっと更新できます。</p></div></article>
              <p className="demo-hint"><ArrowUpRight size={16} />サンプルの「選考状況」を変えてみてください</p>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="faq-section section-space"><div className="container faq-layout"><div><h2>よくある質問</h2><p className="faq-intro">使いはじめる前に、<br />よくある質問をまとめました。</p></div><div className="faq-items">{questions.map(([question, answer], index) => <details key={question}><summary><span className="q-number">Q{index + 1}.</span>{question}<Plus className="faq-plus" size={18} /></summary><p>{answer}</p></details>)}</div></div></section>

      <section className="closing-section container"><div className="closing-inner"><h2>次は、どこへ行こう。</h2><p>転職活動を整理して、<br className="mobile-break" />自分らしい次の一歩を。</p><Button onClick={jumpToDemo}>ツギドコを体験する<ArrowUpRight size={18} /></Button><span className="closing-note">登録不要でサンプルをお試しいただけます</span></div></section>
    </main>
    <footer className="site-footer container"><div className="footer-top"><div><Brand /><p>転職活動を、もっと身軽に。</p></div><div className="footer-links"><a href="#features">できること</a><a href="#how">使い方</a><a href="#faq">よくある質問</a><button onClick={() => openDialog("privacy")}>試作版について</button></div></div><div className="footer-bottom"><span>© 2026 ツギドコ</span><a href="https://unsplash.com/photos/cckf4TsHAuw" target="_blank" rel="noreferrer">Photo by Andrew Neel on Unsplash<ArrowUpRight size={12} /></a><span className="prototype-label">PROTOTYPE</span></div></footer>

    <Dialog.Root open={dialog !== null} onOpenChange={open => !open && setDialog(null)}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content" onCloseAutoFocus={event => { event.preventDefault(); if (dialogOpener.current?.isConnected) dialogOpener.current.focus(); else document.querySelector<HTMLButtonElement>(".login-link")?.focus(); }}><Dialog.Close className="dialog-close" aria-label="閉じる"><X size={21} /></Dialog.Close><span className="dialog-symbol"><ShieldCheck size={28} /></span><Dialog.Title>{dialog === "login" ? "ログイン機能は準備中です" : "ツギドコの試作版について"}</Dialog.Title><Dialog.Description>現在はトップページの試作版です。アカウント登録やログインはまだ行えません。応募管理のサンプルを、登録なしでお試しいただけます。</Dialog.Description><p className="dialog-disclaimer">サンプルの入力内容はこの画面の中だけで扱い、サーバーには保存しません。再読み込みすると消えます。</p><Button onClick={jumpToDemo}>サンプルを試す<ArrowRight size={17} /></Button></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
