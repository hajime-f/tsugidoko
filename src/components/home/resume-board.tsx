"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { localDate, type Application } from "@/lib/applications";
import { emptyCareer, emptyResume, resumeSchema, type Resume, type ResumeInput } from "@/lib/resumes";
import { useResumes } from "./use-resumes";

function ResumePreview({ value }: { value: ResumeInput }) {
  return <article className="resume-paper" aria-label="職務経歴書のプレビュー">
    <h2>職務経歴書</h2>{value.documentDate && <p className="resume-date">{value.documentDate} 現在</p>}<p className="resume-name">{value.fullName || "氏名未入力"}</p>
    {value.summary && <section><h3>職務要約</h3><p>{value.summary}</p></section>}
    {!!value.careers.length && <section><h3>職務経歴</h3>{value.careers.map((career, index) => <section className="resume-career" key={index}>
      <h4>{career.company || "会社名未入力"}</h4><p className="resume-period">{career.startMonth || "入社年月未入力"} 〜 {career.current ? "現在" : career.endMonth || "退職年月未入力"}{career.role && ` / ${career.role}`}</p>
      {career.duties && <><h5>担当業務</h5><p>{career.duties}</p></>}{career.achievements && <><h5>実績・取り組み</h5><p>{career.achievements}</p></>}
    </section>)}</section>}
    {value.skills && <section><h3>活かせる経験・スキル</h3><p>{value.skills}</p></section>}
    {value.selfPr && <section><h3>自己PR</h3><p>{value.selfPr}</p></section>}
  </article>;
}

