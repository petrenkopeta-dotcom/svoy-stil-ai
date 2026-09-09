import {
  createGarmentStyleFeatures,
  garmentFeaturesFromLegacyCard,
  parseStylistEntity,
} from "./stylistReasoningSchemas.js";

export const GARMENT_FEATURES_FIELD = "stylist_features";

export const GARMENT_LABELS_RU = Object.freeze({
  pattern: "Принт",
  texture: "Фактура",
  fit: "Посадка",
  volume: "Объём",
  length: "Длина",
  seasons: "Сезон",
});

const VALUES_RU = Object.freeze({
  unknown: "Не указано",
  solid: "Однотонная",
  stripe: "Полоска",
  check: "Клетка",
  floral: "Цветочный",
  animal: "Анималистичный",
  geometric: "Геометрический",
  logo: "С логотипом",
  abstract: "Абстрактный",
  other: "Другой",
  smooth: "Гладкая",
  soft: "Мягкая",
  ribbed: "Рубчик",
  chunky: "Крупная вязка",
  fuzzy: "Ворсистая",
  sheer: "Прозрачная",
  structured: "Формоустойчивая",
  glossy: "Глянцевая",
  matte: "Матовая",
  fitted: "По фигуре",
  straight: "Прямая",
  relaxed: "Свободная",
  oversized: "Оверсайз",
  a_line: "А-силуэт",
  bodycon: "Облегающая",
  wide: "Широкая",
  tapered: "Зауженная",
  close: "Прилегающий",
  regular: "Обычный",
  voluminous: "Объёмный",
  cropped: "Укороченная",
  mini: "Мини",
  short: "Короткая",
  midi: "Миди",
  maxi: "Макси",
  ankle: "До щиколотки",
  full: "Полная",
  not_applicable: "Не применимо",
  spring: "Весна",
  summer: "Лето",
  autumn: "Осень",
  winter: "Зима",
  all_season: "Всесезонная",
});

export const garmentValueRu = (value) => VALUES_RU[value] ?? value;

export function featuresForGarmentCard(card) {
  const stored = card?.[GARMENT_FEATURES_FIELD];
  if (stored != null) return parseStylistEntity(stored);
  return garmentFeaturesFromLegacyCard(card);
}

export function updateGarmentCardFeatures(card, patch) {
  const current = featuresForGarmentCard(card);
  const next = createGarmentStyleFeatures({
    ...current,
    ...patch,
    garment_id: String(card.id),
    revision: current.revision + 1,
  });
  return { ...card, [GARMENT_FEATURES_FIELD]: next };
}

export function garmentCardView(card) {
  const features = featuresForGarmentCard(card);
  return {
    id: card.id,
    title: card.name,
    type: card.type,
    style: card.style,
    features,
    suggestions: ["pattern", "texture", "fit", "volume", "length", "seasons"].map((key) => ({
      key,
      label: GARMENT_LABELS_RU[key],
      value: Array.isArray(features[key])
        ? features[key].map(garmentValueRu).join(", ")
        : garmentValueRu(features[key]),
    })),
  };
}
