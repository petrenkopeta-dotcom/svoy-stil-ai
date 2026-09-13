export const WARDROBE_MAX_ITEMS = 100;
export const WARDROBE_MAX_BYTES = 16384;

const fields = ["id", "category", "color"];
const valuePattern = /^[\p{L}\p{N} _-]{1,64}$/u;

// Validates JSON metadata without normalization or mutation. The HTTP boundary
// must also enforce the byte limit on the original body (including whitespace).
export function validateVkWardrobe(items) {
  try {
    if (!Array.isArray(items) || items.length > WARDROBE_MAX_ITEMS)
      return false;
    if (
      Object.getPrototypeOf(items) !== Array.prototype ||
      Reflect.ownKeys(items).length !== items.length + 1
    )
      return false;
    for (let index = 0; index < items.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(items, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) return false;
    }
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item))
        return false;
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) return false;
      const keys = Reflect.ownKeys(item);
      if (
        keys.length !== fields.length ||
        keys.some((key) => !fields.includes(key))
      )
        return false;
      for (const field of fields) {
        const descriptor = Object.getOwnPropertyDescriptor(item, field);
        if (
          !descriptor?.enumerable ||
          !("value" in descriptor) ||
          typeof descriptor.value !== "string" ||
          !valuePattern.test(descriptor.value)
        )
          return false;
      }
      if (ids.has(item.id)) return false;
      ids.add(item.id);
    }
    return (
      new TextEncoder().encode(JSON.stringify(items)).byteLength <=
      WARDROBE_MAX_BYTES
    );
  } catch {
    return false;
  }
}
