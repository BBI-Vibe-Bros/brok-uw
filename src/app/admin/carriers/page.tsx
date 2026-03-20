import { redirect } from "next/navigation";

/** Carriers live on the main admin flow — /admin#carriers */
export default function AdminCarriersRedirectPage() {
  redirect("/admin#carriers");
}
