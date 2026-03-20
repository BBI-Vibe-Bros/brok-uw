import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Shield, MessageSquare } from "lucide-react";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/chat");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-sm">BrokUW Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </Link>
            <span className="text-xs text-muted-foreground">{profile.full_name ?? user.email}</span>
          </div>
        </div>
      </header>
      <main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
    </div>
  );
}
