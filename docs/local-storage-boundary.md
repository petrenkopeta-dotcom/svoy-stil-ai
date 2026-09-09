# Local repository boundary (closed alpha)

`src/storageRepositories.js` is the persistence boundary for wardrobe items,
saved outfits, the learning profile, and consent. Product code should depend on
these repository operations instead of browser storage keys:

- `load(): { data, meta }`
- `save(data): { data, meta }`
- `delete()` and `reset()`
- `export()`; the repository set also provides `exportAll()`, `deleteAll()`, and
  `resetAll()`.

The local adapter uses one versioned envelope per owner and aggregate. Existing
`as-wardrobe`, `as-saved`, and `as-stylist-learning-v1` values migrate only for
the local alpha owner. The old value is removed only after the new envelope is
successfully written. Malformed values are quarantined best-effort and surfaced
through `meta.warning`; quota and unavailable-storage failures use stable error
codes.

## Future server adapter

A backend adapter may implement the same repository operations, but it is not
implemented or simulated in the alpha. Its contract must additionally provide
authenticated owner scoping, server-side authorization, optimistic concurrency,
idempotent deletion, and an explicit export job/result lifecycle. Consent must
remain its own aggregate. Repository callers must not infer success before the
adapter confirms it.

Photos are outside this server boundary. No local photo bytes, data URLs, blob
URLs, or derived image data may be sent by a future adapter without a separate
approved privacy design and consent flow. `createObjectUrlRegistry` owns temporary
browser URLs and revokes them on replacement, deletion, and component teardown;
`export()` strips such non-portable URLs.

`src/main.jsx` still contains the legacy direct calls and was intentionally not
changed in ALPHA-05. The integration owner should instantiate one repository set
for the active owner, replace direct reads/writes domain by domain, and call the
object URL registry's `release`/`dispose` from item deletion and React cleanup.

For offline-first integration, `createOfflineFirstStorage()` in
`src/resilientStorage.js` wraps repository failures and JSON preference writes.
Every mutation updates memory first. Callers must inspect `meta.persisted`; when
it is `false`, show `meta.message` ("Не сохранено на устройстве") and must not
display a persistence-success confirmation. `meta.code` contains the stable
repository result code (`storage_unavailable`, `quota_exceeded`,
`serialization_failed`, or `corrupt_data`).
