// packages/core/src/__tests__/setup.ts
// Vitest setup — disables AMP_REQUIRE_PROJECT_TAG enforcement during tests so
// pre-existing fixtures that don't supply a project tag continue to work.
// Production keeps the default-on enforcement (Bucket B).
process.env['AMP_REQUIRE_PROJECT_TAG'] = 'false';
