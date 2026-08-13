import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBrand } from "../brand-context";
import { Button } from "../components/Button";
import { PageContainer, PageHeader } from "../components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { CodeBlock } from "../components/ui/CodeBlock";
import { CopyButton } from "../components/ui/CopyButton";
import { EmptyState, Skeleton } from "../components/ui/feedback";
import { CheckIcon, SparkIcon } from "../components/ui/icons";
import { createApiKey, listApiKeys, type ApiKey, type MintedKey } from "../lib/keys";
import {
  MCP_CLIENTS,
  STARTER_PROMPTS,
  defaultClientForAiChoice,
  mcpClientById,
  type McpClientId,
} from "../lib/mcp-clients";
import { describeTool, fetchUsageSummary, type UsageSummary } from "../lib/usage";
import { formatRelativeTime } from "../lib/metrics";

// The "Connect your AI" nav item — the step the funnel promised and the
// app never delivered.
//
// The old flow: sign-up told the user "one connector link to paste —
// we'll have it ready", then dropped them on a Data tab where that step
// did not exist. It lived behind a different tab, behind "Create key",
// as a bare URL in a paragraph. This page is that step, made whole:
//
//   1. Pick your client — the choice made back on the landing page is
//      pre-selected, so most people land on the right tab already.
//   2. Get a key — minted inline, one click, no naming ceremony. The
//      key is a means to an end here, not a resource to administer.
//   3. Copy the exact snippet for that client, with its real setup
//      steps rather than a generic "paste this somewhere".
//   4. Watch for the first call. THIS is the part that was missing
//      everywhere: pasting a config into a desktop app gives you no
//      feedback at all, so we poll /v1/usage/summary and tell the user
//      the moment their agent actually reaches us.
//
// Step 4 is why this page owns a polling loop. Without it the user's
// only confirmation is asking their AI a question and hoping.

export interface ConnectAiPageProps {
  /** The visitor's landing-page AI choice ("claude" | "chatgpt" |
   *  "cursor" | …), if the brand tracked one. Pre-selects a client. */
  aiChoice?: string | null;
  /** Where the brand's full key manager lives, for people who want to
   *  administer keys rather than just wire one up. */
  keysHref?: string;
  /** Docs link for the "it didn't work" case. */
  docsHref?: string;
}

const POLL_MS = 5000;

