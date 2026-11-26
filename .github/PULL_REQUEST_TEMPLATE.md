## Summary

Describe the changes in this pull request and link any relevant issue or task.

## Verification Checklist

- [ ] `npm run type-check` and `npm test` pass
- [ ] `npm run lint` passes without errors
- [ ] `npm --prefix mobile run typecheck`, `config:check`, and `deps:check` pass (if `mobile/` changed)
- [ ] Database migrations in `migrations/` and `src/lib/tenant-schema.ts` are idempotent (if schema changed)
- [ ] `npm run ops:verify-eas` passes (no `.env`, keystores, `google-services.json`, or credentials committed)
