"use client";

import { useState } from "react";
import { isEnded, type Application } from "@/lib/applications";
import type { Workspace } from "./use-workspace";

const rows: { key: keyof Application; label: string }[] = [
  { key: "role", label: "職種" }, { key: "status", label: "選考状況" },
  { key: "salary", label: "年収・提示条件" }, { key: "location", label: "勤務地" },
  { key: "workStyle", label: "働き方" }, { key: "positives", label: "魅力に感じる点" },
  { key: "concerns", label: "気になる点" }, { key: "notes", label: "面接メモ・確認したいこと" },
];

export function ComparisonBoard({ workspace, edit }: { workspace: Workspace; edit: (app: Application, opener: HTMLElement) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [includeEnded, setIncludeEnded] = useState(false);
  const choices = workspace.applications.filter(app => (includeEnded || !isEnded(app.status))).sort((a, b) => a.company.localeCompare(b.company, "ja") || a.createdAt - b.createdAt);
  const chosen = choices.filter(app => selected.includes(app.id));
  return <section id="comparison" className="workspace-section" aria-labelledby="comparison-title">
    <div className="workspace-title"><div><h2 id="comparison-title">応募先を比較</h2><p>最大4件を選んで、条件と自分の気持ちを見比べられます。</p></div></div>
    <label className="check-label"><input type="checkbox" checked={includeEnded} onChange={event => { setIncludeEnded(event.target.checked); if (!event.target.checked) setSelected(selected.filter(id => workspace.applications.some(app => app.id === id && !isEnded(app.status)))); }} />終了した選考も選べるようにする</label>
    {workspace.loading ? <p role="status">応募先を読み込んでいます…</p> : <>
      {choices.length === 0 ? <p className="workspace-empty">比較する応募先はありません。応募先を登録すると選べます。</p> : <fieldset className="comparison-choices"><legend>比較する応募先（{chosen.length} / 4件）</legend>{choices.map(app => <label key={app.id}><input type="checkbox" checked={selected.includes(app.id)} disabled={!selected.includes(app.id) && chosen.length >= 4} onChange={event => setSelected(event.target.checked ? [...selected.filter(id => choices.some(choice => choice.id === id)), app.id] : selected.filter(id => id !== app.id))} /><span>{app.company}<small>{app.role || "職種未入力"}{app.status ? ` / ${app.status}` : ""}</small></span></label>)}</fieldset>}
      {chosen.length > 0 ? <>
        <p className="form-note">会社名の下の「条件・メモを編集」から記録できます。横にスクロールして比較できます。</p>
        <div className="comparison-scroll" tabIndex={0} role="region" aria-label="応募先の比較表"><table className="comparison-table"><caption className="sr-only">選んだ応募先の条件と判断メモ</caption><thead><tr><th scope="col">比較項目</th>{chosen.map(app => <th key={app.id} scope="col"><span>{app.company}</span><button onClick={event => edit(app, event.currentTarget)}>条件・メモを編集<span className="sr-only">（{app.company}）</span></button></th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.label}</th>{chosen.map(app => <td key={app.id}>{app[row.key] || <span className="unfilled">未入力</span>}</td>)}</tr>)}</tbody></table></div>
      </> : choices.length > 0 && <p className="workspace-empty">上の応募先にチェックを入れると、比較表が表示されます。</p>}
    </>}
  </section>;
}
