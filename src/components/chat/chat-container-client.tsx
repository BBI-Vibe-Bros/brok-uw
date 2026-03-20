"use client";

import dynamic from "next/dynamic";

/** Avoid ScrollArea / Base UI hydration mismatches by not SSR-ing the chat panel. */
const ChatContainer = dynamic(() => import("./chat-container").then((m) => m.ChatContainer), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 flex-col min-h-0 items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
      <div className="h-8 w-8 animate-pulse rounded-full bg-muted" aria-hidden />
      Loading chat…
    </div>
  ),
});

export function ChatContainerClient(props: { embed?: boolean }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ChatContainer {...props} />
    </div>
  );
}
