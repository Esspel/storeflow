---
name: pr-check
description: PR validation checklist and quality checks
disable-model-invocation: true
---

# pr-check

Validate PR requirements and quality checks before submission.

## Usage

User provides:
- PR number or branch name

## Output
- Checklist of PR requirements
- Quality checks results
- Missing items list

## Steps

1. Parse PR context
2. Check GitHub requirements
3. Run quality checks
4. Validate Supabase migrations
5. Return validation report
