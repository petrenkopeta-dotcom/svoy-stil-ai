const f = (value, score = .9) => ({ value, visible: true, score, evidence: [`visible ${value}`] });
const region = (id, category, color, material, silhouette, crop, extra = {}) => ({ id, crop, visibility: "full", observations: { category: f(category), color: f(color), material: f(material), silhouette: f(silhouette) }, ...extra });

export const REFERENCE_GOLDEN_CASES = Object.freeze([
  { id: "layered-business", regions: [region("blazer", "outerwear", "navy", "woven", "tailored", { x: .15, y: .08, width: .7, height: .62 }), region("shirt", "top", "white", "unknown", "regular", { x: .31, y: .16, width: .38, height: .38 }, { visibility: "occluded", occlusion: ["blazer"] }), region("trousers", "bottom", "navy", "woven", "straight", { x: .24, y: .55, width: .52, height: .44 })] },
  { id: "light-smart-casual-hidden-shoes", regions: [region("light-top", "top", "cream", "knit", "relaxed", { x: .2, y: .08, width: .6, height: .48 }), region("light-bottom", "bottom", "beige", "woven", "straight", { x: .25, y: .48, width: .5, height: .51 })] },
  { id: "blue-shirt-chocolate-skirt", regions: [region("blue-shirt", "top", "light_blue", "woven", "regular", { x: .2, y: .08, width: .6, height: .48 }), region("chocolate-skirt", "bottom", "chocolate", "woven", "a_line", { x: .22, y: .46, width: .56, height: .53 })] },
  { id: "tee-jeans-accent-bag-no-shoes", regions: [region("tee", "top", "white", "jersey", "regular", { x: .18, y: .05, width: .56, height: .43 }), region("jeans", "bottom", "blue", "denim", "straight", { x: .21, y: .42, width: .5, height: .57 }, { visibility: "cropped" }), region("bag", "bag", "red", "leather_like", "structured", { x: .7, y: .34, width: .24, height: .28 })] },
]);
