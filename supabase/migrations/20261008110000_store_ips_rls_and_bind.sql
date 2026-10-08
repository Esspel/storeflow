-- RLS på store_ips + policyer (safe repeat apply)
ALTER TABLE store_ips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_ips_select ON store_ips;
CREATE POLICY store_ips_select ON store_ips FOR SELECT USING (true);

DROP POLICY IF EXISTS store_ips_insert ON store_ips;
CREATE POLICY store_ips_insert ON store_ips FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS store_ips_delete ON store_ips;
CREATE POLICY store_ips_delete ON store_ips FOR DELETE USING (true);
