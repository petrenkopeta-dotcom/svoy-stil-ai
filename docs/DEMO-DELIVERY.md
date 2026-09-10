# Isolated VK demo build

The temporary demo is a separate entry in `demo/`. It never imports the main
application, auth, CV, persistence or telemetry modules. It uses only bundled
sample garments; selections and favorites live in React memory and disappear
on refresh. It has no file inputs, camera, login, external links or analytics.
The banner labels every screen as DEMO. Outfit examples are explicitly fixed,
not actual recognition or personalized styling results.

```sh
npm ci --ignore-scripts
npm run build:demo
npm run test:browser -- --project=demo-release
```

`dist-demo/` contains only `index.html` and bundled local CSS/JS. It uses relative
asset paths, needs no backend and does not read `.env` configuration. The build
gate checks boundaries and CSP. CSP denies connect, form submission, frames,
media and third-party assets. Browser tests deny fetch/XHR/WebSocket, seed a
private wardrobe sentinel to prove it is not read, complete the three-question
journey and assert no outside requests, API requests or upload controls.

The delivery ZIP must contain the **contents** of `dist-demo/` at its root, not
the source repository, `.env`, models or local QA material. Its SHA-256 is recorded
beside the archive in `artifacts/` (excluded from Git).

Hosting is not performed here. The owner must use the official VK hosting flow
for their existing test Mini App, provide access to the test app and configure
its development/test URL using this static build. Exact cabinet steps depend on
the owner's current VK UI; they have not been verified in this task. The blocked
developer page was not accessed through another domain or tool. No alternative
host, public catalog submission, real authorization or paid service is used.

The archive is a demo artifact, not a deployed link or staging safety approval.
The production photo and budget gates remain closed.
