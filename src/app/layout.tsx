import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

export const metadata: Metadata = {
  title: "ツギドコ | 転職活動を、ひとまとめ。",
  description: "応募先も、選考状況も、ひとつの場所に。ツギドコは転職活動の進み具合を整理し、次の一歩を支える応募管理サービスです。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja" data-scroll-behavior="smooth"><body><AuthProvider>{children}</AuthProvider></body></html>;
}
