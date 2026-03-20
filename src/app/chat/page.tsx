import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChatContainerClient } from "@/components/chat/chat-container-client";
import { PaywallGate } from "@/components/paywall/paywall-gate";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, Settings } from "lucide-react";
import Link from "next/link";

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ embed?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const embed = sp.embed === "true";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, npn, is_brock_agent, subscription_tier, role")
    .eq("id", user.id)
    .single();

  if (profile && !profile.is_brock_agent && profile.subscription_tier === "lead") {
    return <PaywallGate agentName={profile.full_name} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!embed && (
        <header className="flex shrink-0 items-center justify-between border-b bg-white px-4 py-2">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-sm">BrokUW</span>
          </div>
          <div className="flex items-center gap-3">
            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <Settings className="h-3.5 w-3.5" />
                Admin
              </Link>
            )}
            <span className="text-xs text-muted-foreground">
              {profile?.full_name || user.email}
              {profile?.npn && ` · NPN ${profile.npn}`}
            </span>
            <form action="/api/auth/signout" method="POST">
              <Button variant="ghost" size="sm" type="submit">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </header>
      )}
      <ChatContainerClient embed={embed} />
    </div>
  );
}
