---
name: create-migration
description: Generate Supabase migration files with validation and idempotency checks
disable-model-invocation: true
---

# create-migration

Generate a Supabase migration file with validation and idempotency checks.

## Usage

User provides:
- Migration description (e.g., "Add user_shelf_life column")
- Optional SQL template

## Output
- Migration file with unique timestamp
- Validation script
- Idempotency check

## Steps

1. Parse migration description
2. Generate timestamped filename
3. Validate no existing migration with same description
4. Generate SQL template with validation
5. Create migration file
6. Return file path
