# BACKLOG-06 P1 — Photo/privacy browser smoke

## Scope

Automated local-browser verification of the existing photo/privacy boundary. The harness does not change the product entrypoint and does not send photo bytes to a server.

## Run

```powershell
npm.cmd run test:browser:photo-privacy
```

The runner uses installed Microsoft Edge in headless mode. Override its location with `EDGE_PATH` when needed.

## Covered evidence

- explicit consent is required before save;
- external network requests before consent: zero;
- photo Blob is saved in real IndexedDB and restored by a fresh storage instance (reload boundary);
- photo expiration and explicit photo deletion;
- privacy export scrubs transient `blob:` URLs;
- profile reset preserves wardrobe while clearing outfits/learning profile;
- delete-all clears local repositories and emits the one-time deletion result;
- unavailable IndexedDB falls back to explicitly non-persistent memory;
- quota failure returns the stable `quota_exceeded` signal.

The command exits non-zero and prints the failing check on any regression. Successful output is a JSON `PASS` record listing every check.

## Limitations / risk

This is a local closed-alpha smoke, not evidence of production AI, authentication, QR, server persistence, or remote deletion. The reload boundary is exercised by closing the first IndexedDB connection and creating a fresh storage instance in the same browser origin; it deliberately avoids product UI changes.
