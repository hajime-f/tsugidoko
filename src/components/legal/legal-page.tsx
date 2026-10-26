import Link from "next/link";
import type { ReactNode } from "react";

export function LegalLinks() {
  return <nav className="legal-links" aria-label="規約とデータの取り扱い"><Link href="/terms">利用規約</Link><Link href="/privacy">プライバシーポリシー</Link><Link href="/data-deletion">データの削除</Link><Link href="/contact">お問い合わせ</Link></nav>;
}
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return <div className="legal-shell"><header className="legal-header"><Link href="/" className="brand">ツギドコ<span className="brand-dot">.</span></Link><Link href="/home">ホームへ</Link></header><main className="legal-main"><h1>{title}</h1>{children}</main><footer className="legal-footer"><LegalLinks /><p>ツギドコ</p></footer></div>;
}
