import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChatContainerClient } from "@/components/chat/chat-container-client";
import { ChatPageHeader } from "@/components/chat/chat-page-header";
import { PaywallGate } from "@/components/paywall/paywall-gate";

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
        <ChatPageHeader
          profile={profile}
          userEmail={user.email ?? ""}
        />
      )}
      <ChatContainerClient embed={embed} />
    </div>
  );
}
