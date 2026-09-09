# AUTH-08/09 — privacy, sessions and recovery

AUTH-08 contract PASS; live storage/delete evidence pending provider. Signed-out cannot enter personal creation. Target storage bucket is private, paths are owner-prefixed, signed URL TTL is 300s, logout clears cloud cache/object URLs, and delete account requires an exact confirmation plus a verified receipt covering database and objects. Local pre-auth source is not silently erased.

AUTH-09 session matrix: reload restores only a provider session; expired/revoked sessions become signed_out and gate personal writes; refresh is provider-owned; offline never displays synchronized; two devices see only server-acknowledged revisions; email change requires recent authentication and verification of the new address; logout is device-scoped unless revoke-all is explicitly selected. All send-code responses are generic. Rate limit is represented by retry time. Audit events allowlist event type, result code, coarse timestamp, request correlation and opaque user id; email, OTP, tokens, photo names and payloads are forbidden.

Live cases required later: reload/refresh/expiry/two devices/revoke/email change; external network failures; storage delete verification; cross-user objects. What did we lose? Logout removes cloud cache on shared devices; offline users lose new cloud writes but retain honest read/local recovery paths.
