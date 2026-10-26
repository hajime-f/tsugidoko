"use client";

import { useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getClientAuth, getClientDatabase } from "@/lib/firebase/client";
import { downloadCsv } from "@/lib/csv";
import { localDate } from "@/lib/applications";
import type { Workspace } from "./use-workspace";

export function CsvExport({ uid, workspace }: { uid: string; workspace: Workspace }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  function checkOwner() { if (getClientAuth().currentUser?.uid !== uid) throw new Error("ログイン状態が変わりました。再読み込みしてください。"); }
  function applications() {
    setError("");
    try {
      checkOwner();
      downloadCsv(`tsugidoko-応募先-${localDate()}.csv`, [["会社名","職種","応募経路","求人URL","選考状況","年収・条件","勤務地","働き方","魅力","気になる点","会社単位のメモ","登録日時","更新日時"], ...workspace.applications.map(app => [app.company,app.role,app.source,app.url,app.status,app.salary,app.location,app.workStyle,app.positives,app.concerns,app.notes,new Date(app.createdAt).toISOString(),new Date(app.updatedAt).toISOString()])]);
    } catch (cause) { setError((cause as Error).message); }
  }
  async function interviews() {
    if (active.current) return;
    active.current = true; setPending(true); setError("");
    try {
      checkOwner();
      const rows: unknown[][] = [["会社名","職種","面接名","面接日","担当者","聞かれたこと・話したこと","気になった点","次回確認したいこと"]];
      for (const app of workspace.applications) {
        checkOwner();
        const snapshot = await getDocs(collection(getClientDatabase(), "users", uid, "applications", app.id, "interviews"));
        for (const row of snapshot.docs) { const item = row.data(); rows.push([app.company,app.role,item.title,item.date,item.interviewer,item.notes,item.concerns,item.nextQuestions]); }
      }
      checkOwner(); downloadCsv(`tsugidoko-面接メモ-${localDate()}.csv`, rows);
    } catch { setError("CSVを出力できませんでした。接続とログイン状態を確認してください。"); }
    finally { active.current = false; setPending(false); }
  }
  const disabled = workspace.loading || !!workspace.error || pending || workspace.offline;
  return <div className="csv-export"><p>終了した応募先を含む全件を出力します。表計算ソフトの数式として実行されないよう、一部の値には先頭に「'」を付けます。</p><div className="record-actions"><button className="button button-outline" disabled={disabled} onClick={applications}>応募先CSVを出力</button><button className="button button-outline" disabled={disabled} onClick={() => void interviews()}>{pending ? "出力中…" : "面接メモCSVを出力"}</button></div>{error && <p role="alert" className="field-error">{error}</p>}</div>;
}
