import { z } from "zod";

export const stages = ["検討中", "応募済み", "カジュアル面談", "書類選考", "一次面接", "二次面接", "最終面接"] as const;
const outcomes = ["内定", "入社決定", "辞退", "不採用", "募集終了"] as const;
export const applicationStatuses = [...stages, ...outcomes] as const;
export type ApplicationStatus = typeof applicationStatuses[number];
// The UI has one status. Keep existing storage fields so old records retain their history.
export function getApplicationStatus(stage: unknown, endReason: unknown): ApplicationStatus {
  return outcomes.find(value => value === endReason) ?? applicationStatuses.find(value => value === stage) ?? "検討中";
}
export function selectionForStorage(status: ApplicationStatus, previousStage = "検討中") {
  return stages.some(stage => stage === status)
    ? { stage: status, endReason: "" }
    : { stage: previousStage, endReason: status };
}
// Keep the stored endReason field for compatibility; only these states are ended.
export function isEnded(status: unknown) {
  return status === "辞退" || status === "不採用" || status === "募集終了";
}
export function isHighlighted(status: unknown) {
  return status === "内定" || status === "入社決定";
}
const shortText = z.string().trim().max(120, "120文字以内で入力してください");
const memo = z.string().trim().max(5000, "5,000文字以内で入力してください");
export const applicationSchema = z.object({
  company: z.string().trim().min(1, "会社名を入力してください").max(120, "120文字以内で入力してください"),
  role: shortText, source: shortText,
  url: z.string().trim().max(2000).refine(value => !value || /^https?:\/\/\S+$/.test(value), "http または https のURLを入力してください"),
  status: z.enum(applicationStatuses),
  salary: shortText, location: shortText, workStyle: shortText,
  positives: memo, concerns: memo, notes: memo,
});
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type Application = ApplicationInput & { id: string; createdAt: number; updatedAt: number; statusEventId?: string };
export const emptyApplication: ApplicationInput = { company: "", role: "", source: "", url: "", status: "検討中", salary: "", location: "", workStyle: "", positives: "", concerns: "", notes: "" };

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return year >= 2000 && year <= 2100 && localDate(date) === value;
}
export const taskSchema = z.object({
  applicationId: z.string().min(1, "応募先を選んでください").max(128),
  title: z.string().trim().min(1, "やることを入力してください").max(200, "200文字以内で入力してください"),
  dueDate: z.string().refine(value => value === "" || validDate(value), "2000年から2100年の有効な日付を入力してください"),
});
export type TaskInput = z.infer<typeof taskSchema>;
export type Task = TaskInput & { id: string; done: boolean; createdAt: number; updatedAt: number };
export const taskGroups = ["期限を過ぎたもの", "今日", "今週", "来週以降", "期限未定"] as const;
export function taskGroup(dueDate: string, today = new Date()): typeof taskGroups[number] {
  if (!dueDate) return "期限未定";
  const date = localDate(today);
  if (dueDate < date) return "期限を過ぎたもの";
  if (dueDate === date) return "今日";
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (7 - today.getDay()) % 7);
  return dueDate <= localDate(sunday) ? "今週" : "来週以降";
}
