export const REFERENCE_DRAFT_VERSION = 1;

export class MemoryReferenceDraftBackend {
  constructor() { this.value = null; }
  async get() { return this.value ? structuredClone(this.value) : null; }
  async put(value) { this.value = structuredClone(value); }
  async clear() { this.value = null; }
}

class IndexedDbReferenceDraftBackend {
  constructor(indexedDB = globalThis.indexedDB) { this.indexedDB = indexedDB; this.database = null; }
  async open() {
    if (this.database) return this.database;
    this.database = await new Promise((resolve, reject) => { const request = this.indexedDB.open("ai-stylist-reference-draft", 1); request.onupgradeneeded = () => request.result.objectStoreNames.contains("draft") || request.result.createObjectStore("draft"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return this.database;
  }
  async request(mode, action) { const db = await this.open(); return new Promise((resolve, reject) => { const tx = db.transaction("draft", mode), request = action(tx.objectStore("draft")); request.onerror = () => reject(request.error); request.onsuccess = () => mode === "readonly" && resolve(request.result ?? null); if (mode === "readwrite") tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  get() { return this.request("readonly", (store) => store.get("active")); }
  put(value) { return this.request("readwrite", (store) => store.put(value, "active")); }
  clear() { return this.request("readwrite", (store) => store.delete("active")); }
}

export function createReferenceDraftStore({ backend, indexedDB = globalThis.indexedDB } = {}) {
  const active = backend || (indexedDB?.open ? new IndexedDbReferenceDraftBackend(indexedDB) : new MemoryReferenceDraftBackend());
  return Object.freeze({
    async load() { const value = await active.get(); return value?.version === REFERENCE_DRAFT_VERSION && value.dto?.blob instanceof Blob ? value : null; },
    async save({ dto, items = [], stage = "review", editingMaskId = null }) {
      if (!(dto?.blob instanceof Blob) || dto.networkAllowed !== false) throw new TypeError("SAFE_LOCAL_REFERENCE_DRAFT_REQUIRED");
      const safeDto = { version: dto.version, blob: dto.blob, mime: dto.mime, width: dto.width, height: dto.height, byteSize: dto.byteSize, provenance: dto.provenance, purpose: dto.purpose, networkAllowed: false };
      const safeItems = structuredClone(items).map((item) => ({ ...item, previewUrl: String(item.previewUrl || "").startsWith("blob:") ? (item.local_cutout_data_url || null) : item.previewUrl }));
      await active.put({ version: REFERENCE_DRAFT_VERSION, savedAt: Date.now(), dto: safeDto, items: safeItems, stage: ["review", "editor"].includes(stage) ? stage : "review", editingMaskId });
    },
    async clear() { await active.clear(); },
  });
}

export const referenceDraftStore = createReferenceDraftStore();
