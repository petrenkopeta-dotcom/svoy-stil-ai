import React, { useState } from "react";
import { garmentCardView, garmentValueRu, updateGarmentCardFeatures } from "./garmentCardAdapter.js";

const OPTIONS = {
  pattern: ["unknown", "solid", "stripe", "check", "floral", "animal", "geometric", "logo", "abstract", "other"],
  texture: ["unknown", "smooth", "soft", "ribbed", "chunky", "fuzzy", "sheer", "structured", "glossy", "matte", "other"],
  fit: ["unknown", "fitted", "straight", "relaxed", "oversized", "a_line", "bodycon", "wide", "tapered", "other"],
  volume: ["unknown", "close", "regular", "relaxed", "voluminous"],
  length: ["unknown", "cropped", "mini", "short", "regular", "midi", "maxi", "ankle", "full", "not_applicable"],
  seasons: ["all_season", "spring", "summer", "autumn", "winter"],
};

export function GarmentStyleHints({ item, onChange }) {
  const view = garmentCardView(item);
  const [draft, setDraft] = useState(view.features);
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: key === "seasons" ? [value] : value }));
  return <details className="style-hints" onClick={(event) => event.stopPropagation()}>
    <summary>AI-подсказки · проверьте</summary>
    <p>Это черновик признаков вещи. Исправьте, если нужно.</p>
    {view.suggestions.map(({ key, label }) => <label key={key}>
      {label}
      <select value={key === "seasons" ? draft[key][0] : draft[key]} onChange={(event) => set(key, event.target.value)}>
        {OPTIONS[key].map((value) => <option key={value} value={value}>{garmentValueRu(value)}</option>)}
      </select>
    </label>)}
    <button type="button" onClick={() => onChange(updateGarmentCardFeatures(item, draft))}>Сохранить подсказки</button>
  </details>;
}
