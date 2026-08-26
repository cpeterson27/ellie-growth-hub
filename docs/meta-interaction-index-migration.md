# One-time Meta interaction index rollout

This migration only inspects data/index definitions and, with explicit apply, creates and verifies two indexes. It never repairs records, drops indexes, runs syncIndexes, initializes application models against the database, or calls a provider.

## Commands

Run from the repository's backend directory with MONGO_URI already securely configured for the intended database. Do not paste a connection string into command history or chat.

Read-only preflight (also the default without flags):

```sh
npm run meta:indexes:preflight
```

Apply, only after reviewing preflight, confirming a backup, and receiving production approval:

```sh
npm run meta:indexes:migrate
```

Mocked tests (no database or provider connection):

```sh
npm run test:meta-indexes
```

## Exact indexes

Definitions are read from the existing schemas, without changing them:

- SocialConnection: key { workspaceId: 1, selectedAssetIds: 1 }; unique; name workspace_selected_social_asset; partial filter { "selectedAssetIds.0": { $exists: true } }.
- CrmActivity: key { workspaceId: 1, "metadata.socialEventKey": 1 }; unique; default name workspaceId_1_metadata.socialEventKey_1; partial filter { "metadata.socialEventKey": { $type: "string" } }.

An equivalent CrmActivity index under another name is accepted. The explicitly named SocialConnection index must use its required name. Different options on either target key or a conflicting name are blockers, never permission to drop/rebuild.

## Safety and reports

Both collection preflights complete before either index is created. Duplicate checks are workspace-scoped and honor the schema partial filters. Repeated selected assets within one document are counted once, matching unique multikey behavior. Nonconforming participating data (including array event keys or invalid workspace IDs) stops the rollout for manual review. Non-simple collection collation also requires manual review.

Reports contain counts and at most 20 samples of record IDs/workspace IDs, not credentials, activity bodies, or event-key values. A duplicate sample shows the first and last conflicting record IDs, not every record. Blockers return a nonzero exit status and no index is created. No data is deleted, merged, rewritten, or automatically repaired.

Preflight uses only native-driver reads; Mongoose autoCreate/autoIndex cannot run because no Mongoose connection is opened. Read-only MongoDB credentials are suitable for preflight. Apply requires createIndex privileges.

Pause relevant writes during the approved rollout if possible: a preflight is not a transaction or lock. MongoDB's unique index build remains the final concurrency check. If creation fails after one index succeeds, the report identifies that partial result and stops. It does not undo the successful index or expose raw driver errors. Re-running preflight/apply is safe and preserves correct existing indexes.

The scans use a 60-second server time limit and do not enable disk spilling. A timeout/resource error stops the script rather than skipping validation. Connection/driver exceptions are reported generically to avoid leaking connection strings or duplicate key contents.

No production execution was performed as part of implementation. Verification used mocked collections, not a real MongoDB index build.
