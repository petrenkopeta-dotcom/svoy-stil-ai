import { AUTH_ERROR_CODES, AuthPortError } from "./AuthPort.js";
import { diagnoseAuthConfig } from "./authConfig.js";

const trimSlash = (value) => String(value || "").replace(/\/+$/, "");

function classify(response, payload) {
  if (response.status === 429) return new AuthPortError(AUTH_ERROR_CODES.RATE_LIMITED, "rate_limited", { retryAt: Date.now() + 60_000 });
  if (response.status === 401 || response.status === 403) return new AuthPortError(AUTH_ERROR_CODES.INVALID_CODE);
  if (payload?.code?.includes?.("expired") || payload?.error_code?.includes?.("expired")) return new AuthPortError(AUTH_ERROR_CODES.EXPIRED);
  return new AuthPortError(AUTH_ERROR_CODES.UNKNOWN);
}

export function createSupabaseAuthAdapter({ url, publishableKey, fetchFn = globalThis.fetch, now = () => Date.now() } = {}) {
  const base = trimSlash(url);
  if (!diagnoseAuthConfig({ url: base, publishableKey }).configured || typeof fetchFn !== "function") return null;
  let activeSession = null;
  const request = async (path, body) => {
    let response;
    try {
      response = await fetchFn(`${base}/auth/v1/${path}`, { method: "POST", headers: { apikey: publishableKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch { throw new AuthPortError(AUTH_ERROR_CODES.OFFLINE); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw classify(response, payload);
    return payload;
  };
  return {
    async authenticatedRequest({method="POST",path,body,headers={},rawBody=false,returnResponse=false}){if(!activeSession?.accessToken)throw Object.assign(new Error("session_expired"),{code:"session_expired"});let response;try{response=await fetchFn(`${base}${path}`,{method,headers:{apikey:publishableKey,Authorization:`Bearer ${activeSession.accessToken}`,...(!rawBody?{"Content-Type":"application/json"}:{}),...headers},body:body?(rawBody?body:JSON.stringify(body)):undefined});}catch{throw Object.assign(new Error("offline"),{code:"offline"});}if(returnResponse)return response;const payload=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error("request_failed"),{code:payload?.code||"request_failed",status:response.status});return payload;},
    async sendCode({ email }) { await request("otp", { email, create_user: true }); },
    async verifyCode({ email, code }) {
      const payload = await request("verify", { email, token: code, type: "email" });
      const session = { userId: payload.user?.id, email: payload.user?.email || email, accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: payload.expires_at };
      activeSession = session;
      return session;
    },
    async getSession() {
      const session = activeSession; const expiryMs = Number(session?.expiresAt) * 1000;
      if (!session?.userId || !session?.email || !session?.accessToken || !Number.isFinite(expiryMs) || expiryMs <= now()) { activeSession = null; return null; }
      return { ...session };
    },
    async logout() {
      const token = activeSession?.accessToken || null;
      if (token) {
        try { await fetchFn(`${base}/auth/v1/logout`, { method: "POST", headers: { apikey: publishableKey, Authorization: `Bearer ${token}` } }); } catch { /* local logout must complete */ }
      }
      activeSession = null;
    },
  };
}

export const supabaseAuthConfigFromEnv = (env = {}) => ({ url: env.VITE_SUPABASE_URL || "", publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || "" });
