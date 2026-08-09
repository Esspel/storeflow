/*
  # API key rotation support

  Adds the fields needed to rotate api_keys safely without breaking callers
  mid-flight:

  - expires_at       optional absolute expiry. NULL = never expires.
  - rotated_from_id  when a key was created by rotating an older key, this
                      points at that older key's id (self-referencing, so a
                      full rotation chain can be reconstructed).

  Rotation flow (implemented in the issue-api-key edge function):
    1. A new row is inserted with the same name/store_id/scopes as the old
       key, rotated_from_id = old key's id.
    2. The old row is marked revoked_at = now().
  Both steps happen in the same request, so there's a brief window where
  both keys are valid — callers using the old key get a clear "revoked"
  error on their next call rather than a silent outage.
*/

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS rotated_from_id uuid REFERENCES api_keys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_store_id ON api_keys(store_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_rotated_from_id ON api_keys(rotated_from_id) WHERE rotated_from_id IS NOT NULL;

COMMENT ON COLUMN api_keys.expires_at IS 'Optional absolute expiry. NULL = never expires.';
COMMENT ON COLUMN api_keys.rotated_from_id IS 'Points at the previous key in the chain if this key was created via rotation.';
