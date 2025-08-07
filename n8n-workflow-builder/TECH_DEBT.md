# Technical Debt Tracker

## Discovery Refactor - Cleanup Tasks

### Deprecated Code to Remove
Track deprecated code that needs removal after the discovery refactor is complete and tested.

#### Cleanup Status (Updated: 2025-01-09)
**Note:** Initial aggressive cleanup was partially reverted to maintain backward compatibility

| File | Item | Status | Notes |
|------|------|--------|-------|
| `lib/services/claude-service.ts.backup` | Legacy service backup | ✅ REMOVED | Deleted successfully |
| `lib/types/claude-response-types.ts` | Legacy type definitions | ✅ REMOVED | Deleted successfully |
| `lib/orchestrator/contracts/*.ts` | Contract type files | ⚠️ RESTORED | Kept as re-export shims for backward compatibility |
| `services/claude/validation/schemas.ts` | `legacyIntentAnalysisSchema` | ✅ REMOVED | Already cleaned up |
| `types/claude/responses.ts` | `LegacyClaudeAnalysisResponse` | ✅ REMOVED | Already cleaned up |

#### Search for Deprecations
To find all deprecated code:
```bash
# Find all @deprecated tags
grep -r "@deprecated" --include="*.ts" --include="*.tsx"

# Find all @removal-target tags
grep -r "@removal-target" --include="*.ts" --include="*.tsx"

# Find all legacy references
grep -r "legacy" -i --include="*.ts" --include="*.tsx"
```

### Migration Checklist
- [x] Phase 1: Intent Analysis ✅ COMPLETE
- [x] Phase 2: TaskService implementation ✅ COMPLETE
- [x] Phase 3: GapSearchService implementation ✅ COMPLETE
- [x] Phase 4: Discovery Runner refactor ✅ COMPLETE
- [ ] Phase 5: Configuration Phase update (IN PROGRESS)
- [x] All unit tests passing with new flow ✅
- [x] Integration tests passing ✅
- [x] Performance benchmarks meet targets ✅ (70% faster, 80% less tokens)
- [ ] Feature flag tested in both modes
- [ ] Production deployment successful
- [ ] Monitor for 1 week without issues
- [ ] **SAFE TO REMOVE LEGACY CODE**

### Cleanup Process
1. Complete all phases of discovery refactor
2. Ensure all tests pass with new implementation
3. Deploy with feature flag and monitor
4. After stable for 1 week, schedule cleanup sprint
5. Remove all items marked with `@deprecated` and `@removal-target`
6. Update tests to remove legacy test cases
7. Update documentation to remove legacy references
8. Final test run
9. Deploy cleanup

### Other Technical Debt Items

#### Contract Files (Added: 2025-01-09)
- [ ] Remove re-export shims in `lib/orchestrator/contracts/*.ts` after all imports updated to use `@/types/orchestrator`
- [ ] Update all imports to reference new type locations directly
- [ ] Consider using ESLint rule to enforce importing from `@/types/orchestrator`

#### Next Steps
- [ ] Complete Phase 5: Configuration Phase update to skip pre-configured task nodes
- [ ] Enable feature flag for optimized discovery in staging
- [ ] Monitor performance metrics and error rates

## Notes
- Always use `@deprecated` JSDoc tag when deprecating code
- Include `@removal-target` to specify when it can be removed
- Add entry to this file for tracking
- Consider using a linter rule to warn on deprecated usage