import { z } from "zod";
import { applicationStatuses, validDate } from "./applications";
const memo = z.string().trim().max(5000, "5,000文字以内で入力してください");
export const interviewSchema = z.object({
  title: z.string().trim().max(120, "120文字以内で入力してください"),
  date: z.string().refine(value => !value || validDate(value), "有効な日付を入力してください"),
  interviewer: z.string().trim().max(120, "120文字以内で入力してください"),
  notes: memo, concerns: memo, nextQuestions: memo,
}).refine(value => [value.title, value.notes, value.concerns, value.nextQuestions].some(Boolean), { message: "面接名かメモを入力してください", path: ["notes"] });
export type InterviewInput = z.infer<typeof interviewSchema>;
export type Interview = InterviewInput & { id: string; revision: number; createdAt: number; updatedAt: number };
export const emptyInterview: InterviewInput = { title: "", date: "", interviewer: "", notes: "", concerns: "", nextQuestions: "" };
export type StatusEvent = { id: string; fromStatus: typeof applicationStatuses[number]; toStatus: typeof applicationStatuses[number]; kind: "change" | "undo"; beforeStage: string; beforeEndReason: string; revertsId: string; createdAt: number };
