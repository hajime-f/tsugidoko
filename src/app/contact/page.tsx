import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { ContactForm } from "@/components/legal/contact-form";
export const metadata = { title: "お問い合わせ | ツギドコ" };
export default function ContactPage() {
  return <LegalPage title="お問い合わせ"><p>サービスのご質問、個人情報の開示・訂正・利用停止・削除のご相談、運営者情報の請求を受け付けます。ログインせずに利用できます。</p><p>入力された情報は、問い合わせへの対応と必要な本人確認に利用します。詳しくは<Link href="/privacy">プライバシーポリシー</Link>をご覧ください。</p><p>運営者が管理画面で確認して対応します。常時監視や即時の返信は行っていません。返答まで時間がかかる場合があります。受付番号を控え、必要に応じて再度お問い合わせください。受付上限や通信障害で送信できない場合は、時間をおいて再送してください。</p><ContactForm /></LegalPage>;
}
