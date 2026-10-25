import { redirect } from "next/navigation";

// Preserve old bookmarks without showing a second introduction page.
export default function Page() { redirect("/"); }
