import { z } from "zod";
import { validDate } from "./applications";

const short = z.string().trim().max(120, "120文字以内で入力してください");
const memo = z.string().trim().max(5000, "5,000文字以内で入力してください");
const month = z.string().refine(value => !value || /^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value), "有効な年月を入力してください");
export const careerSchema = z.object({
  company: short, startMonth: month, endMonth: month, current: z.boolean(), role: short, duties: memo, achievements: memo,
}).refine(value => !value.current || !value.endMonth, { message: "在職中の場合、退職年月は空欄にしてください", path: ["endMonth"] })
  .refine(value => !value.startMonth || !value.endMonth || value.startMonth <= value.endMonth, { message: "入社以降の年月を入力してください", path: ["endMonth"] });
export const resumeSchema = z.object({
  title: short.min(1, "書類名を入力してください"), fullName: short,
  documentDate: z.string().refine(value => !value || validDate(value), "有効な日付を入力してください"),
  summary: memo, skills: memo, selfPr: memo,
  applicationId: z.string().max(128).regex(/^[^/]*$/),
  careers: z.array(careerSchema).max(10, "職歴は10社まで登録できます"),
});
export type ResumeInput = z.infer<typeof resumeSchema>;
export type Resume = ResumeInput & { id: string; revision: number; submitted: boolean; createdAt: number; updatedAt: number };
export const emptyCareer: ResumeInput["careers"][number] = { company: "", startMonth: "", endMonth: "", current: false, role: "", duties: "", achievements: "" };
export const emptyResume: ResumeInput = { title: "職務経歴書", fullName: "", documentDate: "", summary: "", skills: "", selfPr: "", applicationId: "", careers: [] };
