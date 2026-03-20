import { redirect } from "next/navigation";

/** @deprecated Review lives on /admin */
export default function AdminRulesRedirectPage() {
  redirect("/admin");
}
