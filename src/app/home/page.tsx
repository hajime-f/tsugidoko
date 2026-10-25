import type { Metadata } from "next";
import { MemberHome } from "@/components/home/member-home";

export const metadata: Metadata = { title: "ホーム | ツギドコ" };
export default function Page() { return <MemberHome />; }
