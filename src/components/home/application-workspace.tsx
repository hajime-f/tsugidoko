"use client";

import { useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { isEnded, isHighlighted, applicationSchema, emptyApplication, applicationStatuses, type Application, type ApplicationInput } from "@/lib/applications";
import { useWorkspace, type Workspace } from "./use-workspace";
import { TaskBoard } from "./task-board";
import { NotificationSettings } from "./notification-settings";
import { JobImport } from "./job-import";
import { ComparisonBoard } from "./comparison-board";

function ApplicationEditor({ application, workspace, close }: { application: Application | null; workspace: Workspace; close: () => void }) {
  const id = useId();
  const [showDetails, setShowDetails] = useState(!!application);
  const [error, setError] = useState("");
  const { register, setValue, handleSubmit, formState: { errors, isSubmitting, dirtyFields } } = useForm<ApplicationInput>({ resolver: zodResolver(applicationSchema), defaultValues: application ?? emptyApplication });
  const field = (name: keyof ApplicationInput, label: string, multiline = false) => <label className={multiline ? "field field-wide" : "field"} htmlFor={`${id}-${name}`}>
    <span>{label}</span>
    {multiline ? <textarea id={`${id}-${name}`} rows={4} maxLength={5000} {...register(name)} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${id}-${name}-error` : undefined} /> : <input id={`${id}-${name}`} maxLength={name === "url" ? 2000 : 120} {...register(name)} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${id}-${name}-error` : undefined} />}
    {errors[name] && <small id={`${id}-${name}-error`} className="field-error">{errors[name]?.message}</small>}
  </label>;
  return <form onSubmit={handleSubmit(async value => {
    setError("");
    try {
      if (application) {
        const changes = Object.fromEntries(Object.keys(dirtyFields).map(key => [key, value[key as keyof ApplicationInput]]));
        if (Object.keys(changes).length) await workspace.updateApplication(application.id, changes);
      } else await workspace.addApplication(value);
      close();
    } catch (cause) { setError((cause as Error).message); }
  })}>
    {!application && <JobImport rememberUrl={url => {setValue("url", url, {shouldDirty:true});setShowDetails(true);}} apply={candidate => { for (const [key,value] of Object.entries(candidate)) setValue(key as keyof ApplicationInput, value, {shouldDirty:true});setShowDetails(true);}} />}
    <fieldset disabled={isSubmitting} className="form-fields">
      {field("company", "会社名（必須）")}
      {showDetails && <>
        {field("role", "職種・識別ラベル")}{field("source", "応募経路")}{field("url", "求人URL")}
        <label className="field" htmlFor={`${id}-status`}><span>選考状況</span><select id={`${id}-status`} {...register("status")}>{applicationStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
        {field("salary", "年収・提示条件")}{field("location", "勤務地")}{field("workStyle", "働き方")}
        {field("positives", "魅力に感じる点", true)}{field("concerns", "気になる点", true)}{field("notes", "面接メモ・確認したいこと", true)}
      </>}
    </fieldset>
    {!application && <p className="form-note">職種や求人URLは、登録後に追加できます。</p>}
    {error && <p role="alert" className="field-error">{error}</p>}
    <div className="form-actions"><button type="button" className="button button-outline" onClick={close} disabled={isSubmitting}>キャンセル</button><button className="button button-primary" disabled={isSubmitting}>{isSubmitting ? "保存中…" : application ? "保存する" : "登録する"}</button></div>
  </form>;
}

export function ApplicationWorkspace({ uid }: { uid: string }) {
  const workspace = useWorkspace(uid);
  const [editing, setEditing] = useState<Application | null | undefined>(undefined);
  const [filter, setFilter] = useState("進行中");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("更新順");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  async function act(action: () => Promise<unknown>, notice: string) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(""); setMessage("");
    try { await action(); setMessage(notice); }
    catch (cause) { setError((cause as Error).message); }
    finally { pendingRef.current = false; setPending(false); }
  }
  function edit(application: Application | null, element: HTMLElement) { opener.current = element; setEditing(application); }
  const active = workspace.applications.filter(app => !isEnded(app.status));
  const ended = workspace.applications.filter(app => isEnded(app.status));
  const visible = workspace.applications.filter(app => (filter === "終了" ? isEnded(app.status) : !isEnded(app.status)) && (!statusFilter || app.status === statusFilter) && `${app.company} ${app.role} ${app.source}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => sort === "会社名順" ? a.company.localeCompare(b.company, "ja") : sort === "選考状況順" ? applicationStatuses.indexOf(b.status) - applicationStatuses.indexOf(a.status) || b.updatedAt - a.updatedAt : b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

  return <div className="workspace">
    {workspace.offline && <p role="status" className="workspace-notice">オフラインです。表示中の情報は最新ではない場合があります。保存には接続が必要です。</p>}
    {workspace.error && <p role="alert" className="field-error">{workspace.error}</p>}
    <TaskBoard workspace={workspace} />
    <section id="applications" className="workspace-section" aria-labelledby="applications-title">
      <div className="workspace-title"><div><h2 id="applications-title">応募先</h2><p>会社名だけで登録して、いまの進み具合を残しましょう。</p></div><button className="button button-primary" onClick={event => edit(null, event.currentTarget)} disabled={workspace.loading || !!workspace.error}><Plus size={18} />応募先を登録</button></div>
      {workspace.loading ? <p role="status" className="workspace-empty">応募先を読み込んでいます…</p> : <>
        <div className="stage-summary" aria-label="進行中の状況別件数">{applicationStatuses.filter(status => !isEnded(status)).map(stage => <span key={stage}>{stage}<b>{active.filter(app => app.status === stage).length}</b></span>)}</div>
        <div className="workspace-filters">
          <div className="workspace-tabs" role="group" aria-label="応募先の表示">{["進行中", "終了"].map(tab => <button key={tab} aria-pressed={filter === tab} onClick={() => setFilter(tab)}>{tab} <span>{tab === "進行中" ? active.length : ended.length}</span></button>)}</div>
          <label className="field"><span>応募先を検索</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="会社名・職種・経路" /></label>
          <label className="field"><span>状況で絞り込み</span><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">すべての状況</option>{applicationStatuses.map(stage => <option key={stage}>{stage}</option>)}</select></label>
          <label className="field"><span>並び順</span><select value={sort} onChange={e => setSort(e.target.value)}>{["更新順", "選考状況順", "会社名順"].map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        <p role="status" className="workspace-status">{pending ? "保存中…" : message}</p>
        {error && <p role="alert" className="field-error">{error}</p>}
        {visible.length ? <div className="workspace-table-wrap"><table className="workspace-table"><caption className="sr-only">{filter}の応募先一覧</caption><thead><tr><th>応募先</th><th>選考状況</th><th>応募経路</th><th>更新日</th></tr></thead><tbody>{visible.map(app => <tr key={app.id} className={isHighlighted(app.status) ? `application-highlight${app.status === "入社決定" ? " application-accepted" : ""}` : undefined}>
          <td><button className="company-link" onClick={event => edit(app, event.currentTarget)}>{app.company}</button><span className="application-role">{app.role || "職種未入力"}</span></td>
          <td><select aria-label={`${app.company}の選考状況`} value={app.status} disabled={pending} onChange={e => void act(() => workspace.updateApplication(app.id, { status: e.target.value as ApplicationInput["status"] }), isEnded(e.target.value) ? "終了した選考に移しました。記録は残っています。" : "選考状況を更新しました。")}>{applicationStatuses.map(status => <option key={status}>{status}</option>)}</select></td>
          <td>{app.source || "未入力"}</td><td>{app.updatedAt ? new Date(app.updatedAt).toLocaleDateString("ja-JP") : "保存中"}</td>

        </tr>)}</tbody></table></div> : <div className="workspace-empty"><h3>{workspace.applications.length ? "条件に合う応募先はありません" : "最初の応募先を登録しましょう"}</h3><p>{workspace.applications.length ? "表示や検索条件を変えて確認できます。" : "気になっている会社でも大丈夫。会社名だけで始められます。"}</p></div>}
      </>}
    </section>
    <ComparisonBoard workspace={workspace} edit={edit} />
    <NotificationSettings />
    <Dialog.Root open={editing !== undefined} onOpenChange={open => { if (!open) setEditing(undefined); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content workspace-dialog" onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}>
      <Dialog.Close className="dialog-close" aria-label="閉じる"><X size={20} /></Dialog.Close><Dialog.Title>{editing ? "応募先の詳細" : "応募先を登録"}</Dialog.Title><Dialog.Description>{editing ? "必要な情報を少しずつ残せます。" : "まずは会社名を入力してください。"}</Dialog.Description>
      {editing !== undefined && <ApplicationEditor key={editing?.id ?? "new"} application={editing} workspace={workspace} close={() => setEditing(undefined)} />}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