export function ConnectAiPage({ aiChoice, keysHref, docsHref }: ConnectAiPageProps) {
  const brand = useBrand();
  const [clientId, setClientId] = useState<McpClientId>(() =>
    defaultClientForAiChoice(aiChoice),
  );
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [minted, setMinted] = useState<MintedKey | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  const client = mcpClientById(clientId) ?? MCP_CLIENTS[0]!;

  useEffect(() => {
    void listApiKeys().then(setKeys);
  }, []);

  // Baseline the call count at mount so "first call" means "a call
  // arrived while you were on this page", not "you have ever called".
  // Someone re-wiring a second client would otherwise see an instant
  // false success.
  const baseline = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const summary = await fetchUsageSummary({ days: 7 });
      if (baseline.current === null) baseline.current = summary.total_calls_ever;
      setUsage(summary);
    } catch {
      /* polling must never surface an error — it's a nicety */
    }
  }, []);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  const connected =
    usage !== null && baseline.current !== null && usage.total_calls_ever > baseline.current;
  const everConnected = (usage?.total_calls_ever ?? 0) > 0;

  const mint = useCallback(async () => {
    setMinting(true);
    setMintError(null);
    // Name it after the client so the key list stays readable when a
    // user wires up three of them.
    const result = await createApiKey({
      name: `${client.name}`,
      scopes: [],
    });
    if ("error" in result) {
      setMintError(result.error);
    } else {
      setMinted(result.key);
      setKeys((prev) => [result.key, ...(prev ?? [])]);
    }
    setMinting(false);
  }, [client.name]);

  return (
    <PageContainer>
      <PageHeader
        title="Connect your AI"
        description={`Wire ${brand.displayName} into the AI you already use. Two minutes, one paste.`}
        actions={
          <ConnectionPill connected={connected} everConnected={everConnected} usage={usage} />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Pick your AI</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {MCP_CLIENTS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClientId(c.id)}
                aria-pressed={c.id === clientId}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  c.id === clientId
                    ? "border-[var(--accent)] bg-[var(--accent)]/[0.06]"
                    : "border-[var(--border)] hover:bg-[var(--muted)]"
                }`}
              >
                <span className="block text-[13px] font-medium">{c.name}</span>
                <span className="block text-[11.5px] text-[var(--muted-foreground)]">
                  {c.tagline}
                </span>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>2. Get your key</CardTitle>
        </CardHeader>
        <CardBody>
          {minted ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/[0.06] px-3.5 py-3">
              <span className="mt-0.5 text-[var(--success)]" aria-hidden="true">
                <CheckIcon />
              </span>
              <div className="min-w-0 text-[13px]">
                <p className="font-medium">Key created.</p>
                <p className="mt-0.5 text-[var(--muted-foreground)]">
                  It's already baked into the snippet below. We can't show it to you again
                  after you leave this page — but you can always create another.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] text-[var(--muted-foreground)]">
                {keys === null
                  ? " "
                  : keys.length > 0
                    ? `You have ${keys.length} key${keys.length === 1 ? "" : "s"} already. Existing keys can't be shown again, so create a fresh one for ${client.name}.`
                    : `One key, scoped to your account. ${client.name} sends it with every request.`}
              </p>
              <Button onClick={() => void mint()} disabled={minting} className="shrink-0">
                {minting ? "Creating…" : `Create a key for ${client.name}`}
              </Button>
            </div>
          )}
          {mintError && (
            <p className="mt-2 text-[13px] text-[var(--danger)]">{mintError}</p>
          )}
          {keysHref && (
            <p className="mt-3 text-[12px] text-[var(--muted-foreground)]">
              Managing several agents?{" "}
              <a href={keysHref} className="underline underline-offset-2">
                Scope and revoke keys
              </a>
              .
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>3. Add it to {client.name}</CardTitle>
        </CardHeader>
        <CardBody>
          {!minted ? (
            <EmptyState
              title="Create a key first"
              description="The snippet for your client is generated with your key already in it, so there's nothing to fill in by hand."
            />
          ) : (
            <ol className="space-y-3">
              {client.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px]">{step.text}</p>
                    {step.snippet && (
                      <div className="mt-2">
                        <CodeBlock
                          code={client.snippet(minted)}
                          language={client.kind}
                          wrap={client.kind === "url"}
                        />
                        {client.footnote && (
                          <p className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
                            {client.footnote}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex items-start justify-between gap-3">
          <CardTitle>4. Ask it something</CardTitle>
        </CardHeader>
        <CardBody>
          <WaitingForCall connected={connected} everConnected={everConnected} usage={usage} />

          <p className="mb-2 mt-4 text-[12.5px] font-medium text-[var(--muted-foreground)]">
            Try one of these:
          </p>
          <ul className="space-y-1.5">
            {STARTER_PROMPTS.map((p) => (
              <li
                key={p}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <span className="min-w-0 text-[13px]">
                  <span className="mr-1.5 inline-block align-[-1px] text-[var(--accent)]" aria-hidden="true">
                    <SparkIcon />
                  </span>
                  {p}
                </span>
                <CopyButton value={p} className="shrink-0" />
              </li>
            ))}
          </ul>

          {docsHref && (
            <p className="mt-4 text-[12.5px] text-[var(--muted-foreground)]">
              Nothing happening?{" "}
              <a href={docsHref} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Read the setup guide
              </a>{" "}
              — the usual cause is the client not being restarted.
            </p>
          )}
        </CardBody>
      </Card>

      <RecentActivity usage={usage} />
    </PageContainer>
  );
}

function ConnectionPill({
  connected,
  everConnected,
  usage,
}: {
  connected: boolean;
  everConnected: boolean;
  usage: UsageSummary | null;
}) {
  if (usage === null) return <Skeleton className="h-6 w-28" />;
  if (connected) return <Badge tone="success">Connected · first call received</Badge>;
  if (everConnected) {
    return <Badge tone="success">Last call {formatRelativeTime(usage.last_call_at)}</Badge>;
  }
  return <Badge tone="neutral">Waiting for your first call</Badge>;
}

/** The live confirmation. Three states, and each says something
 *  different — "we've never heard from you", "we heard from you just
 *  now", and "you're already set up". */
function WaitingForCall({
  connected,
  everConnected,
  usage,
}: {
  connected: boolean;
  everConnected: boolean;
  usage: UsageSummary | null;
}) {
  if (connected || (everConnected && usage)) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/[0.06] px-3.5 py-3">
        <span className="mt-0.5 text-[var(--success)]" aria-hidden="true">
          <CheckIcon />
        </span>
        <div className="text-[13px]">
          <p className="font-medium">
            {connected ? "It works — we just received a call." : "Your AI is connected."}
          </p>
          <p className="mt-0.5 text-[var(--muted-foreground)]">
            {usage?.last_tool
              ? `${describeTool(usage.last_tool)} · ${formatRelativeTime(usage.last_call_at)}.`
              : "Ask it anything about your Amazon account."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3.5 py-3">
      <span
        className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--muted-foreground)]"
        aria-hidden="true"
      />
      <div className="text-[13px]">
        <p className="font-medium">Waiting for your first call.</p>
        <p className="mt-0.5 text-[var(--muted-foreground)]">
          Ask your AI one of the questions below. This box updates by itself the moment we
          hear from it — leave the page open.
        </p>
      </div>
    </div>
  );
}

function RecentActivity({ usage }: { usage: UsageSummary | null }) {
  const rows = useMemo(() => usage?.by_tool.slice(0, 5) ?? [], [usage]);
  if (!usage || usage.total_calls_ever === 0) return null;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>What your AI has been asking</CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.tool} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate">{describeTool(r.tool)}</span>
              <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">
                {r.calls}
                {r.failures > 0 && (
                  <span className="ml-1.5 text-[var(--danger)]">{r.failures} failed</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-[var(--muted-foreground)]">
          {usage.calls} call{usage.calls === 1 ? "" : "s"} in the last {usage.days} days
          {usage.avg_latency_ms !== null && ` · ${usage.avg_latency_ms}ms average`}.
        </p>
      </CardBody>
    </Card>
  );
}
