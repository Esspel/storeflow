CREATE TABLE IF NOT EXISTS store_ips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_ips_store ON store_ips(store_id);
CREATE INDEX IF NOT EXISTS idx_store_ips_ip ON store_ips(ip_address);
