/*
  # Add password verification and hash functions

  Uses pgcrypto for bcrypt password hashing and verification.
  These functions are called from the frontend via RPC.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to verify a plain password against a bcrypt hash
CREATE OR REPLACE FUNCTION verify_password(plain_password text, hashed_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN hashed_password = crypt(plain_password, hashed_password);
END;
$$;

-- Function to hash a password with bcrypt
CREATE OR REPLACE FUNCTION hash_password(plain_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN crypt(plain_password, gen_salt('bf', 10));
END;
$$;

-- Update default admin password to use pgcrypto bcrypt (password: admin123)
UPDATE app_users
SET password_hash = crypt('admin123', gen_salt('bf', 10))
WHERE username IN ('admin', 'emma.andersson', 'marcus.k');
