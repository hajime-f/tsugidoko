"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { collection, doc, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from "firebase/firestore";
import { getClientAuth, getClientDatabase } from "@/lib/firebase/client";
import type { Application } from "@/lib/applications";
import { emptyInterview, interviewSchema, type Interview, type InterviewInput, type StatusEvent } from "@/lib/application-records";
import type { Workspace } from "./use-workspace";

function InterviewEditor({ initial, save, close, opener }: { opener: HTMLElement | null; initial: Interview | null; save: (data: InterviewInput, previous: Interview | null) => Promise<void>; close: () => void }) {
  const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<InterviewInput>({ resolver: zodResolver(interviewSchema), defaultValues: initial ?? emptyInterview });
  function dismiss() { if (!isSubmitting && (!isDirty || window.confirm("保存していない面接メモを閉じますか？"))) close(); }
  return <Dialog.Root open onOpenChange={open => { if (!open) dismiss(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content workspace-dialog" onCloseAutoFocus={event => { if (opener?.isConnected) { event.preventDefault(); opener.focus(); } }}>
    <Dialog.Title>{initial ? "面接メモを編集" : "面接メモを追加"}</Dialog.Title><Dialog.Description>面接名かメモだけでも保存できます。</Dialog.Description>
    <form onSubmit={handleSubmit(async data => { setError(""); try { await save(data, initial); close(); } catch (cause) { setError((cause as Error).message); } })}>
      <fieldset className="form-fields" disabled={isSubmitting}>
        {([['title','面接名'],['date','面接日（任意）'],['interviewer','担当者（任意）']] as const).map(([key,label]) => <label className="field" key={key}><span>{label}</span><input type={key === 'date' ? 'date' : 'text'} maxLength={120} {...register(key)} />{errors[key] && <small className="field-error">{errors[key]?.message}</small>}</label>)}
        {([['notes','聞かれたこと・話したこと'],['concerns','気になった点'],['nextQuestions','次回確認したいこと']] as const).map(([key,label]) => <label className="field field-wide" key={key}><span>{label}</span><textarea rows={4} maxLength={5000} {...register(key)} />{errors[key] && <small className="field-error">{errors[key]?.message}</small>}</label>)}
      </fieldset>{error && <p role="alert" className="field-error">{error}</p>}
      <div className="form-actions"><button type="button" className="button button-outline" onClick={dismiss} disabled={isSubmitting}>閉じる</button><button className="button button-primary" disabled={isSubmitting}>{isSubmitting ? "保存中…" : "メモを保存"}</button></div>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function ApplicationRecords({ uid, application, workspace }: { uid: string; application: Application; workspace: Workspace }) {
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<Interview | null | undefined>();
  const pendingRef = useRef(false);
  useEffect(() => {
    const ref = doc(getClientDatabase(), "users", uid, "applications", application.id);
    let historyReady = false, interviewsReady = false;
    const fail = () => { setError("記録を読み込めませんでした。接続とログイン状態を確認してください。"); setLoading(false); };
    const stopHistory = onSnapshot(query(collection(ref, "statusHistory"), orderBy("createdAt", "desc"), limit(50)), snapshot => {
      setEvents(snapshot.docs.map(row => { const value = row.data({ serverTimestamps: "estimate" }); return { ...value, id: row.id, createdAt: value.createdAt?.toMillis() ?? 0 } as StatusEvent; }));
      historyReady = true; setLoading(!interviewsReady);
    }, fail);
    const stopInterviews = onSnapshot(collection(ref, "interviews"), snapshot => {
      setInterviews(snapshot.docs.map(row => { const value = row.data({ serverTimestamps: "estimate" }); return { ...value, id: row.id, createdAt: value.createdAt?.toMillis() ?? 0, updatedAt: value.updatedAt?.toMillis() ?? 0 } as Interview; }).sort((a,b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt));
      interviewsReady = true; setLoading(!historyReady);
    }, fail);
    return () => { stopHistory(); stopInterviews(); };
  }, [uid, application.id]);
  function checkOwner() { if (getClientAuth().currentUser?.uid !== uid || !navigator.onLine) throw new Error("接続とログイン状態を確認してください。"); }
  async function save(data: InterviewInput, previous: Interview | null) {
    checkOwner();
    const ref = previous ? doc(getClientDatabase(), "users", uid, "applications", application.id, "interviews", previous.id) : doc(collection(getClientDatabase(), "users", uid, "applications", application.id, "interviews"));
    try { await runTransaction(getClientDatabase(), async transaction => {
      if (previous) {
        const saved = await transaction.get(ref);
        if (!saved.exists() || saved.data().revision !== previous.revision) throw new Error("別の画面で更新されています。メモを控えてから開き直してください。");
        transaction.update(ref, { ...interviewSchema.parse(data), revision: previous.revision + 1, updatedAt: serverTimestamp() });
      } else transaction.set(ref, { ...interviewSchema.parse(data), revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }); } catch (cause) {
      if (cause instanceof Error && cause.message.startsWith("別の画面")) throw cause;
      throw new Error("面接メモを保存できませんでした。接続と入力内容を確認してください。");
    }
  }
  async function undo(event: StatusEvent) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setActionError("");
    try { checkOwner(); await workspace.undoApplicationStatus(application.id, event.id); }
    catch (cause) { setActionError((cause as Error).message); }
    finally { pendingRef.current = false; setPending(false); }
  }
  const latest = events.find(event => event.id === application.statusEventId);
  return <div className="application-records">
    {(error || actionError) && <p role="alert" className="field-error">{error || actionError}</p>}
    <section aria-labelledby="selection-history-title"><h3 id="selection-history-title">選考状況の変更履歴</h3><p className="form-note">状況をアプリで変更した日時です。導入前の変更は含まれません。新しい50件を表示します。</p>
      {loading ? <p role="status">記録を読み込んでいます…</p> : !events.length ? <p className="form-note">まだ変更履歴がありません。</p> : <ol className="status-history">{events.map(event => <li key={event.id}><time>{new Date(event.createdAt).toLocaleString("ja-JP")}</time><span>{event.fromStatus} → {event.toStatus}{event.kind === "undo" && "（取り消し）"}</span></li>)}</ol>}
      {latest?.kind === "change" && <button className="button button-outline" disabled={pending || !!error} onClick={() => void undo(latest)}>直前の変更を取り消す</button>}
    </section>
    <section aria-labelledby="interviews-title"><div className="career-heading"><h3 id="interviews-title">面接ごとのメモ</h3><button className="button button-outline" disabled={loading || !!error} onClick={event => { opener.current = event.currentTarget; setEditing(null); }}>面接メモを追加</button></div>
      {!loading && !interviews.length && <p className="form-note">面接のあとに、話した内容や次回の質問を残せます。</p>}
      <ul className="interview-list">{interviews.map(item => <li key={item.id}><h4>{item.title || "面接メモ"}</h4><p className="form-note">{item.date || "日付未入力"}{item.interviewer && ` / ${item.interviewer}`}</p>{item.notes && <p>{item.notes}</p>}{item.concerns && <p>気になった点：{item.concerns}</p>}{item.nextQuestions && <p>次回確認：{item.nextQuestions}</p>}<button className="button button-outline" onClick={event => { opener.current = event.currentTarget; setEditing(item); }}>メモを編集<span className="sr-only">：{item.title || "面接メモ"}</span></button></li>)}</ul>
    </section>
    {editing !== undefined && <InterviewEditor opener={opener.current} initial={editing} save={save} close={() => setEditing(undefined)} />}
  </div>;
}
