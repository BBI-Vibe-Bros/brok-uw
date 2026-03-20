"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";

const assistantComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-gray-950">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed [&>p]:mb-0">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} className="font-medium text-blue-700 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  h1: ({ children }) => <p className="mb-2 text-base font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mb-2 text-sm font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mb-1 text-sm font-semibold">{children}</p>,
  code: ({ children, className }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return (
        <code className="my-2 block overflow-x-auto rounded-md bg-slate-800/90 px-2 py-1.5 text-xs text-slate-100">{children}</code>
      );
    }
    return <code className="rounded bg-slate-200/80 px-1 py-0.5 text-[0.85em]">{children}</code>;
  },
  pre: ({ children }) => <pre className="my-2 overflow-x-auto whitespace-pre-wrap text-xs">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-slate-300 pl-3 text-slate-700">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-slate-200" />,
};

/** Renders assistant chat copy as Markdown (**bold**, lists, links). No raw HTML (safe default). */
export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm [&_a]:break-all">
      <ReactMarkdown remarkPlugins={[remarkBreaks]} components={assistantComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
