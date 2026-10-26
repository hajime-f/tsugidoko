"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp, updateDoc, type Timestamp } from "firebase/firestore";
import { getClientAuth, getClientDatabase } from "@/lib/firebase/client";
import { applicationSchema, getApplicationStatus, selectionForStorage, taskSchema, type Application, type ApplicationInput, type Task, type TaskInput } from "@/lib/applications";

function message(error: unknown, writing = false) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (writing && code.includes("permission-denied")) return "保存できませんでした。入力内容とログイン状態を確認してください。";
  if (code.includes("permission-denied")) return "アクセスできません。ログイン状態を確認して、再読み込みしてください。";
  return "通信できませんでした。接続を確認して、もう一度お試しください。";
}
function millis(value: Timestamp | null) { return value?.toMillis() ?? 0; }

export function useWorkspace(uid: string) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    let appsReady = false;
    let tasksReady = false;
    const db = getClientDatabase();
    const fail = (cause: unknown) => {
      if (!active) return;
      setApplications([]); setTasks([]); setError(message(cause)); setLoading(false);
    };
    const stopApps = onSnapshot(collection(db, "users", uid, "applications"), snapshot => {
      if (!active) return;
      setApplications(snapshot.docs.map(row => { const data = row.data({ serverTimestamps: "estimate" }); return { ...data, status: getApplicationStatus(data.stage, data.endReason), id: row.id, createdAt: millis(data.createdAt), updatedAt: millis(data.updatedAt) } as Application; }));
      appsReady = true; setLoading(!tasksReady);
    }, fail);
    const stopTasks = onSnapshot(collection(db, "users", uid, "tasks"), snapshot => {
      if (!active) return;
      setTasks(snapshot.docs.map(row => { const data = row.data({ serverTimestamps: "estimate" }); return { ...data, id: row.id, createdAt: millis(data.createdAt), updatedAt: millis(data.updatedAt) } as Task; }));
      tasksReady = true; setLoading(!appsReady);
    }, fail);
    const connectivity = () => setOffline(!navigator.onLine);
    connectivity(); window.addEventListener("online", connectivity); window.addEventListener("offline", connectivity);
    return () => { active = false; stopApps(); stopTasks(); window.removeEventListener("online", connectivity); window.removeEventListener("offline", connectivity); };
  }, [uid]);

  async function write(action: () => Promise<unknown>) {
    if (getClientAuth().currentUser?.uid !== uid) throw new Error("ログイン状態が変わりました。再読み込みしてください。");
    if (!navigator.onLine) throw new Error("オフラインです。接続が戻ってから保存してください。");
    try { await action(); } catch (cause) {
      if (cause instanceof Error && cause.message.startsWith("別の変更")) throw cause;
      throw new Error(message(cause, true));
    }
  }
  const reference = (kind: "applications" | "tasks", id: string) => doc(getClientDatabase(), "users", uid, kind, id);
  return {
    applications, tasks, loading, error, offline,
    addApplication: (value: ApplicationInput) => write(() => {
      const { status, ...fields } = applicationSchema.parse(value);
      return addDoc(collection(getClientDatabase(), "users", uid, "applications"), { ...fields, ...selectionForStorage(status), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }),
    updateApplication: (id: string, changes: Partial<ApplicationInput>) => write(async () => {
      const { status, ...fields } = applicationSchema.partial().parse(changes);
      const ref = reference("applications", id);
      await runTransaction(getClientDatabase(), async transaction => {
        const saved = await transaction.get(ref);
        if (!saved.exists()) throw new Error("Application not found");
        const current = saved.data();
        const selection = status === undefined ? {} : selectionForStorage(status, current.stage);
        const fromStatus = getApplicationStatus(current.stage, current.endReason);
        const event = status !== undefined && status !== fromStatus ? doc(collection(ref, "statusHistory")) : null;
        if (event) transaction.set(event, { fromStatus, toStatus: status, beforeStage: current.stage, beforeEndReason: current.endReason, kind: "change", revertsId: "", createdAt: serverTimestamp() });
        transaction.update(ref, { ...fields, ...selection, ...(event ? { statusEventId: event.id } : {}), updatedAt: serverTimestamp() });
      });
    }),
    undoApplicationStatus: (id: string, eventId: string) => write(async () => {
      const ref = reference("applications", id);
      await runTransaction(getClientDatabase(), async transaction => {
        const current = await transaction.get(ref);
        const event = await transaction.get(doc(ref, "statusHistory", eventId));
        if (!current.exists() || !event.exists()) throw new Error("変更が見つかりません。");
        const data = current.data(); const previous = event.data();
        if (data.statusEventId !== eventId || previous.kind !== "change" || getApplicationStatus(data.stage, data.endReason) !== previous.toStatus) throw new Error("別の変更があるため取り消せません。最新の履歴を確認してください。");
        const undo = doc(collection(ref, "statusHistory"));
        transaction.set(undo, { fromStatus: previous.toStatus, toStatus: previous.fromStatus, beforeStage: data.stage, beforeEndReason: data.endReason, kind: "undo", revertsId: eventId, createdAt: serverTimestamp() });
        transaction.update(ref, { stage: previous.beforeStage, endReason: previous.beforeEndReason, statusEventId: undo.id, updatedAt: serverTimestamp() });
      });
    }),
    addTask: (value: TaskInput) => write(() => addDoc(collection(getClientDatabase(), "users", uid, "tasks"), { ...taskSchema.parse(value), done: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })),
    updateTask: (id: string, value: TaskInput) => write(() => updateDoc(reference("tasks", id), { ...taskSchema.parse(value), updatedAt: serverTimestamp() })),
    toggleTask: (id: string, done: boolean) => write(() => updateDoc(reference("tasks", id), { done, updatedAt: serverTimestamp() })),
    deleteTask: (id: string) => write(() => deleteDoc(reference("tasks", id))),
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
