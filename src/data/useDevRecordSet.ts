/**
 * TEST SETUP — selects the development record set (hero + fixtures) for one Node test file.
 *
 * Import it FIRST (before anything that loads the era data): ES modules evaluate in import order,
 * so the variable is set before recordSets.ts resolves the active set. Each `node --test` file runs in
 * its own process, so this never leaks into other test files.
 */
process.env.ARCHIVE_RECORDS = "dev";