function ResumeEditor({ resume, initial, applications, save, close, opener }: {
  resume: Resume | null; initial: ResumeInput; applications: Application[];
  save: ReturnType<typeof useResumes>["save"]; close: () => void; opener: HTMLElement | null;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const submitted = !!resume?.submitted;
  const { register, control, setValue, handleSubmit, formState: { errors, isDirty } } = useForm<ResumeInput>({ resolver: zodResolver(resumeSchema), defaultValues: initial });
  const { fields, append, remove, move } = useFieldArray({ control, name: "careers" });
  const value = useWatch({ control }) as ResumeInput;
  function dismiss() { if (!busy && (!isDirty || submitted || window.confirm("保存していない内容があります。閉じてもよいですか？"))) close(); }
  async function store(data: ResumeInput, mode: "save" | "copy" | "submitted") {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      await save(mode === "copy" ? { ...data, title: `${data.title.slice(0, 116)}の複製` } : data, mode === "save" && resume ? resume : undefined, mode === "submitted");
      close();
    } catch (cause) { setError((cause as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const restorePrintTitle = useRef<(() => void) | null>(null);
  useEffect(() => () => { restorePrintTitle.current?.(); }, []);
  function print() {
    restorePrintTitle.current?.();
    const oldTitle = document.title;
    document.title = value.title || "職務経歴書";
    const restore = () => { document.title = oldTitle; window.removeEventListener("afterprint", restore); restorePrintTitle.current = null; };
    restorePrintTitle.current = restore;
    window.addEventListener("afterprint", restore, { once: true });
    try { window.print(); } catch { restore(); setError("印刷画面を開けませんでした。ブラウザの印刷機能をお試しください。"); }
  }
  const textField = (name: "title" | "fullName" | "summary" | "skills" | "selfPr", label: string, example?: string) => <label className="field">
    <span>{label}</span>{example ? <textarea rows={5} maxLength={5000} placeholder={example} {...register(name)} aria-invalid={!!errors[name]} /> : <input maxLength={120} {...register(name)} aria-invalid={!!errors[name]} />}
    {errors[name] && <small className="field-error">{errors[name]?.message}</small>}
  </label>;
  return <Dialog.Root open onOpenChange={open => { if (!open) dismiss(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content resume-dialog" onCloseAutoFocus={event => { if (opener?.isConnected) { event.preventDefault(); opener.focus(); } }}>
    <button type="button" className="dialog-close" aria-label="閉じる" onClick={dismiss} disabled={busy}><X size={20} /></button>
    <Dialog.Title>{submitted ? "提出した職務経歴書" : "職務経歴書を作成"}</Dialog.Title>
    <Dialog.Description>{submitted ? "提出した版は編集されません。修正するときは複製してください。" : "途中でも保存できます。入力した内容はプレビューに反映されます。"}</Dialog.Description>
    <form onSubmit={handleSubmit(data => store(data, "save"))}>
      <div className={`resume-editor-layout${submitted ? " resume-readonly" : ""}`}>
        {!submitted && <fieldset className="resume-fields" disabled={busy}>
          {textField("title", "書類名（必須）")}{textField("fullName", "氏名")}
          <label className="field"><span>作成日</span><input type="date" {...register("documentDate")} />{errors.documentDate && <small className="field-error">{errors.documentDate.message}</small>}</label>
          <label className="field"><span>応募先（任意）</span><select {...register("applicationId")}><option value="">共通の職務経歴書</option>{applications.map(app => <option key={app.id} value={app.id}>{app.company}{app.role ? ` / ${app.role}` : ""}</option>)}</select></label>
          {textField("summary", "職務要約", "例：法人営業として5年間勤務。既存顧客への提案と、新規顧客の開拓を担当。")}
          <div className="career-heading"><h3>職務経歴</h3><button type="button" className="button button-outline" disabled={fields.length >= 10} onClick={() => append({ ...emptyCareer })}>職歴を追加</button></div>
          <p className="form-note">最大10社。印刷する順番に並べてください。</p>
          {fields.map((field, index) => <fieldset className="career-fields" key={field.id}>
            <legend>職歴 {index + 1}</legend>
            <label className="field"><span>会社名</span><input maxLength={120} {...register(`careers.${index}.company`)} /></label>
            <div className="career-months"><label className="field"><span>入社年月</span><input type="month" min="1900-01" max="2100-12" {...register(`careers.${index}.startMonth`)} /></label><label className="field"><span>退職年月</span><input type="month" min="1900-01" max="2100-12" {...register(`careers.${index}.endMonth`)} disabled={value.careers[index]?.current} /></label></div>
            <label className="check-label"><input type="checkbox" {...register(`careers.${index}.current`, { onChange: event => { if (event.target.checked) setValue(`careers.${index}.endMonth`, "", { shouldDirty: true }); } })} />在職中</label>
            <label className="field"><span>職種・役職</span><input maxLength={120} {...register(`careers.${index}.role`)} /></label>
            <label className="field"><span>担当業務</span><textarea rows={4} maxLength={5000} placeholder="例：担当顧客、チーム内の役割、業務の範囲" {...register(`careers.${index}.duties`)} /></label>
            <label className="field"><span>実績・取り組み</span><textarea rows={4} maxLength={5000} placeholder="例：課題に対して工夫したことと、その結果" {...register(`careers.${index}.achievements`)} /></label>
            {errors.careers?.[index] && <p className="field-error" role="alert">職歴 {index + 1}：{Object.values(errors.careers[index]!).map(item => typeof item === "object" && item && "message" in item ? item.message : "").join(" ")}</p>}
            <div className="record-actions"><button type="button" disabled={index === 0} onClick={() => move(index, index - 1)}>上へ</button><button type="button" disabled={index === fields.length - 1} onClick={() => move(index, index + 1)}>下へ</button><button type="button" onClick={() => { if (window.confirm("この職歴を入力欄から削除しますか？")) remove(index); }}>この職歴を削除</button></div>
          </fieldset>)}
          {textField("skills", "活かせる経験・スキル", "例：業務改善、プロジェクト管理、使用ツールや資格")}
          {textField("selfPr", "自己PR", "例：自分の強みと、その強みを発揮した具体的なエピソード")}
        </fieldset>}
        <div className="resume-preview"><ResumePreview value={value} /></div>
      </div>
      <p className="form-note">「印刷・PDF保存」から印刷画面を開き、送信先で「PDFとして保存」を選べます。「ヘッダーとフッター」をオフにすると、URLなどを印字せずに保存できます。プレビュー中の内容を出力します。印刷は下書きの保存を兼ねません。</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="form-actions resume-actions">
        <button type="button" className="button button-outline" onClick={print} disabled={busy}>印刷・PDF保存</button>
        <button type="button" className="button button-outline" onClick={handleSubmit(data => store(data, "copy"))} disabled={busy}>複製して保存</button>
        {!submitted && <><button type="button" className="button button-outline" disabled={busy || !value.applicationId} onClick={handleSubmit(data => store(data, "submitted"))}>提出した版を記録</button><button className="button button-primary" disabled={busy}>{busy ? "保存中…" : "下書きを保存"}</button></>}
      </div>
    </form>
  </Dialog.Content></Dialog.Portal>{typeof document !== "undefined" && createPortal(<div className="resume-print-root"><ResumePreview value={value} /></div>, document.body)}</Dialog.Root>;
}

export function ResumeBoard({ uid, applications }: { uid: string; applications: Application[] }) {
  const state = useResumes(uid);
  const [editing, setEditing] = useState<Resume | null | undefined>(undefined);
  const opener = useRef<HTMLElement | null>(null);
  function edit(value: Resume | null, element: HTMLElement) { opener.current = element; setEditing(value); }
  return <section id="resumes" className="workspace-section" aria-labelledby="resumes-title">
    <div className="workspace-title"><div><h2 id="resumes-title">職務経歴書</h2><p>経歴や強みを整理し、応募先に合わせた書類を作りましょう。</p></div><button className="button button-primary" disabled={state.loading || !!state.error} onClick={event => edit(null, event.currentTarget)}>職務経歴書を作成</button></div>
    {state.error && <p role="alert" className="field-error">{state.error}</p>}
    {state.loading ? <p role="status">職務経歴書を読み込んでいます…</p> : <ul className="resume-list">{state.resumes.map(resume => <li key={resume.id}><div><h3>{resume.title}</h3><p>{resume.submitted ? "提出した版" : "下書き"} / {applications.find(app => app.id === resume.applicationId)?.company || "共通"} / {new Date(resume.updatedAt).toLocaleDateString("ja-JP")}</p></div><button className="button button-outline" onClick={event => edit(resume, event.currentTarget)}>{resume.submitted ? "確認・複製" : "編集"}<span className="sr-only">：{resume.title}</span></button></li>)}</ul>}
    {!state.loading && !state.error && !state.resumes.length && <p className="workspace-empty">まだ職務経歴書がありません。書けるところから始められます。</p>}
    {editing !== undefined && <ResumeEditor resume={editing} initial={editing ?? { ...emptyResume, documentDate: localDate(), careers: [] }} applications={applications} save={state.save} close={() => setEditing(undefined)} opener={opener.current} />}
  </section>;
}
