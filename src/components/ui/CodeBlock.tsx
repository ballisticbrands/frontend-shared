import { CopyButton } from "./CopyButton";

// A copy-paste payload. Used for every MCP client snippet.
//
// The copy button sits INSIDE the block rather than beside the heading:
// on "Connect your AI" the snippet is the thing being acted on, and a
// button that travels with it survives the page being scrolled to the
// step the reader is on.
//
// `wrap` exists for URLs. A connector URL is one very long unbreakable
// token; letting it scroll horizontally hides most of it, and people
// then select a partial URL by dragging. Wrapping shows the whole thing.

export function CodeBlock({
  code,
  language,
  wrap = false,
  className = "",
}: {
  code: string;
  /** Shown as a label in the corner. Purely informational — this does
   *  no syntax highlighting (a highlighter is a large dependency for a
   *  handful of five-line snippets). */
  language?: string;
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--code-bg,#0b0f17)] ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">
          {language ?? ""}
        </span>
        <CopyButton
          value={code}
          className="border-white/15 bg-white/10 text-white hover:bg-white/20"
        />
      </div>
      <pre
        className={`overflow-x-auto px-3 py-3 text-[12.5px] leading-relaxed text-[var(--code-fg,#e6edf3)] ${
          wrap ? "whitespace-pre-wrap break-all" : ""
        }`}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
