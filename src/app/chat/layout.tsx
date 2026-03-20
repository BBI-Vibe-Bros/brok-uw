import { Metadata } from "next";
import { RegisterSW } from "@/components/pwa/register-sw";

export const metadata: Metadata = {
  title: "BrokUW – Medicare Supplement Underwriting Guide",
  description: "AI-powered Medicare Supplement underwriting guidance for agents",
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-white">
      <RegisterSW />
      <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-800">
        This tool provides informational guidance only. Always confirm underwriting decisions directly with the carrier before submitting an application.
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
