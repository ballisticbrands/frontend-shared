// API key management — the shared version of what each brand app used
// to keep locally. Backend contract: sellerconnect/src/routes/keys.ts.
//
// Moved into shared because ConnectAiPage (also shared) mints keys, and
// a page can't depend on a symbol that lives in its consumer.
//
// `scopes` are tool-domain ids the backend expands into a tool
// allow-list. They're plain strings here rather than a union: the
// domain set is a backend concern that shifts (it went from six domains
// to three), and pinning a union in the shared package would force a
// major bump every time the backend adds one.

import { ApiError, apiFetch } from "../api";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Ready-to-paste config per MCP client, rendered server-side (see
 *  sellerconnect/src/lib/mcp-client-configs.ts). We never rebuild these
 *  client-side: the connector URL embeds a signed JWT, not the key. */
export interface McpClientConfigs {
  claude_desktop: { mcpServers: Record<string, { url: string }> };
  claude_code: { command: string };
  cursor: { mcpServers: Record<string, { url: string; headers: { Authorization: string } }> };
  openclaw: {
    mcpServers: Record<
      string,
      { transport: string; url: string; headers: { Authorization: string } }
    >;
  };
}

export interface MintedKey extends ApiKey {
  /** Shown exactly once, at mint time. Never retrievable again. */
  secret: string;
  mcp: {
    bearer: { url: string; header: string };
    signed_url: string;
  };
  configs: McpClientConfigs;
}

export async function listApiKeys(): Promise<ApiKey[]> {
  try {
    return await apiFetch<ApiKey[]>("/v1/keys");
  } catch {
    // A key list that fails to load should degrade to "no keys yet"
    // rather than blanking the page that mints them.
    return [];
  }
}

export async function createApiKey(input: {
  name: string;
  scopes: string[];
}): Promise<{ key: MintedKey } | { error: string }> {
  if (!input.name.trim()) return { error: "Name is required." };
  try {
    const key = await apiFetch<MintedKey>("/v1/keys", {
      method: "POST",
      body: JSON.stringify({ name: input.name.trim(), scopes: input.scopes }),
    });
    return { key };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "We couldn't create this key. Please try again." };
  }
}

export async function revokeApiKey(id: string): Promise<{ error?: string }> {
  try {
    await apiFetch(`/v1/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
    return {};
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "We couldn't revoke this key. Please try again." };
  }
}
