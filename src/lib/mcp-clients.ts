// The MCP-client catalog behind the "Connect your AI" page.
//
// The backend renders the actual config payloads at key-mint time
// (sellerconnect/src/lib/mcp-client-configs.ts) because the connector
// URL embeds a signed JWT we must not reconstruct client-side. What
// lives HERE is everything the backend has no opinion about: which
// clients we present, in what order, what each one's setup ritual is,
// and which of the minted payloads that ritual needs.
//
// Adding a client = one entry here + (if it needs a new payload shape)
// one entry in the backend's McpClientConfigs.

import type { MintedKey } from "./keys";

export type McpClientId =
  | "claude_desktop"
  | "claude_code"
  | "chatgpt"
  | "cursor"
  | "openclaw"
  | "other";

/** How the snippet should be presented — drives both the syntax
 *  highlighting hint and the verb on the copy button. */
export type SnippetKind = "url" | "json" | "shell";

export interface McpClientStep {
  /** One instruction. Kept imperative and specific — "Settings →
   *  Connectors → Add custom connector", not "open the settings". */
  text: string;
  /** When set, the snippet is rendered under this step. */
  snippet?: boolean;
}

export interface McpClient {
  id: McpClientId;
  /** Product name as its makers spell it. */
  name: string;
  /** One line under the name in the picker. */
  tagline: string;
  /** Steps, in order. Exactly one should carry `snippet: true`. */
  steps: McpClientStep[];
  kind: SnippetKind;
  /** Pull the payload this client needs out of a freshly minted key. */
  snippet: (key: MintedKey) => string;
  /** Shown under the snippet when there's a gotcha worth pre-empting. */
  footnote?: string;
}

const json = (v: unknown): string => JSON.stringify(v, null, 2);

export const MCP_CLIENTS: McpClient[] = [
  {
    id: "claude_desktop",
    name: "Claude",
    tagline: "Desktop app or claude.ai",
    kind: "url",
    steps: [
      { text: "Open Settings → Connectors." },
      { text: "Click Add custom connector." },
      { text: "Paste this URL and save.", snippet: true },
      { text: "Start a new chat — the tools appear in the connector menu." },
    ],
    snippet: (k) => k.mcp.signed_url,
    footnote:
      "This URL contains your key. Treat it like a password — anyone with it can read your Amazon data.",
  },
  {
    id: "claude_code",
    name: "Claude Code",
    tagline: "The terminal CLI",
    kind: "shell",
    steps: [
      { text: "Run this in your terminal.", snippet: true },
      { text: "Restart any running session." },
    ],
    snippet: (k) => k.configs.claude_code.command,
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    tagline: "Custom connectors",
    kind: "url",
    steps: [
      { text: "Open Settings → Connectors → Create." },
      { text: "Paste this URL as the MCP server URL.", snippet: true },
      { text: "Save, then pick the connector from the composer." },
    ],
    // ChatGPT's connector form takes a bare URL with no header field, so
    // it needs the signed-URL variant — same one Claude's desktop app uses.
    snippet: (k) => k.mcp.signed_url,
    footnote:
      "Custom connectors need a ChatGPT plan that includes them. If you don't see Connectors in Settings, your plan doesn't have it yet.",
  },
  {
    id: "cursor",
    name: "Cursor",
    tagline: "The AI code editor",
    kind: "json",
    steps: [
      { text: "Open ~/.cursor/mcp.json (create it if it doesn't exist)." },
      { text: "Merge this into the file.", snippet: true },
      { text: "Reload Cursor." },
    ],
    snippet: (k) => json(k.configs.cursor),
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    tagline: "Self-hosted agents",
    kind: "json",
    steps: [
      { text: "Add this to your OpenClaw MCP config.", snippet: true },
      { text: "Restart the agent." },
    ],
    snippet: (k) => json(k.configs.openclaw),
  },
  {
    id: "other",
    name: "Any other client",
    tagline: "Generic HTTP MCP",
    kind: "json",
    steps: [
      { text: "Point your client at the endpoint below and send the key as a bearer header.", snippet: true },
      { text: "Restart the client." },
    ],
    snippet: (k) =>
      json({
        transport: "streamable-http",
        url: k.mcp.bearer.url,
        headers: { Authorization: `Bearer ${k.secret}` },
      }),
    footnote: "Any client that speaks HTTP MCP works — the transport is standard.",
  },
];

export function mcpClientById(id: string): McpClient | undefined {
  return MCP_CLIENTS.find((c) => c.id === id);
}

/** Map the coarse funnel-level choice (`?ai=` on the LP, persisted at
 *  sign-up) onto the install target we should open by default. The
 *  funnel only knows "Claude"; the install page has to pick between the
 *  desktop app and the CLI, and desktop is the safer default. */
export function defaultClientForAiChoice(choice: string | null | undefined): McpClientId {
  switch (choice) {
    case "claude":
      return "claude_desktop";
    case "chatgpt":
      return "chatgpt";
    case "cursor":
      return "cursor";
    default:
      return "claude_desktop";
  }
}

/** Starter questions offered once a client is wired up. Deliberately
 *  phrased as things a seller would actually type, and each one is
 *  answerable by the tools we ship — nothing here promises data the
 *  agent can't reach. */
export const STARTER_PROMPTS: string[] = [
  "What were my best-selling products last week?",
  "How much did I spend on ads yesterday, and what did it return?",
  "Which SKUs am I about to run out of?",
  "What's my TACOS this month versus last month?",
  "Show me the search terms that spent money but made no sales.",
  "Which of my listings lost the buy box in the last 7 days?",
];
