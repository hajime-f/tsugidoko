"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { isEnded, localDate, taskGroup, taskGroups, taskSchema, type Task, type TaskInput } from "@/lib/applications";
import type { Workspace } from "./use-workspace";

function TaskEditor({ task, workspace, close }: { task: Task | null; workspace: Workspace; close: () => void }) {
  const id = useId();
  const [error, setError] = useState("");
  const choices = workspace.applications.filter(app => (!isEnded(app.status)) || app.id === task?.applicationId);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<TaskInput>({ resolver: zodResolver(taskSchema), defaultValues: task ?? { applicationId: choices.length === 1 ? choices[0].id : "", title: "", dueDate: "" } });
  return <form onSubmit={handleSubmit(async value => {
    setError("");
    try { if (task) await workspace.updateTask(task.id, value); else await workspace.addTask(value); close(); }
    catch (cause) { setError((cause as Error).message); }
  })}>
    <fieldset disabled={isSubmitting} className="form-fields">
      <label className="field field-wide"><span>応募先（必須）</span><select {...register("applicationId")} aria-invalid={!!errors.applicationId} aria-describedby={errors.applicationId ? `${id}-application-error` : undefined}><option value="">選んでください</option>{choices.map(app => <option key={app.id} value={app.id}>{app.company}{app.role ? ` / ${app.role}` : ""}{isEnded(app.status) ? "（終了）" : ""}</option>)}</select>{errors.applicationId && <small id={`${id}-application-error`} className="field-error">{errors.applicationId.message}</small>}</label>
      <label className="field field-wide"><span>やること（必須）</span><input maxLength={200} placeholder="例：面接日程を返信する" {...register("title")} aria-invalid={!!errors.title} aria-describedby={errors.title ? `${id}-title-error` : undefined} />{errors.title && <small id={`${id}-title-error`} className="field-error">{errors.title.message}</small>}</label>
      <label className="field"><span>期限（任意）</span><input type="date" min="2000-01-01" max="2100-12-31" {...register("dueDate")} aria-invalid={!!errors.dueDate} aria-describedby={errors.dueDate ? `${id}-date-error` : undefined} />{errors.dueDate && <small id={`${id}-date-error`} className="field-error">{errors.dueDate.message}</small>}</label>
    </fieldset>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="button button-outline" onClick={close} disabled={isSubmitting}>キャンセル</button><button className="button button-primary" disabled={isSubmitting}>{isSubmitting ? "保存中…" : task ? "保存する" : "追加する"}</button></div>
  </form>;
}

export function TaskBoard({ workspace }: { workspace: Workspace }) {
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [showEnded, setShowEnded] = useState(false);
  const [today, setToday] = useState(() => localDate());
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const refresh = () => setToday(localDate());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  function edit(task: Task | null, element: HTMLElement) { opener.current = element; setEditing(task); }
  async function act(action: () => Promise<unknown>, message: string) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(""); setNotice("");
    try { await action(); setNotice(message); } catch (cause) { setError((cause as Error).message); }
    finally { pendingRef.current = false; setPending(false); }
  }
  const parents = new Map(workspace.applications.map(app => [app.id, app]));
  const tasks = workspace.tasks.filter(task => parents.has(task.applicationId) && (showEnded || !isEnded(parents.get(task.applicationId)?.status)))
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.createdAt - b.createdAt);
  const open = tasks.filter(task => !task.done);
  const complete = tasks.filter(task => task.done);
  const date = new Date(`${today}T12:00:00`);
  function rows(list: Task[]) {
    return <ul className="task-list">{list.map(task => {
      const app = parents.get(task.applicationId)!;
      return <li key={task.id} className={task.done ? "task-done" : ""}>
        <input type="checkbox" checked={task.done} disabled={pending} aria-label={`${task.title}を${task.done ? "未完了に戻す" : "完了にする"}`} onChange={event => void act(() => workspace.toggleTask(task.id, event.target.checked), task.done ? "未完了に戻しました。" : "完了にしました。")} />
        <div className="task-info"><button className="task-title" onClick={event => edit(task, event.currentTarget)}>{task.title}</button><span>{app.company}{app.role ? ` / ${app.role}` : ""}{isEnded(app.status) ? "（選考終了）" : ""}</span></div>
        <span className="task-date">{task.dueDate ? <time dateTime={task.dueDate}>{task.dueDate.replaceAll("-", "/")}</time> : "期限未定"}</span>
        <button className="task-delete" disabled={pending} aria-label={`${task.title}を削除`} onClick={() => { if (window.confirm(`「${task.title}」を削除しますか？`)) void act(() => workspace.deleteTask(task.id), "やることを削除しました。"); }}>削除</button>
      </li>;
    })}</ul>;
  }
  return <section id="actions" className="workspace-section" aria-labelledby="actions-title">
    <div className="workspace-title"><div><h2 id="actions-title">次にやること</h2><p>今日と今週の予定を、応募先をまたいで確認。</p></div><button className="button button-outline" disabled={workspace.loading || !!workspace.error || !workspace.applications.some(app => !isEnded(app.status))} onClick={event => edit(null, event.currentTarget)}><Plus size={18} />やることを追加</button></div>
    <label className="check-label"><input type="checkbox" checked={showEnded} onChange={event => setShowEnded(event.target.checked)} />終了した選考のやることも表示</label>
    <p role="status" className="workspace-status">{pending ? "保存中…" : notice}</p>
    {error && <p role="alert" className="field-error">{error}</p>}
    {workspace.loading ? <p role="status">予定を読み込んでいます…</p> : <>
      {open.length === 0 && <p className="workspace-empty">{workspace.applications.some(app => !isEnded(app.status)) ? "未完了のやることはありません。期限が決まっていなくても追加できます。" : "まずは応募先を登録して、次にやることを追加しましょう。"}</p>}
      {taskGroups.map(group => { const list = open.filter(task => taskGroup(task.dueDate, date) === group); return list.length ? <section className="task-group" key={group} aria-label={group}><h3>{group}<span>{list.length}件</span></h3>{rows(list)}</section> : null; })}
      {complete.length > 0 && <details className="completed-tasks"><summary>完了したこと（{complete.length}件）</summary>{rows(complete)}</details>}
    </>}
    <Dialog.Root open={editing !== undefined} onOpenChange={value => { if (!value) setEditing(undefined); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content workspace-dialog" onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}><Dialog.Close className="dialog-close" aria-label="閉じる"><X size={20} /></Dialog.Close><Dialog.Title>{editing ? "やることを編集" : "やることを追加"}</Dialog.Title><Dialog.Description>応募先と次の行動を記録します。期限は後から変更できます。</Dialog.Description>{editing !== undefined && <TaskEditor key={editing?.id ?? "new"} task={editing} workspace={workspace} close={() => setEditing(undefined)} />}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
