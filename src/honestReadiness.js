export const READINESS_STATES = Object.freeze({
  INSUFFICIENT: "insufficient_items",
  READY: "ready_to_build",
  DEMO: "demo_example",
  PERSONAL: "personal_result",
  ERROR: "error",
});

export const READINESS_COPY = Object.freeze({
  insufficient_items: {
    eyebrow: "Личный гардероб",
    title: "Пока недостаточно вещей",
    body: "Добавьте верх и низ или платье, а также обувь. Мы не будем выдавать демо за ваш образ.",
    action: "Добавить вещи",
  },
  ready_to_build: {
    eyebrow: "Можно собрать",
    title: "Вещей достаточно для личного образа",
    body: "Образ будет составлен только из вещей, которые вы добавили в гардероб.",
    action: "Собрать из моих вещей",
  },
  demo_example: {
    eyebrow: "Демо-гардероб",
    title: "Теперь попробуйте со своей вещью",
    body: "Добавьте одну любимую вещь — стилист покажет, с чем носить именно её.",
    action: "Добавить свою вещь",
  },
  personal_result: {
    eyebrow: "Личный образ",
    title: "Собрано из ваших вещей",
    body: "Все вещи в этом образе взяты из вашего гардероба на этом устройстве.",
    action: "Собрать другой образ",
  },
  error: {
    eyebrow: "Не удалось собрать",
    title: "Личный образ не готов",
    body: "Произошла ошибка. Демо не было подставлено вместо результата.",
    action: "Попробовать снова",
  },
});

const cleanId = (value) => String(value ?? "").trim();
const itemIds = (items) => (Array.isArray(items) ? items : []).map((item) => cleanId(item?.id)).filter(Boolean);

export function createReadinessState(kind, details = {}) {
  if (!Object.values(READINESS_STATES).includes(kind)) throw new TypeError("unknown readiness state");
  const state = { kind, ...details };
  if (kind === READINESS_STATES.DEMO) {
    state.items = (details.items || []).map((item) => ({ ...item, source: "demo" }));
    state.result = null;
  }
  if (kind === READINESS_STATES.PERSONAL) {
    const wardrobe = Array.isArray(details.wardrobe) ? details.wardrobe : [];
    const wardrobeIds = new Set(itemIds(wardrobe.filter((item) => item?.source === "personal")));
    const resultItems = Array.isArray(details.result?.items) ? details.result.items : [];
    if (!resultItems.length || resultItems.some((item) => item?.source !== "personal" || !wardrobeIds.has(cleanId(item?.id)))) {
      return createReadinessState(READINESS_STATES.ERROR, { reason: "unverified_personal_result" });
    }
    state.result = { ...details.result, kind: "personal", items: resultItems.map((item) => ({ ...item })) };
    delete state.wardrobe;
  }
  return state;
}

export function readinessFromWardrobe({ wardrobe = [], canBuild = false } = {}) {
  const personalItems = wardrobe.filter((item) => item?.source === "personal");
  return createReadinessState(canBuild && personalItems.length ? READINESS_STATES.READY : READINESS_STATES.INSUFFICIENT, {
    itemCount: personalItems.length,
  });
}

export function transitionReadiness(state, event) {
  switch (event?.type) {
    case "WARDROBE_CHECKED":
      return readinessFromWardrobe(event);
    case "SHOW_DEMO":
      return createReadinessState(READINESS_STATES.DEMO, { items: event.items || [] });
    case "PERSONAL_BUILT":
      return createReadinessState(READINESS_STATES.PERSONAL, { wardrobe: event.wardrobe, result: event.result });
    case "BUILD_FAILED":
      return createReadinessState(READINESS_STATES.ERROR, { reason: cleanId(event.reason) || "build_failed" });
    case "RETRY":
      return state?.kind === READINESS_STATES.ERROR
        ? readinessFromWardrobe({ wardrobe: event.wardrobe, canBuild: event.canBuild })
        : state;
    default:
      return state;
  }
}

export function readinessView(state) {
  const kind = Object.values(READINESS_STATES).includes(state?.kind) ? state.kind : READINESS_STATES.ERROR;
  return { kind, ...READINESS_COPY[kind], isDemo: kind === READINESS_STATES.DEMO, isPersonal: kind === READINESS_STATES.PERSONAL };
}
