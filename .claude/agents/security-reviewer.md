---
name: security-reviewer
description: Parallel security review for RLS, auth, and data access
disable-model-invocation: false
---

# security-reviewer

Review code for security vulnerabilities in RLS policies, auth flows, and data access patterns.

## Focus Areas
- RLS policy correctness (SELECT, INSERT, UPDATE, DELETE)
- Auth verification (no mock UUIDs, proper UUID validation)
- Data access patterns (no direct REST fetch for DB operations)
- Sensitive data exposure
- Migration security (DEFYNER functions, policies)
