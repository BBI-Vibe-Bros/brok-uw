import { redirect } from "next/navigation";

/** @deprecated Freshness is on /admin#carriers */
export default function AdminStalenessRedirectPage() {
  redirect("/admin#carriers");
}
