import { readFileSync, readdirSync } from "node:fs";
const source = readFileSync("demo/main.jsx", "utf8");
if (/fetch|XMLHttpRequest|WebSocket|sendBeacon|getUserMedia|localStorage|sessionStorage|indexedDB|type=["']file|\.\.\/src\//.test(source)) throw new Error("demo_capability_boundary_failed");
const html = readFileSync("dist-demo/index.html", "utf8");
if (!html.includes("connect-src 'none'") || !html.includes("form-action 'none'") || !html.includes('content="no-referrer"')) throw new Error("demo_csp_missing");
for (const name of readdirSync("dist-demo", { recursive: true })) {
  if (/\.map$|\.env|\.sqlite|\.db$/.test(name)) throw new Error("demo_private_artifact");
  if (name.endsWith(".js")) {
    const code = readFileSync(`dist-demo/${name}`, "utf8");
    if (/\/api\/|supabase|VK_APP_SECRET|getUserMedia|sendBeacon/.test(code)) throw new Error("demo_network_capability");
  }
}
console.log("Demo boundary passed: isolated static entry, CSP denies network, no personal runtime.");
