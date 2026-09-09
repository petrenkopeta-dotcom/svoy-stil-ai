import { itemKind } from "./outfitEngine.js";
import { composeOutfitV2 } from "./outfitV2Composer.js";
import { adaptGarmentsToReasoningInput } from "./garmentReasoningAdapter.js";
import { runStylistReasoningPipeline } from "./stylistReasoningPipeline.js";
import { explainPersonalOutfitV2 } from "./outfitExplanationV2.js";

export const OUTFIT_V2_APP_ADAPTER_VERSION = "outfit-v2-app-adapter/1.0.0";

export function composePersonalLooksV2({ items, ownerScope, anchorId = null, occasion = null, context = {} } = {}) {
  const personal = Array.isArray(items) ? items.filter((item) => item?.source === "personal") : [];
  const wardrobe = personal.map((item) => ({
    ...item,
    id: String(item.id),
    category: itemKind(item) === "layer" ? "outerwear" : itemKind(item),
    mode: "personal",
    ownerScope,
    status: item.confirmed === true ? "ready" : "unready",
    confirmed: item.confirmed === true,
    occasions: [],
    confirmedFacts: item.confirmedFacts || {},
  }));
  const composition = composeOutfitV2({
    mode: "personal", ownerScope, wardrobe,
    anchorId: anchorId == null ? null : String(anchorId),
    context: occasion ? { confirmed: true, occasion } : { confirmed: false },
    constraints: {},
  });
  const byId = new Map(personal.map((item) => [String(item.id), item]));
  const wardrobeIds = wardrobe.filter((item) => item.confirmed === true).map((item) => item.id);
  const looks = composition.variants.map((variant) => {
    const lookItems = variant.itemIds.map((id) => byId.get(id)).filter(Boolean);
    const adapted = adaptGarmentsToReasoningInput(lookItems);
    const facts = runStylistReasoningPipeline({ ...adapted, context: { ...adapted.context, context } }).facts
      .map((fact) => ({ code: fact.code, confirmed: true, item_ids: variant.itemIds }));
    return {
      items: lookItems,
      signature: variant.signature,
      variantId: variant.variantId,
      explanationV2: explainPersonalOutfitV2({ source: "personal", outfitId: variant.variantId, outfitItemIds: variant.itemIds, personalWardrobeItemIds: wardrobeIds, facts }),
    };
  });
  return { version: OUTFIT_V2_APP_ADAPTER_VERSION, ...composition, looks };
}
