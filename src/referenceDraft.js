export const REFERENCE_DRAFT_VERSION = 1;

export class MemoryReferenceDraftBackend {
  constructor() { this.value = null; }
  async get() { return this.value ? structuredClone(this.value) : null; }
  async put(value) { this.value = structuredClone(value); }
  async clear() { this.value = null; }
}

export function createReferenceDraftStore({ backend, indexedDB = globalThis.indexedDB } = {}) {
  if (backend && !(backend instanceof MemoryReferenceDraftBackend)) throw new TypeError("MEMORY_ONLY_REFERENCE_DRAFT_REQUIRED");
  const active = backend || new MemoryReferenceDraftBackend();
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
