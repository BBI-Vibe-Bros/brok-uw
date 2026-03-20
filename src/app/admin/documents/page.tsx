import { redirect } from "next/navigation";

/** @deprecated Use /admin (Pipeline) */
export default function AdminDocumentsRedirectPage() {
  redirect("/admin");
}
