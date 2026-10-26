"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { getClientAuth, getClientDatabase } from "@/lib/firebase/client";
import { resumeSchema, type Resume, type ResumeInput } from "@/lib/resumes";

export function useResumes(uid: string) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    setLoading(true); setError(""); setResumes([]);
    return onSnapshot(collection(getClientDatabase(), "users", uid, "resumes"), snapshot => {
      setResumes(snapshot.docs.map(row => {
        const data = row.data({ serverTimestamps: "estimate" });
        return { ...data, id: row.id, createdAt: data.createdAt?.toMillis() ?? 0, updatedAt: data.updatedAt?.toMillis() ?? 0 } as Resume;
      }).sort((a, b) => b.updatedAt - a.updatedAt));
      setLoading(false);
    }, () => { setResumes([]); setLoading(false); setError("職務経歴書を読み込めませんでした。接続とログイン状態を確認してください。"); });
  }, [uid]);
  async function save(input: ResumeInput, previous?: Resume, submitted = false) {
    const fields = resumeSchema.parse(input);
    if (getClientAuth().currentUser?.uid !== uid || !navigator.onLine) throw new Error("接続とログイン状態を確認してください。");
    if (submitted && !fields.applicationId) throw new Error("提出先の応募先を選んでください。");
    const user = getClientAuth().currentUser;
    if (!user || user.uid !== uid) throw new Error("ログイン状態を確認してください。");
    const token = await user.getIdToken();
    const response = await fetch("/api/resumes", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ value: fields, submitted, ...(previous ? { id: previous.id, revision: previous.revision } : {}) }),
    }).catch(() => { throw new Error("保存できませんでした。接続を確認してください。"); });
    const result = await response.json().catch(() => null);
    if (!response.ok || typeof result?.id !== "string") throw new Error(result?.error || "保存できませんでした。接続と入力内容を確認してください。");
    return result.id as string;
  }
  return { resumes, loading, error, save };
}
