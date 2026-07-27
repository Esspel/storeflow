/*
  # API keys for the storeflow-api / mcp-server edge functions

  Lets AI agents / automation tools (Power Automate, MCP clients, etc.) call the
  new HTTP API and MCP server with a long-lived bearer token instead of a human
  session. Keys are never stored in plaintext — only a SHA-256 hash.

  Scoping:
  - store_id NULL  = key can access all stores (issue sparingly, e.g. for HK/admin tools)
  - store_id set   = key is restricted to that one store
  - scopes         = which capabilities the key grants: 'templates:read', 'templates:write',
                      'deliveries:read', 'schedule:read', 'products:search'
*/

CREATE TABLE IF NOT EXISTS api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  key_prefix  text NOT NULL,              -- first 8 chars of the key, shown in UIs/logs for identification
  key_hash    text NOT NULL UNIQUE,       -- sha256(full key), hex-encoded
  store_id    uuid REFERENCES stores(id) ON DELETE CASCADE,
  scopes      text[] NOT NULL DEFAULT '{templates:read,deliveries:read,schedule:read,products:search}',
  created_by  uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies on purpose: this table is only ever touched
-- via the service-role key inside edge functions (issue-api-key, storeflow-api,
-- mcp-server). Nothing in the browser client should read or write it directly.
