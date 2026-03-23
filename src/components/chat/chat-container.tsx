"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatInput } from "./chat-input";
import { MessageBubble, type ChatMessage } from "./message-bubble";
import { GuidedIntake, type GuidedAnswers } from "./guided-intake";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ClipboardList, MessageSquare, HelpCircle } from "lucide-react";

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hey — I'm your underwriting sidekick. Ask me anything about Med Supp underwriting, or drop a client scenario and I'll run it across carriers for you.\n\nYou can be as casual as you want — \"got a 68yo diabetic in Ohio\" works just as well as a full write-up.",
};

export function ChatContainer({ embed = false }: { embed?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [guidedActive, setGuidedActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll the viewport to the latest content (messages, typing indicator, guided intake).
    // requestAnimationFrame lets layout settle so ScrollArea measures the new bottom.
    const id = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    });
    return () => cancelAnimationFrame(id);
  }, [messages, isLoading, guidedActive]);

  const handleSend = useCallback(async (content: string) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversation_id: conversationIdRef.current ?? conversationId,
          conversation_history: messages
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Request failed");
      }

      if (data.conversation_id) {
        conversationIdRef.current = data.conversation_id;
        setConversationId(data.conversation_id);
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.message || "I couldn't process that request. Please try again.",
        results: data.results || null,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      if (embed && typeof window !== "undefined" && data.results?.length) {
        window.parent?.postMessage({ type: "brok-uw-results", count: data.results.length }, "*");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sorry, something went wrong. Please try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: msg,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, messages, embed]);

  function handleStartGuided() {
    setGuidedActive(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-guided-${Date.now()}`,
        role: "assistant",
        content: "Let's walk through it — answer what you can, skip what you don't know.",
      },
    ]);
  }

  function handleGuidedComplete(scenario: string, _answers: GuidedAnswers) {
    setGuidedActive(false);
    handleSend(scenario);
  }

  function handleGuidedCancel() {
    setGuidedActive(false);
  }

  const showQuickActions = messages.length <= 1;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1 max-md:[&_[data-slot=scroll-area-scrollbar]]:hidden max-md:[&_[data-slot=scroll-area-corner]]:hidden">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {showQuickActions && (
            <div className="ml-0 flex min-w-0 max-w-full flex-wrap gap-2 sm:ml-11">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => handleSend("What can you help me with?")}
              >
                <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
                What can you do?
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleStartGuided}
              >
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                Walk me through it
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => handleSend("Which carriers do you cover?")}
              >
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                Who do you cover?
              </Button>
            </div>
          )}

          {guidedActive && !isLoading && (
            <div className="ml-0 min-w-0 max-w-full sm:ml-11">
              <GuidedIntake
                onComplete={handleGuidedComplete}
                onCancel={handleGuidedCancel}
              />
            </div>
          )}

          {isLoading && (
            <div className="flex gap-3 max-w-3xl mr-auto">
              <div className="shrink-0 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                <div className="h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
        </div>
      </ScrollArea>

      <ChatInput
        onSend={handleSend}
        disabled={isLoading}
        autoFocus={!embed}
        placeholder="What's going on with your client?"
      />
    </div>
  );
}
