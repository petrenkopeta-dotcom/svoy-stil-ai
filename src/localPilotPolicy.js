const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalPilotPhotoEnabled({ flag, hostname } = {}) {
  return flag === "true" && LOOPBACK_HOSTS.has(String(hostname || "").toLowerCase());
}

export function isLocalCapsuleEnabled({ flag, hostname } = {}) {
  return flag === "true" && LOOPBACK_HOSTS.has(String(hostname || "").toLowerCase());
}

export function runAddGarmentEntry({ localPilot, requireAuth, open }) {
  if (localPilot) {
    open();
    return "local_pilot";
  }
  requireAuth("wardrobe", open);
  return "auth_required";
}

export function catalogForLocalPilot({ localPilot, personal, fallback }) {
  return localPilot ? personal : fallback;
}
