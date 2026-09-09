import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleHelp, Clock, CloudSun, Heart, History, Plus, RotateCcw, ShieldCheck, Sparkles, ThumbsDown, Upload, UserRound, WandSparkles, X } from "lucide-react";
import "./styles.css";
import { generateOutfits, missingCategories, missingCategoriesForAnchor } from "./outfitEngine";
import { applyUiLearning, createUiLearningProfile, learningProposal as makeLearningProposal, normalizeUiLearningProfile, rejectionLabels, uiLearningEtag, uiLearningRankingContext, undoUiLearning } from "./stylistLearningAdapter";
import { GarmentStyleHints } from "./GarmentStyleHints";
import { createStylistActionController, STYLIST_ACTION_COPY } from "./stylistActionController";
import { StylistExplanationCard } from "./StylistExplanationCard.js";
import { runStylistReasoningPipeline } from "./stylistReasoningPipeline.js";
import { adaptGarmentsToReasoningInput } from "./garmentReasoningAdapter.js";
import { PhotoIntake } from "./PhotoIntake.jsx";
import { ContextProvider, useStylistContext } from "./ContextProvider.jsx";
import { createLocalRepositories } from "./storageRepositories.js";
import { createDemoState } from "./demoPersonalFlow.js";
import { createOnboardingPreferencesPersistence } from "./onboardingPreferencesPersistence.js";
import { LocalWarmProfilePanel } from "./LocalWarmProfilePanel.jsx";
import { OnboardingChoice } from "./OnboardingChoice.js";
import { OnboardingWizard } from "./OnboardingWizard.jsx";
import { AccessibleDialog } from "./AccessibleDialog.js";
import { createOnboardingTransitionGuard, toggleOnboardingLimit, updateOnboardingPreference } from "./onboardingRuntime.js";
import { createOnboardingCompletionBoundary } from "./onboardingCompletionBoundary.js";
import { createOnboardingActivationFlow } from "./onboardingActivationFlow.js";
import { createReturningUserActivation } from "./returningUserActivation.js";
import { createPrivacyDataController } from "./privacyDataController.js";
import { PrivacyDataControls } from "./PrivacyDataControls.jsx";
import { createObjectUrlRegistry } from "./storageRepositories.js";
import { createPhotoStorage, dataUrlToBlob, PHOTO_POLICY_VERSION } from "./photoStorage.js";
import { HonestReadinessCard } from "./HonestReadinessCard.jsx";
import { readinessFromWardrobe, transitionReadiness } from "./honestReadiness.js";
import { DeleteGarmentDialog, WardrobeTabs } from "./WardrobeAccessibility.jsx";
import { FirstOnboardingResult } from "./FirstOnboardingResult.jsx";
import { createFirstOnboardingResult, FIRST_RESULT_ACTIONS, FIRST_RESULT_SCREEN } from "./firstOnboardingResult.js";
import { WeatherContextEditor } from "./WeatherContextEditor.jsx";
import { LocalProfileEntry } from "./LocalProfileEntry.jsx";
import { loadProfileAvatar, saveProfileAvatar } from "./profileAvatar.js";
import { ShoppingFlowPanel } from "./ShoppingFlowPanel.jsx";
import { createShoppingFlowController } from "./shoppingFlowController.js";
import { AuthDialog } from "./AuthDialog.jsx";
import { createAuthRepository } from "./auth/AuthRepository.js";
import { AUTH_STATES, unavailableAuthPort } from "./auth/AuthPort.js";
import { createSupabaseAuthAdapter, supabaseAuthConfigFromEnv } from "./auth/SupabaseAuthAdapter.js";
import { createBffAuthAdapter } from "./auth/BffAuthAdapter.js";
import { createAuthGate } from "./authGate.js";
import { AccountProfilePanel } from "./AccountProfilePanel.jsx";
import { catalogForAuth, screenForAuth } from "./authScreenPolicy.js";
import { diagnoseAuthConfig } from "./auth/authConfig.js";
import { createAccountDeletionController } from "./account/AccountDeletionController.js";
import { unavailableAccountPort } from "./account/AccountPort.js";
import { createSupabaseAccountAdapter } from "./account/SupabaseAccountAdapter.js";
import { GuestAvatarPreview } from "./GuestAvatarPreview.jsx";
import { rankDemoLooksFromOnboarding } from "./onboardingFirstLookEngine.js";
import { saveLocally } from "./persistenceState.js";
import { PersistenceStatus } from "./PersistenceStatus.jsx";
import { telemetry } from "./telemetry/runtime.js";
import { PilotMetricsPanel } from "./telemetry/PilotMetricsPanel.jsx";
import { createAuthenticatedPersistence } from "./persistence/createAuthenticatedPersistence.js";
import { createRuntimePersistence } from "./persistence/runtimePersistence.js";
import { catalogForLocalPilot, isLocalCapsuleEnabled, isLocalPilotPhotoEnabled, runAddGarmentEntry } from "./localPilotPolicy.js";
import { ProductTour } from "./ProductTour.jsx";
import { completeProductTour, navigationDecision, shouldShowProductTour } from "./productTour.js";
import { CapsuleExperience } from "./CapsuleExperience.jsx";
import { composePersonalLooksV2 } from "./outfitV2AppAdapter.js";
import "./OutfitV2.css";
import { ReferenceExperience } from "./ReferenceExperience.jsx";
import { referenceAnalyticsEvent } from "./referenceWorkflow.js";
import { cropAlphaBlob, cropReferenceBlob } from "./referenceCrop.js";

const demo = [
  {
    id: 1,
    name: "Белая рубашка",
    type: "Верх",
    color: "Белый",
    style: "smart casual · minimal",
    emoji: "♙",
  },
  {
    id: 2,
    name: "Чёрные брюки",
    type: "Низ",
    color: "Чёрный",
    style: "smart casual · minimal",
    emoji: "╱",
  },
  {
    id: 3,
    name: "Чёрные лоферы",
    type: "Обувь",
    color: "Чёрный",
    style: "smart casual",
    emoji: "◒",
  },
  {
    id: 4,
    name: "Бежевый тренч",
    type: "Верхний слой",
    color: "Бежевый",
    style: "old money · minimal",
    emoji: "⌁",
  },
  {
    id: 5,
    name: "Структурная сумка",
    type: "Аксессуар",
    color: "Чёрный",
    style: "old money",
    emoji: "▱",
  },
  {
    id: 6,
    name: "Голубые джинсы",
    type: "Низ",
    color: "Голубой",
    style: "casual",
    emoji: "Ⅱ",
  },
  {
    id: 7,
    name: "Бежевый свитер",
    type: "Верх",
    color: "Бежевый",
    style: "casual · minimal",
    emoji: "◇",
  },
  {
    id: 8,
    name: "Белые кеды",
    type: "Обувь",
    color: "Белый",
    style: "casual · sporty",
    emoji: "◓",
  },
  {
    id: 9,
    name: "Чёрная юбка миди",
    type: "Низ",
    color: "Чёрный",
    style: "feminine · minimal",
    emoji: "▽",
  },
].map((item) => ({ ...item, source: "demo" }));

const isDemoGarment = (item) => item?.source === "demo";
const normalizeWardrobeSource = (items) =>
  items.map((item) => {
    if (item?.source === "demo" || item?.source === "personal") return item;
    const authoredDemo = demo.some((candidate) => candidate.id === item?.id && candidate.name === item?.name);
    return { ...item, source: authoredDemo ? "demo" : "personal" };
  });

const repositories = createLocalRepositories();
const onboardingPreferences = createOnboardingPreferencesPersistence();
const returningUser = createReturningUserActivation();
const photoStorage = createPhotoStorage();
const objectUrlRegistry = createObjectUrlRegistry();
const privacyController = createPrivacyDataController({
  repositories,
  onboardingPersistence: onboardingPreferences,
  photoStorage,
  objectUrlRegistry,
});
const onboardingCompletion = createOnboardingCompletionBoundary({
  preferencesPersistence: onboardingPreferences,
});
const demoExperience = createDemoState({
  sessionId: "closed-alpha",
  items: demo,
});
const options = {
  goal: ["Работа", "Встреча", "Прогулка", "Свидание", "Учёба", "Мероприятие"],
  style: ["Smart casual", "Casual", "Feminine", "Minimal", "Old money", "Sporty", "Romantic"],
  mood: ["Уверенно", "Спокойно", "Ярко", "Дорого", "Удобно"],
  limits: ["Без каблуков", "Не хочу яркое", "Скрыть живот", "Выглядеть выше", "Выглядеть строже"],
};
const defaults = {
  goal: "Работа",
  style: "Smart casual",
  mood: "Уверенно",
  limits: ["Без каблуков"],
  temp: "Астрахань · +18°",
};
function App() {
  const stylistContext = useStylistContext();
  const localPilotPhoto = isLocalPilotPhotoEnabled({ flag: import.meta.env.VITE_LOCAL_PILOT_PHOTO, hostname: globalThis.location?.hostname });
  const localCapsule = isLocalCapsuleEnabled({ flag: import.meta.env.VITE_CAPSULE_LOCAL_PILOT, hostname: globalThis.location?.hostname });
  const [initialOnboarding] = useState(() => onboardingPreferences.begin(defaults));
  const [initialProgress] = useState(() => onboardingPreferences.beginProgress());
  const [activation] = useState(() =>
    returningUser.bootstrap({
      preferences: initialOnboarding.preferences,
      progress: initialProgress,
    }),
  );
  const [started, setStartedState] = useState(activation.progress.started),
    [screen, setScreenState] = useState(activation.progress.screen),
    [prefs, setPrefsState] = useState(activation.preferences),
    [rememberPrefs, setRememberPrefs] = useState(initialOnboarding.consented),
    [wardrobe, setWardrobe] = useState(() => normalizeWardrobeSource(repositories.wardrobe.load().data)),
    [catalogMode, setCatalogMode] = useState(() => repositories.wardrobe.load().data.length ? "personal" : "demo"),
    [saved, setSaved] = useState(() => repositories.outfits.load().data),
    [learningProfile, setLearningProfile] = useState(() => normalizeUiLearningProfile(repositories.learningProfile.load().data)),
    [feedback, setFeedback] = useState(false),
    [learningProposal, setLearningProposal] = useState(null),
    [notice, setNotice] = useState(""),
    [variant, setVariant] = useState(0),
    [add, setAdd] = useState(false),
    [addAsAnchor, setAddAsAnchor] = useState(false),
    [referenceOpen, setReferenceOpen] = useState(false),
    [anchorId, setAnchorId] = useState(null),
    [actionCandidate, setActionCandidate] = useState(null),
    [actionResult, setActionResult] = useState(null),
    [actionLoading, setActionLoading] = useState(false),
    [onboardingComplete, setOnboardingComplete] = useState(activation.completed),
    [tourOpen, setTourOpen] = useState(() => activation.completed && shouldShowProductTour()),
    [profileOpen, setProfileOpen] = useState(false),
    [guestProfileOpen, setGuestProfileOpen] = useState(false),
    [profileAvatar, setProfileAvatar] = useState(() => loadProfileAvatar()),
    [contextOpen, setContextOpen] = useState(false),
    [shoppingOpen, setShoppingOpen] = useState(false),
    [firstResult, setFirstResult] = useState(null),
    [authOpen, setAuthOpen] = useState(false),
    [authReady, setAuthReady] = useState(false),
    [authState, setAuthState] = useState({
      status: AUTH_STATES.SIGNED_OUT,
      email: null,
      session: null,
    }),
    [accountDeleteState, setAccountDeleteState] = useState({
      status: "unavailable",
      receipt: null,
      error: null,
    }),
    [persistenceResult, setPersistenceResult] = useState(null),
    [actionController] = useState(() => createStylistActionController());
  const authStateRef = useRef(authState);
  authStateRef.current = authState;
  const pendingPersonalAction = useRef(null);
  const preferenceRetryRef = useRef(null);
  const preferenceQuickEditGuardRef = useRef(null);
  const [authConfig] = useState(() => supabaseAuthConfigFromEnv(import.meta.env));
  const [authDiagnostics] = useState(() => diagnoseAuthConfig(authConfig));
  const [authTransport] = useState(() => (import.meta.env.VITE_AUTH_TRANSPORT === "bff" ? "bff" : "direct"));
  const [authProvider] = useState(() => (authTransport === "bff" ? createBffAuthAdapter() : authDiagnostics.configured ? createSupabaseAuthAdapter(authConfig) : null));
  const [providerStatus, setProviderStatus] = useState(() => (authTransport === "bff" ? "checking" : authProvider ? "available" : "unavailable"));
  const [authRepository] = useState(() =>
    createAuthRepository({
      port: authProvider || unavailableAuthPort(),
      onChange: setAuthState,
    }),
  );
  const [cloudPersistence] = useState(() => createAuthenticatedPersistence({ authProvider }));
  const [runtimePersistence] = useState(() =>
    createRuntimePersistence({
      cloudRepository: cloudPersistence,
      getAuthState: () => authStateRef.current,
      onResult: setPersistenceResult,
    }),
  );
  const [accountPort] = useState(() =>
    authProvider?.authenticatedRequest
      ? createSupabaseAccountAdapter({
          authenticatedRequest: authProvider.authenticatedRequest,
        })
      : unavailableAccountPort(),
  );
  const [accountDeletion] = useState(() =>
    createAccountDeletionController({
      port: accountPort,
      onChange: setAccountDeleteState,
    }),
  );
  const authGate = useRef(null);
  if (!authGate.current)
    authGate.current = createAuthGate({
      getAuthState: () => authStateRef.current,
      requestAuthentication: (request) => {
        pendingPersonalAction.current = request.callback;
        setAuthOpen(true);
      },
    });
  const requireAuth = (action, callback) => {
    if (authStateRef.current.status !== AUTH_STATES.AUTHENTICATED) telemetry.emit("auth_gate_shown", { action });
    return authGate.current(action, callback);
  };
  const openAddGarment = () => {
    setCatalogMode("personal");
    if (wardrobe.some((item) => item.source === "personal")) telemetry.emit("second_item_intent", { action: "add" });
    return runAddGarmentEntry({ localPilot: localPilotPhoto, requireAuth, open: () => setAdd(true) });
  };
  const wardrobeRef = useRef(wardrobe);
  wardrobeRef.current = wardrobe;
  const shoppingControllerRef = useRef(null);
  if (!shoppingControllerRef.current) {
    const categoryLabels = {
      top: "Верх",
      bottom: "Низ",
      dress: "Платье",
      outerwear: "Верхний слой",
      shoes: "Обувь",
      accessory: "Аксессуар",
    };
    shoppingControllerRef.current = createShoppingFlowController({
      getPersonalWardrobe: () => wardrobeRef.current.filter((item) => item.source === "personal"),
      savePersonalGarment: async (garment) => {
        const savedGarment = {
          ...garment,
          type: garment.type || categoryLabels[garment.category] || garment.category,
          emoji: garment.emoji || "◇",
        };
        const next = [...wardrobeRef.current.filter((item) => item.source === "personal"), savedGarment];
        const persistence = await runtimePersistence.persist({
          domain: "wardrobe",
          localRepository: repositories.wardrobe,
          value: next,
          entityId: savedGarment.id,
          idempotencyKey: `shopping:${savedGarment.id}`,
        });
        if (!persistence.evidence.durable) throw new Error(persistence.error || "wardrobe_save_failed");
        setWardrobe(next);
        return savedGarment;
      },
    });
  }
  const landingTransition = useRef(createOnboardingTransitionGuard());
  const activationFlow = useRef(null);
  if (!activationFlow.current) {
    activationFlow.current = createOnboardingActivationFlow({
      completionBoundary: onboardingCompletion,
      onLocalComplete: (command) => {
        returningUser.complete(command);
        setPrefs(command.preferences);
        setRememberPrefs(command.rememberPreferences);
        const personalization = rankDemoLooksFromOnboarding(demo, command.preferences);
        const result = createFirstOnboardingResult({
          preferences: command.preferences,
          outfit: {
            id: `closed-alpha-first-demo:${personalization.candidates[0]?.signature || "fallback"}`,
            items: personalization.candidates[0]?.items || demo,
          },
          explanation: personalization.explanation,
          decisionLinks: personalization.decisionLinks,
          limitations: personalization.limitations,
        });
        setFirstResult(result);
        setScreen(FIRST_RESULT_SCREEN);
      },
    });
  }
  const setPrefs = (next) => {
    setPrefsState((current) => {
      const value = typeof next === "function" ? next(current) : next;
      onboardingPreferences.update(value);
      return value;
    });
  };
  const setStarted = (value) => {
    onboardingPreferences.updateProgress({ started: value });
    returningUser.updateProgress({ started: value });
    setStartedState(value);
  };
  const setScreen = (value) => {
    onboardingPreferences.updateProgress({ screen: value });
    returningUser.updateProgress({ screen: value });
    setScreenState(value);
  };
  useEffect(() => {
    const returnBucket = telemetry.returnBucket();
    telemetry.emit("app_started", { entry: activation.completed ? "returning" : "landing" }, { idempotencyKey: `app-start:${Date.now()}` });
    if (returnBucket) telemetry.emit("session_returned", { day_bucket: returnBucket }, { idempotencyKey: `session-return:${returnBucket}:${new Date().toISOString().slice(0, 10)}` });
  }, []);
  useEffect(() => {
    const sync = (e) => setWardrobe(e.detail);
    window.addEventListener("atelier-wardrobe-change", sync);
    return () => window.removeEventListener("atelier-wardrobe-change", sync);
  }, []);
  useEffect(() => {
    let cancelled = false;
    photoStorage.deleteExpired().catch(() => {});
    Promise.all(
      wardrobe.map(async (item) => {
        if (!item.photoId || item.photo) return item;
        try {
          const record = await photoStorage.get(item.photoId);
          return {
            ...item,
            photo: objectUrlRegistry.create(item.photoId, record.blob),
          };
        } catch {
          return item;
        }
      }),
    ).then((items) => {
      if (!cancelled && items.some((item, index) => item !== wardrobe[index])) setWardrobe(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => () => objectUrlRegistry.dispose(), []);
  useEffect(() => {
    const updatePersistence = (event) => setPersistenceResult(event.detail);
    window.addEventListener("atelier-persistence", updatePersistence);
    return () => window.removeEventListener("atelier-persistence", updatePersistence);
  }, []);
  useEffect(() => {
    void authRepository.restore().finally(() => setAuthReady(true));
  }, []);
  useEffect(() => {
    if (authTransport !== "bff") return;
    let active = true;
    authProvider
      .probe()
      .then(() => {
        if (active) setProviderStatus("available");
      })
      .catch(() => {
        if (active) setProviderStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    setAccountDeleteState(accountDeletion.getState());
  }, []);
  useEffect(() => {
    if (authReady) setScreenState((current) => localPilotPhoto ? current : screenForAuth(current, authState));
  }, [authReady, authState.status, localPilotPhoto]);
  useEffect(() => {
    if (add) telemetry.emit("first_item_started", { source: "manual" }, { idempotencyKey: `first-item-start:${Date.now()}` });
  }, [add]);
  useEffect(() => {
    if (screen === FIRST_RESULT_SCREEN && firstResult)
      telemetry.emit(
        "first_result_shown",
        {
          result_kind: firstResult.outfit?.kind === "demo" ? "demo" : "personal",
        },
        {
          idempotencyKey: `first-result:${firstResult.outfit?.id || "unknown"}`,
        },
      );
  }, [screen, firstResult]);
  useEffect(() => {
    if (!authReady) return;
    if (authState.status === AUTH_STATES.AUTHENTICATED)
      telemetry.emit(
        "session_restored",
        {},
        {
          idempotencyKey: `session-restored:${authState.session?.userId || "local"}`,
        },
      );
    else if (authState.status === AUTH_STATES.SESSION_EXPIRED) telemetry.emit("session_revoked", { reason: "expired" }, { idempotencyKey: "session-expired" });
  }, [authReady, authState.status]);
  const toast = (t) => {
    setNotice(t);
    setTimeout(() => setNotice(""), 2200);
  };
  const localCatalog = catalogMode === "demo"
    ? (wardrobe.filter(isDemoGarment).length ? wardrobe.filter(isDemoGarment) : demo)
    : wardrobe.filter((item) => !isDemoGarment(item));
  const selected = catalogForLocalPilot({ localPilot: localPilotPhoto, personal: localCatalog.length ? localCatalog : (catalogMode === "demo" ? demo : []), fallback: catalogForAuth(wardrobe.filter((item) => !isDemoGarment(item)), demo, authState) });
  const navigate = (value) => {
    if (value === "capsules" && localCapsule) return setScreen("capsules");
    const decision = navigationDecision({ destination: value, localPilot: localPilotPhoto, onboardingComplete, hasFirstResult: Boolean(firstResult) });
    if (decision.type === "screen") setScreen(decision.screen);
    else requireAuth(decision.action, () => setScreen(decision.screen));
  };
  const anchor = selected.find((item) => item.id === anchorId) || null;
  const recommendationSequence = learningProfile.events?.filter((event) => event.type === "recommendation_feedback").length || 0;
  const learningContext = uiLearningRankingContext(learningProfile, recommendationSequence + 1);
  const personalV2 = selected.length && selected.every((item) => item.source === "personal")
    ? composePersonalLooksV2({ items: selected, ownerScope: authState.session?.userId || "local-device-owner", anchorId, occasion: prefs.goal, context: stylistContext.context })
    : null;
  const looks = personalV2 ? personalV2.looks : generateOutfits(selected, prefs, saved, anchorId, learningContext);
  const look = looks[variant % Math.max(1, looks.length)];
  const activeLook = actionCandidate || look;
  const outfit = activeLook?.items || [];
  outfit.signature = activeLook?.signature || "";
  useEffect(() => {
    if (screen === "look" && outfit.length) telemetry.emit("look_generated", { confidence_bucket: "unknown" }, { idempotencyKey: `look:${outfit.signature}` });
  }, [screen, outfit.signature]);
  const runStylistAction = async (action) => {
    if (actionLoading || !outfit.length) return;
    setActionLoading(true);
    setActionResult(null);
    const currentCandidate = {
      signature: outfit
        .map((item) => String(item.garment_id ?? item.id))
        .sort()
        .join("|"),
      items: outfit,
    };
    const result = await actionController.dispatch({
      action,
      wardrobe: selected,
      request: {
        anchorId,
        occasion: prefs.goal,
        preferences: { styleTags: [prefs.style] },
        limit: 50,
      },
      currentCandidate,
    });
    if (result.status === "changed") setActionCandidate(result.candidate);
    setActionResult(result);
    setActionLoading(false);
  };
  const startLearning = (kind, reason, afterAction) => {
    if (authStateRef.current.status !== AUTH_STATES.AUTHENTICATED) return requireAuth("learning", () => startLearning(kind, reason, afterAction));
    const outfitId = outfit.signature || `variant-${variant}`;
    setLearningProposal({
      ...makeLearningProposal(kind, {
        reason,
        outfitId,
        idempotencyKey: `${kind}-${outfitId}-${Date.now()}`,
        subject: { itemIds: outfit.map((item) => String(item.id)) },
        replaceItemId: kind === "replacement" ? String(outfit[0]?.id || "") : null,
        recommendationSequence: recommendationSequence + 1,
      }),
      afterAction,
    });
  };
  const saveLook = async (rating = "Сохранено") => {
    if (authStateRef.current.status !== AUTH_STATES.AUTHENTICATED) return requireAuth("save_outfit", () => saveLook(rating));
    if (!outfit.length) return toast(`Не хватает: ${missingCategories(selected).join(", ")}`);
    if (outfit.some(isDemoGarment)) return toast("Демо-образ не сохраняется в личную историю");
    const entry = {
      id: Date.now(),
      variant,
      signature: outfit.signature,
      date: new Date().toLocaleString("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }),
      goal: prefs.goal,
      rating,
      items: outfit.map((x) => x.name),
      pieceIds: outfit.map((x) => x.id),
    };
    const next = [entry, ...saved];
    const persistence = await runtimePersistence.persist({
      domain: "outfits",
      localRepository: repositories.outfits,
      value: next,
      entityId: entry.id,
      idempotencyKey: `outfit:${entry.id}`,
    });
    if (!persistence.evidence.durable) return;
    setSaved(next);
    toast(rating === "Нравится" || rating === "Надела бы" ? "Добавлено в любимое" : persistence.state === "saved_cloud_verified" ? "Образ сохранён в аккаунте" : "Образ сохранён в истории на этом устройстве");
  };
  if (!started)
    return (
      <>
        <Landing
          onStart={() => {
            landingTransition.current.run(() => {
              telemetry.emit("onboarding_started", {}, { idempotencyKey: `onboarding-start:${Date.now()}` });
              setStarted(true);
              setScreen("test");
            });
          }}
        />
        <PilotMetricsPanel collector={telemetry} />
      </>
    );
  return (
    <div className="app">
      {!authReady && (
        <div className="auth-restore-status" role="status" aria-live="polite">
          Восстанавливаем защищённую сессию…
        </div>
      )}
      {authReady && authState.status === AUTH_STATES.SESSION_EXPIRED && (
        <div className="auth-restore-status" role="status">
          Сессия истекла. Личные данные скрыты — войдите снова.
        </div>
      )}
      <Header screen={screen} setScreen={navigate} weather={stylistContext.labels.weather} profileAvatar={profileAvatar} openContext={() => setContextOpen(true)} openProfile={() => setGuestProfileOpen(true)} openTour={() => setTourOpen(true)} capsuleEnabled={localCapsule} />
      <PersistenceStatus result={persistenceResult} />
      <main>
        {screen === "test" && (
          <OnboardingWizard
            preferences={prefs}
            onStepCompleted={(step) => telemetry.emit("onboarding_step_completed", { step }, { idempotencyKey: `onboarding-step:${step}:${Date.now()}` })}
            onComplete={(values, consent) => {
              telemetry.emit("onboarding_completed", {}, { idempotencyKey: `onboarding-complete:${Date.now()}` });
              telemetry.emit("first_result_requested", {}, { idempotencyKey: `first-result-request:${Date.now()}` });
              void activationFlow.current.finish({
                idempotencyKey: "closed-alpha-onboarding-v1",
                preferences: values,
                rememberPreferences: consent,
              });
              setOnboardingComplete(true);
              setTourOpen(shouldShowProductTour());
            }}
          />
        )}{" "}
        {screen === FIRST_RESULT_SCREEN && firstResult && (
          <FirstOnboardingResult
            result={firstResult}
            onAction={(action) => {
              telemetry.emit("first_result_action", { action });
              if (action === FIRST_RESULT_ACTIONS.ADD_FIRST_ITEM) setReferenceOpen(true);
              else if (action === FIRST_RESULT_ACTIONS.OPEN_DEMO_WARDROBE) setScreen("wardrobe");
              else if (action === FIRST_RESULT_ACTIONS.PHOTO_IN_STORE) requireAuth("shopping", () => setShoppingOpen(true));
            }}
          />
        )}{" "}
        {screen === "wardrobe" && (
          <Wardrobe
            items={localPilotPhoto ? wardrobe : selected}
            isDemo={(!localPilotPhoto && authState.status !== AUTH_STATES.AUTHENTICATED) || !wardrobe.length}
            load={() => {
              setCatalogMode("demo");
              setWardrobe((current) => [
                ...current.filter((item) => !isDemoGarment(item)),
                ...demo.map((item) => ({ ...item, source: demoExperience.mode })),
              ]);
              toast("Открыт отдельный демонстрационный гардероб");
            }}
            next={(mode) => {
              setCatalogMode(mode);
              setAnchorId(null);
              setVariant(0);
              setScreen("look");
            }}
            openAdd={openAddGarment}
            openAnchor={() => setScreen("anchor")}
            openReference={() => setReferenceOpen(true)}
            persistItems={async (updated, operation) => {
              const persistence = await runtimePersistence.persist({ domain: "wardrobe", localRepository: repositories.wardrobe, value: updated.map(({ photo, ...item }) => photo?.startsWith?.("blob:") ? item : { ...item, photo }), entityId: operation, idempotencyKey: `wardrobe:${operation}:${Date.now()}` });
              if (!persistence.evidence.durable) throw new Error(persistence.error || "wardrobe_save_failed");
              setWardrobe(updated);
            }}
          />
        )}{" "}
        {screen === "anchor" && (
          <AnchorPicker
            items={selected}
            anchorId={anchorId}
            choose={(id) => {
              setAnchorId(id);
              setVariant(0);
              setScreen("look");
            }}
            add={() =>
              runAddGarmentEntry({ localPilot: localPilotPhoto, requireAuth, open: () => {
                setAddAsAnchor(true);
                setAdd(true);
              } })
            }
          />
        )}{" "}
        {screen === "look" && (
          <Look
            prefs={prefs}
            outfit={outfit}
            variant={variant}
            other={() => outfit.some(isDemoGarment) ? setVariant((v) => v + 1) : startLearning("replacement", null, () => setVariant((v) => v + 1))}
            save={() => saveLook("Сохранено")}
            dislike={() => setFeedback(true)}
            like={() => {
              telemetry.emit("would_wear_recorded", {
                sequence: recommendationSequence + 1,
              });
              startLearning("would_wear", null, () => saveLook("Надела бы"));
            }}
            rateExplanation={(useful) => telemetry.emit("explanation_rated", { useful }, { idempotencyKey: `explanation-rating:${outfit.signature}:${Date.now()}` })}
            anchor={anchor}
            missing={anchor ? missingCategoriesForAnchor(anchor, selected) : []}
            changeAnchor={() => setScreen("anchor")}
            wardrobe={() => setScreen("wardrobe")}
            addGarment={openAddGarment}
            stylistAction={runStylistAction}
            actionResult={actionResult}
            actionLoading={actionLoading}
            manualContext={stylistContext.context}
            learningProfile={learningProfile}
            v2Result={personalV2}
            explanationV2={activeLook?.explanationV2}
            undoLearning={() => {
              const event = [...learningProfile.events].reverse().find((item) => item.type === "recommendation_feedback" && !learningProfile.events.some((candidate) => candidate.type === "undo" && candidate.targetEventId === item.id));
              if (!event) return;
              const result = undoUiLearning(learningProfile, event.id, {
                ifMatch: uiLearningEtag(learningProfile),
                idempotencyKey: `undo-visible-${event.id}`,
              });
              if (result.ok) {
                const persistence = saveLocally(repositories.learningProfile, result.profile);
                setPersistenceResult(persistence);
                if (persistence.evidence.durable) {
                  setLearningProfile(result.profile);
                  setVariant(0);
                  toast("Изменение сохранено на этом устройстве");
                }
              }
            }}
          />
        )}{" "}
        {screen === "history" && (
          <>
            <HistoryPage saved={saved} setSaved={setSaved} catalog={selected} />
            <PrivacyDataControls
              controller={privacyController}
              onReset={() => {
                setSaved([]);
                setLearningProfile(createUiLearningProfile());
              }}
              onDelete={() => returningUser.clear()}
            />
          </>
        )}
        {localCapsule && screen === "capsules" && (
          <CapsuleExperience
            demoItems={demo}
            personalItems={wardrobe}
            personalAllowed={localPilotPhoto || authState.status === AUTH_STATES.AUTHENTICATED}
            ownerScope={authState.session?.userId || "local-device-owner"}
            occasion={prefs.goal}
            onRequestPersonal={() => requireAuth("wardrobe", () => setScreen("capsules"))}
            onWardrobe={() => setScreen("wardrobe")}
          />
        )}
      </main>
      <Nav screen={screen} setScreen={navigate} capsuleEnabled={localCapsule} />
      {tourOpen && (
        <ProductTour
          onClose={() => { completeProductTour(); setTourOpen(false); }}
          onAdd={openAddGarment}
          onContext={() => setContextOpen(true)}
          onWardrobe={() => setScreen("wardrobe")}
        />
      )}
      <WeatherContextEditor open={contextOpen} onClose={() => setContextOpen(false)} />
      {shoppingOpen && <ShoppingFlowPanel controller={shoppingControllerRef.current} onClose={() => setShoppingOpen(false)} />}
      {profileOpen && (
        <AccountProfilePanel
          email={authState.email || "Почта недоступна"}
          avatarIndex={profileAvatar}
          onAvatarChange={async (index) => {
            const previous = profileAvatar;
            const localValue = saveProfileAvatar(index);
            const result = await runtimePersistence.persist({
              domain: "profile",
              localRepository: {
                save: () => ({ meta: { schemaVersion: 1 } }),
                load: () => ({ data: { avatarIndex: localValue } }),
              },
              value: { avatarIndex: localValue },
              entityId: authState.session?.userId || "profile",
              idempotencyKey: `avatar:${authState.session?.userId}:${index}`,
            });
            if (["conflict", "retryable_error", "failed"].includes(result.state)) {
              saveProfileAvatar(previous);
              setProfileAvatar(previous);
            } else setProfileAvatar(localValue);
          }}
          syncStatus={persistenceResult?.state === "saved_cloud_verified" ? "synced" : persistenceResult?.state === "syncing" ? "syncing" : "not_connected"}
          localDataCount={wardrobe.length + saved.length + (learningProfile?.events?.length || 0)}
          exportHref={privacyController.exportHref()}
          onLogout={async () => {
            await authRepository.logout();
            setProfileOpen(false);
            setScreen("wardrobe");
          }}
          onDeleteLocal={async () => {
            await privacyController.deleteAll();
            setWardrobe([]);
            setSaved([]);
            setLearningProfile(createUiLearningProfile());
            setProfileOpen(false);
          }}
          accountDeleteState={accountDeleteState}
          onDeleteAccount={async (confirmation) => {
            const result = await accountDeletion.request(confirmation);
            if (result.status === "deleted") {
              await privacyController.deleteAll();
              await authRepository.logout();
              setWardrobe([]);
              setSaved([]);
              setLearningProfile(createUiLearningProfile());
              setProfileOpen(false);
              setScreen("wardrobe");
            }
          }}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {guestProfileOpen && (
        <LocalWarmProfilePanel
          prefs={{ ...prefs, temp: stylistContext.labels.weather }}
          learningProfile={learningProfile}
          avatarIndex={profileAvatar}
          onAvatarChange={(index) => setProfileAvatar(saveProfileAvatar(index))}
          onPreferenceChange={(key, value) => {
            const actionKey = `${key}:${value}`;
            if (preferenceQuickEditGuardRef.current === actionKey) return;
            preferenceQuickEditGuardRef.current = actionKey;
            queueMicrotask(() => { if (preferenceQuickEditGuardRef.current === actionKey) preferenceQuickEditGuardRef.current = null; });
            const durable = { ...prefs };
            const next = { ...durable, [key]: value };
            const persist = () => {
              setPersistenceResult({ state: "saving", evidence: { durable: false } });
              const outcome = onboardingPreferences.grant(next);
              const result = outcome.persisted
                ? { state: "saved_local", evidence: { durable: true, scope: "device", version: outcome.record.schemaVersion } }
                : { state: outcome.state === "recovery_required" ? "recovery_required" : outcome.state === "conflict" ? "conflict" : "retryable_error", evidence: { durable: false, restored: outcome.restoreVerified === true }, error: outcome.code };
              setRememberPrefs(outcome.persisted);
              setPrefs(outcome.persisted ? next : durable);
              setPersistenceResult(result);
              telemetry.emit("persistence_outcome", { domain: "preferences", outcome: result.state, error_code: outcome.persisted ? "none" : outcome.code === "quota_exceeded" ? "quota" : outcome.code === "storage_unavailable" ? "unavailable" : "unknown" });
              if (outcome.persisted) preferenceRetryRef.current = null;
            };
            preferenceRetryRef.current = persist;
            persist();
          }}
          preferencePersistence={persistenceResult}
          onPreferenceRetry={() => preferenceRetryRef.current?.()}
          onOpenWeather={() => {
            setGuestProfileOpen(false);
            setContextOpen(true);
          }}
          onFeedback={(reason) => {
            const proposal = makeLearningProposal("rejection", { reason, outfitId: outfit.signature || `profile-${variant}`, idempotencyKey: `profile-feedback-${Date.now()}`, subject: { itemIds: outfit.map((item) => String(item.id)) }, recommendationSequence: recommendationSequence + 1 });
            const result = applyUiLearning(learningProfile, proposal, { consent: true, ifMatch: uiLearningEtag(learningProfile) });
            if (result.ok) { const persistence = saveLocally(repositories.learningProfile, result.profile); setPersistenceResult(persistence); if (persistence.evidence.durable) setLearningProfile(result.profile); }
          }}
          onUndoLearning={() => {
            const event = [...learningProfile.events].reverse().find((item) => item.type !== "undo" && !learningProfile.events.some((candidate) => candidate.type === "undo" && candidate.targetEventId === item.id));
            if (!event) return;
            const result = undoUiLearning(learningProfile, event.id, { ifMatch: uiLearningEtag(learningProfile), idempotencyKey: `profile-undo-${event.id}` });
            if (result.ok) { const persistence = saveLocally(repositories.learningProfile, result.profile); setPersistenceResult(persistence); if (persistence.evidence.durable) setLearningProfile(result.profile); }
          }}
          counts={{ wardrobe: wardrobe.filter((item) => item.source === "personal").length, outfits: saved.length, signals: Object.keys(learningProfile.signals || {}).length }}
          localPilotPhoto={localPilotPhoto}
          onAddGarment={() => { setGuestProfileOpen(false); openAddGarment(); }}
          privacyController={privacyController}
          onReset={() => { setSaved([]); setLearningProfile(createUiLearningProfile()); }}
          onExport={() => telemetry.emit("export_requested", { format: "json" })}
          onDelete={() => { telemetry.emit("local_data_deleted", { scope: "all_local" }); setWardrobe([]); setSaved([]); setLearningProfile(createUiLearningProfile()); setProfileAvatar(1); returningUser.clear(); }}
          onClose={() => setGuestProfileOpen(false)}
        />
      )}
      {authOpen && authReady && (
        <AuthDialog
          repository={authRepository}
          state={authState}
          providerAvailable={providerStatus === "available"}
          providerStatus={providerStatus}
          onRetryProvider={async () => {
            setProviderStatus("checking");
            try {
              await authProvider?.probe();
              setProviderStatus("available");
              await authRepository.restore();
            } catch {
              setProviderStatus("unavailable");
            }
          }}
          onClose={() => {
            pendingPersonalAction.current = null;
            setAuthOpen(false);
          }}
          onAuthenticated={() => {
            const action = pendingPersonalAction.current;
            pendingPersonalAction.current = null;
            setAuthOpen(false);
            action?.();
          }}
        />
      )}
      {feedback && (
        <Feedback
          close={() => setFeedback(false)}
          choose={(x) => {
            setFeedback(false);
            const reasonCode = /цвет/i.test(x) ? "color" : /стил/i.test(x) ? "style" : /посад|силуэт/i.test(x) ? "fit" : /повод|умест/i.test(x) ? "occasion" : "other";
            telemetry.emit("look_rejected", { reason_code: reasonCode });
            startLearning("rejection", x, () => setVariant((v) => v + 1));
          }}
        />
      )}
      {learningProposal && (
        <LearningConfirmation
          proposal={learningProposal}
          profile={learningProfile}
          close={() => {
            const after = learningProposal.afterAction;
            setLearningProposal(null);
            after?.();
          }}
          apply={async (consent, etag) => {
            const result = applyUiLearning(learningProfile, learningProposal, {
              consent,
              ifMatch: etag,
            });
            if (result.ok) {
              const after = learningProposal.afterAction;
              const persistence = await runtimePersistence.persist({
                domain: "feedback",
                localRepository: repositories.learningProfile,
                value: result.profile,
                entityId: result.event?.id || learningProposal.idempotencyKey,
                idempotencyKey: learningProposal.idempotencyKey,
              });
              if (!persistence.evidence.durable) return result;
              setLearningProfile(result.profile);
              setLearningProposal(null);
              after?.();
              toast("Реакция сохранена на этом устройстве — её можно отменить");
            }
            return result;
          }}
          undo={(eventId, etag) => {
            const result = undoUiLearning(learningProfile, eventId, {
              ifMatch: etag,
              idempotencyKey: `undo-${eventId}`,
            });
            if (result.ok) setLearningProfile(result.profile);
            return result;
          }}
        />
      )}
      {add && (
        <AddItem
          localPilot={localPilotPhoto}
          close={() => {
            setAdd(false);
            setAddAsAnchor(false);
          }}
          submit={async (x) => {
            const id = Date.now();
            let photoId = null;
            if (x.photoBlob) {
              try {
                const savedPhoto = await photoStorage.save(
                  x.photoBlob,
                  {
                    granted: true,
                    policyVersion: PHOTO_POLICY_VERSION,
                    grantedAt: new Date().toISOString(),
                  },
                  { garmentId: id },
                );
                photoId = savedPhoto.id;
                if (!savedPhoto.meta.persisted) toast("Фото доступно только в этой сессии: постоянное локальное хранилище недоступно");
              } catch (error) {
                telemetry.emit("first_item_failed", { reason: error?.code === "quota_exceeded" ? "quota" : "storage" });
                toast(error?.code === "quota_exceeded" ? "Недостаточно места: освободите локальное хранилище и повторите" : "Не удалось сохранить фото локально");
                return;
              }
            }
            const { photoBlob, photo, ...fields } = x;
            const item = {
              ...fields,
              photoId,
              photo: photoId ? objectUrlRegistry.create(photoId, photoBlob) : "",
              id,
              source: "personal",
              confirmed: true,
              status: "ready",
              confirmedFacts: { category: true, color: true, style: true },
              emoji: "◇",
            };
            const nextWardrobe = [...wardrobe.filter((entry) => !isDemoGarment(entry)), item];
            const persistence = await runtimePersistence.persist({
              domain: "wardrobe",
              localRepository: repositories.wardrobe,
              value: nextWardrobe.map(({ photo: itemPhoto, ...entry }) => (itemPhoto?.startsWith?.("blob:") ? entry : { ...entry, photo: itemPhoto })),
              entityId: id,
              idempotencyKey: `wardrobe:${id}`,
            });
            if (!persistence.evidence.durable) { telemetry.emit("first_item_failed", { reason: "storage" }); return; }
            setWardrobe(nextWardrobe);
            telemetry.emit("first_item_completed", { has_local_photo: Boolean(photoId) }, { idempotencyKey: `first-item-complete:${id}` });
            setAdd(false);
            if (addAsAnchor) {
              setAnchorId(item.id);
              setVariant(0);
              setScreen("look");
              setAddAsAnchor(false);
              toast("Любимая вещь закреплена");
            } else toast("Вещь добавлена");
          }}
        />
      )}
      {referenceOpen && <ReferenceExperience
        existingItems={wardrobe.filter((item) => !isDemoGarment(item))}
        onClose={() => setReferenceOpen(false)}
        onChooseItems={() => { setReferenceOpen(false); setScreen("wardrobe"); }}
        onBuildSimilar={(savedId) => { setReferenceOpen(false); setCatalogMode("personal"); setAnchorId(savedId || null); setVariant(0); setScreen(savedId ? "look" : "anchor"); }}
        emit={(stage, method, count, outcome) => { const event = referenceAnalyticsEvent(stage, { method, count, outcome }); telemetry.emit(event.name, event.properties, { idempotencyKey: `reference:${stage}:${method}:${count}:${outcome}` }); }}
        onSave={async (batch, { sourceBlob } = {}) => {
          const createdPhotoIds = [];
          try {
            const savedBatch = await Promise.all(batch.map(async (item) => {
              const maskedSource = item.local_cutout_blob || (item.local_cutout_data_url ? await dataUrlToBlob(item.local_cutout_data_url) : null);
              const photoBlob = maskedSource ? await cropAlphaBlob(maskedSource, item.reference_crop) : await cropReferenceBlob(sourceBlob, item.reference_crop);
              const savedPhoto = await photoStorage.save(photoBlob, {
                granted: true,
                policyVersion: PHOTO_POLICY_VERSION,
                grantedAt: new Date().toISOString(),
              }, { garmentId: item.id, source: "reference_crop" });
              createdPhotoIds.push(savedPhoto.id);
              const { local_cutout_blob, local_cutout_data_url, ...durableItem } = item;
              return { ...durableItem, photoId: savedPhoto.id, photo: objectUrlRegistry.create(savedPhoto.id, photoBlob) };
            }));
            const next = [...wardrobe.filter((item) => !isDemoGarment(item)), ...savedBatch];
            const durableWardrobe = next.map(({ photo, ...item }) => photo?.startsWith?.("blob:") ? item : { ...item, photo });
            const persistence = await runtimePersistence.persist({ domain: "wardrobe", localRepository: repositories.wardrobe, value: durableWardrobe, entityId: savedBatch[0]?.id, idempotencyKey: `reference:${savedBatch[0]?.id}` });
            if (!persistence.evidence.durable) throw new Error(persistence.error || "wardrobe_save_failed");
            setWardrobe(next); setCatalogMode("personal");
          } catch (error) {
            await Promise.allSettled(createdPhotoIds.map(async (id) => { objectUrlRegistry.release(id); await photoStorage.delete(id); }));
            throw error;
          }
        }}
      />}
      {notice && (
        <div className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
      <PilotMetricsPanel collector={telemetry} />
    </div>
  );
}
function Landing({ onStart }) {
  return (
    <div className="landing">
      <div className="brand">
        <span className="mark">A</span> ATELIER AI
      </div>
      <div className="hero-copy">
        <div className="eyebrow">
          <Sparkles size={14} /> ТВОЙ ГАРДЕРОБ · ТВОИ ПРАВИЛА
        </div>
        <h1>
          Образ на день —<br />
          <i>уже в твоём шкафу</i>
        </h1>
        <p>AI-стилист соберёт сочетание из вещей, которые у тебя уже есть — под планы, настроение и погоду.</p>
        <button className="primary" onClick={onStart}>
          Начать подбор <ArrowRight size={18} />
        </button>
        <div className="minute">
          <Clock size={15} /> Тест займёт всего 1 минуту
        </div>
      </div>
      <div className="hero-photo">
        <img src="/assets/editorial-look.png" alt="Пример образа из демо-гардероба" />
        <span className="look-tag">
          <b>Образ на сегодня</b> smart casual · подобрано по твоим настройкам
        </span>
      </div>
      <div className="hero-index">
        01 <span>/</span> 04
      </div>
    </div>
  );
}
function Header({ screen, setScreen, weather, profileAvatar, openContext, openProfile, openTour, capsuleEnabled = false }) {
  return (
    <header>
      <button className="logo" onClick={() => setScreen("test")}>
        <span className="mark small">A</span>
        <b>ATELIER AI</b>
      </button>
      <div className="desktop-links">
        <button className={screen === "test" ? "active" : ""} onClick={() => setScreen("test")}>
          Сегодня
        </button>
        <button className={screen === "wardrobe" ? "active" : ""} onClick={() => setScreen("wardrobe")}>
          Гардероб
        </button>
        {capsuleEnabled && <button className={screen === "capsules" ? "active" : ""} onClick={() => setScreen("capsules")}>Капсулы</button>}
        <button className={screen === "history" ? "active" : ""} onClick={() => setScreen("history")}>
          <History size={14} /> Мои образы
        </button>
      </div>
      <div className="header-tools">
        <button className="weather" type="button" aria-haspopup="dialog" onClick={openContext}>
          <CloudSun size={16} /> <span>{weather}</span>
        </button>
        <button className="tour-help" type="button" onClick={openTour} aria-label="Показать подсказки по сервису"><CircleHelp size={17} /><span>Как это работает</span></button>
        <LocalProfileEntry className="header-profile-entry" avatarIndex={profileAvatar} onOpen={openProfile} />
      </div>
    </header>
  );
}
function LegacyHeader({ screen, setScreen, weather, openContext, openProfile }) {
  return (
    <header>
      <button className="logo" onClick={() => setScreen("test")}>
        <span className="mark small">A</span>
        <b>ATELIER AI</b>
      </button>
      <div className="desktop-links">
        <button className={screen === "test" ? "active" : ""} onClick={() => setScreen("test")}>
          Сегодня
        </button>
        <button className={screen === "wardrobe" ? "active" : ""} onClick={() => setScreen("wardrobe")}>
          Гардероб
        </button>
        <button className={screen === "history" ? "active" : ""} onClick={() => setScreen("history")}>
          <History size={14} /> Мои образы
        </button>
      </div>
      <button className="weather" type="button" aria-haspopup="dialog" onClick={openContext}>
        <CloudSun size={16} /> {weather}
      </button>
      <button className="avatar" type="button" aria-label="Профиль" aria-haspopup="dialog" onClick={openProfile}>
        <UserRound size={17} />
      </button>
    </header>
  );
}
function Test({ prefs, setPrefs, rememberPrefs, setRememberPrefs, next, stylistContext }) {
  return (
    <section className="page test">
      <Top
        step="01"
        label="НАСТРОИМ ПОДБОР"
        title={
          <>
            Соберём образ,
            <br />
            <i>который говорит за тебя</i>
          </>
        }
      />
      <div className="question-grid">
        <OnboardingChoice n="01" title="Куда ты сегодня?" value={prefs.goal} items={options.goal} set={(v) => setPrefs((current) => updateOnboardingPreference(current, "goal", v))} />
        <OnboardingChoice n="02" title="Какой стиль ближе?" value={prefs.style} items={options.style} set={(v) => setPrefs((current) => updateOnboardingPreference(current, "style", v))} />
        <OnboardingChoice n="03" title="Как хочешь себя чувствовать?" value={prefs.mood} items={options.mood} set={(v) => setPrefs((current) => updateOnboardingPreference(current, "mood", v))} />
        <OnboardingChoice n="04" title="Что важно учесть?" value={prefs.limits} items={options.limits} multi set={(v) => setPrefs((current) => toggleOnboardingLimit(current, v))} />
      </div>
      <ManualContextEditor value={stylistContext.context} setValue={stylistContext.setContext} save={stylistContext.saveContext} />
      <div className="continue">
        <label className="remember-context">
          <input type="checkbox" checked={rememberPrefs} onChange={(event) => setRememberPrefs(event.target.checked)} />
          Запомнить ответы на этом устройстве. Без согласия можно продолжить, но после перезагрузки ответы сбросятся.
        </label>
        <button className="primary" onClick={next}>
          Продолжить <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}
function ManualContextEditor({ value, setValue, save }) {
  const [remember, setRemember] = useState(false);
  const [status, setStatus] = useState("");
  const update = (patch) => setValue({ ...value, ...patch });
  return (
    <fieldset className="manual-context">
      <legend>Контекст вручную</legend>
      <p>Укажи только то, что хочешь учесть. Геолокация и внешние сервисы не используются.</p>
      <div>
        <label>
          Температура, °C
          <input type="number" min="-60" max="60" value={value.temperatureC ?? ""} onChange={(e) => update({ temperatureC: e.target.value })} />
        </label>
        <label>
          Осадки
          <select value={value.precipitation ?? ""} onChange={(e) => update({ precipitation: e.target.value })}>
            <option value="">Не указаны</option>
            <option value="none">Нет</option>
            <option value="rain">Дождь</option>
            <option value="snow">Снег</option>
            <option value="mixed">Смешанные</option>
          </select>
        </label>
        <label>
          Активность
          <select value={value.activity ?? ""} onChange={(e) => update({ activity: e.target.value })}>
            <option value="">Не указана</option>
            <option value="low">Низкая</option>
            <option value="moderate">Умеренная</option>
            <option value="active">Активная</option>
          </select>
        </label>
      </div>
      <label className="remember-context">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Запомнить этот контекст на устройстве
      </label>
      <button
        type="button"
        onClick={() => {
          const result = save(remember);
          setStatus(result.ok ? "Контекст сохранён локально" : "Для сохранения нужно согласие");
        }}
      >
        Сохранить контекст
      </button>
      {status && <span role="status">{status}</span>}
    </fieldset>
  );
}
function Top({ step, label, title, sub }) {
  return (
    <div className="top">
      <div className="eyebrow">
        {step} / 03 · {label}
      </div>
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}
function Wardrobe({ items, isDemo, load, next, openAdd, openAnchor, openReference, persistItems }) {
  const [tab, setTab] = useState(() => (items.some(isDemoGarment) ? "demo" : "personal"));
  const [pendingDelete, setPendingDelete] = useState(null);
  const demoItems = items.filter(isDemoGarment);
  const personalItems = items.filter((item) => !isDemoGarment(item));
  const visibleItems = tab === "personal" ? personalItems : demoItems;
  const personalCanBuild = missingCategories(personalItems).length === 0;
  const readiness =
    tab === "demo"
      ? transitionReadiness(
          readinessFromWardrobe({
            wardrobe: personalItems,
            canBuild: personalCanBuild,
          }),
          { type: "SHOW_DEMO", items: demoItems },
        )
      : readinessFromWardrobe({
          wardrobe: personalItems,
          canBuild: personalCanBuild,
        });
  const removeItem = async (garment) => {
    if (garment.photoId) await photoStorage.delete(garment.photoId).catch(() => {});
    if (garment.photoId) objectUrlRegistry.release(garment.photoId);
    const updated = items.filter((item) => item.id !== garment.id);
    await persistItems(updated, `delete:${garment.id}`);
    setPendingDelete(null);
  };
  const updateItem = async (updatedItem) => {
    const updated = items.map((item) => (item.id === updatedItem.id ? updatedItem : item));
    await persistItems(updated, `update:${updatedItem.id}`);
  };
  return (
    <section className="page wardrobe">
      <Top
        step="02"
        label="ТВОЙ ГАРДЕРОБ"
        title={
          <>
            Соберём твой
            <br />
            <i>гардероб</i>
          </>
        }
        sub="Добавь несколько любимых вещей — или начни с готового демо-гардероба."
      />
      <div className="ward-actions">
        <button className="reference-entry" onClick={openReference}><span><Upload /></span><b>Образ по фото</b><small>Загрузить · сфотографировать · вставить</small></button>
        <button className="anchor-entry" onClick={openAnchor}>
          <Heart aria-hidden="true" />
          <span>
            <b>С чем носить любимую вещь?</b>
            <small>Закрепим её и заменим всё остальное</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button
          className="upload"
          onClick={() => {
            setTab("personal");
            openAdd();
          }}
        >
          <span>
            <Plus />
          </span>
          <b>Добавить вещь</b>
          <small>Можно загрузить фото</small>
        </button>
        <button
          className="demo"
          onClick={() => {
            load();
            setTab("demo");
          }}
        >
          <WandSparkles />
          <span>
            <b>Добавить демо-вещи</b>
            <small>9 базовых вещей уже внутри</small>
          </span>
          <ChevronRight />
        </button>
      </div>
      <div className="closet-head">
        <span>
          {visibleItems.length} вещей · {tab === "personal" ? "добавлено тобой" : "демо-база"}
        </span>
      </div>
      <WardrobeTabs activeTab={tab} counts={{ personal: personalItems.length, demo: demoItems.length }} onChange={setTab}>
        {visibleItems.length ? (
          <div className="closet">
            {visibleItems.map((x, i) => (
              <div className={"item tone-" + (i % 4)} key={x.id}>
                {!isDemoGarment(x) && (
                  <button className="delete-item" onClick={() => setPendingDelete(x)} title="Удалить вещь" aria-label={`Удалить ${x.name}`}>
                    <X size={15} />
                  </button>
                )}
                <div className={"item-art " + (isDemoGarment(x) ? "demo-photo" : "user-photo")}>{x.photo ? <img src={x.photo} alt={x.name} /> : x.emoji}</div>
                <small>{x.type}</small>
                <b>{x.name}</b>
                <span>{x.style}</span>
                <GarmentStyleHints item={x} onChange={updateItem} />
              </div>
            ))}
          </div>
        ) : (
          <div className="personal-empty">
            <Upload />
            <h3>Здесь будут твои вещи</h3>
            <p>Добавь первую вещь с фотографией — она сразу начнёт участвовать в подборе.</p>
            <button onClick={openAdd}>
              Добавить вещь <Plus size={16} />
            </button>
          </div>
        )}
      </WardrobeTabs>
      {tab === "personal" && <HonestReadinessCard state={readiness} onAddItems={openAdd} onBuild={next} onLeaveDemo={openAdd} />}
      <div className="sticky-action">
        <span>
          {tab === "demo" ? (
            <>Это пример из демонстрационных вещей</>
          ) : personalCanBuild ? (
            <>
              <Check /> Минимум для личного образа собран
            </>
          ) : (
            <>Добавьте необходимые категории для личного образа</>
          )}
        </span>
        <button className="primary" onClick={() => next(tab)} disabled={tab === "personal" && !personalCanBuild}>
          {tab === "demo" ? "Посмотреть демо-образ" : "Подобрать образ"} <Sparkles size={17} />
        </button>
      </div>
      {pendingDelete && <DeleteGarmentDialog garment={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={removeItem} />}
    </section>
  );
}
function AnchorPicker({ items, anchorId, choose, add }) {
  return (
    <section className="page wardrobe anchor-picker" aria-labelledby="anchor-title">
      <Top
        step="02"
        label="ЛЮБИМАЯ ВЕЩЬ"
        title={
          <>
            <span id="anchor-title">Что оставим</span>
            <br />
            <i>в центре образа?</i>
          </>
        }
        sub="Выбери одну вещь. В каждом следующем варианте она останется на месте."
      />
      <button className="upload anchor-add" onClick={add}>
        <span>
          <Plus />
        </span>
        <b>Добавить новую вещь</b>
        <small>Она сразу станет якорем</small>
      </button>
      <div className="closet anchor-grid" role="list" aria-label="Выбор любимой вещи">
        {items.map((x, i) => (
          <button key={x.id} role="listitem" className={`item tone-${i % 4} anchor-card ${anchorId === x.id ? "selected" : ""}`} aria-pressed={anchorId === x.id} onClick={() => choose(x.id)}>
            <div className={`item-art ${isDemoGarment(x) ? "demo-photo" : "user-photo"}`}>{x.photo ? <img src={x.photo} alt="" /> : x.emoji}</div>
            <small>{x.type}</small>
            <b>{x.name}</b>
            <span>{x.style}</span>
            <em>
              <Heart size={14} /> Выбрать якорем
            </em>
          </button>
        ))}
      </div>
    </section>
  );
}
function OutfitExplanationV2({ explanation, onRate }) {
  const labels = { color: "Цвет", silhouette: "Силуэт", context: "Контекст", practical_advice: "Практический совет" };
  return <section className="outfit-v2-explanation" aria-labelledby="outfit-v2-explanation-title"><h3 id="outfit-v2-explanation-title">Почему этот комплект</h3><dl>{Object.entries(explanation.dimensions).map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd>{value.text}</dd></div>)}</dl><p className="outfit-v2-explanation__limitation">{explanation.limitation}</p><div className="stylist-explanation__rating"><span>Объяснение полезно?</span><button type="button" onClick={() => onRate?.(true)}>Да</button><button type="button" onClick={() => onRate?.(false)}>Нет</button></div></section>;
}

function Look({ prefs, outfit, variant, other, save, dislike, like, rateExplanation, anchor, missing, changeAnchor, wardrobe, addGarment, stylistAction, actionResult, actionLoading, manualContext, learningProfile, undoLearning, v2Result, explanationV2 }) {
  if (!outfit.length)
    return (
      <section className="look-empty">
        <div>
          <Sparkles size={30} />
          <div className="eyebrow">{anchor ? "ДЛЯ ЯКОРЯ НЕТ ПОЛНОГО ОБРАЗА" : "ГАРДЕРОБ ЕЩЁ НЕ ГОТОВ"}</div>
          <h2>
            {anchor ? `Оставляем «${anchor.name}»,` : "Добавь несколько вещей,"}
            <br />
            <i>и я соберу образ</i>
          </h2>
          <p>{anchor ? `Не хватает: ${missing.join(", ")}. Добавь недостающие категории — любимая вещь останется закреплена.` : "Для подбора нужны верх и низ или платье, а также хотя бы одна пара обуви."}</p>
          <button className="primary" onClick={wardrobe}>
            Вернуться в гардероб
          </button>
        </div>
      </section>
    );
  const adapted = adaptGarmentsToReasoningInput(outfit);
  const demoLook = outfit.some(isDemoGarment);
  const explanationFacts = runStylistReasoningPipeline({
    ...adapted,
    context: { ...adapted.context, context: manualContext },
  }).facts;
  return (
    <section className="look">
      <FlatLay items={outfit} />
      <div className="look-info">
        <div className="eyebrow">
          {anchor ? "ОБРАЗ ВОКРУГ ЛЮБИМОЙ ВЕЩИ" : "ОБРАЗ НА СЕГОДНЯ"} · {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" }).toUpperCase()}
        </div>
        <h2>{variant % 2 ? "Мягкий фокус" : "Тихая уверенность"}</h2>
        <p className="lead">{anchor ? <>«{anchor.name}» закреплена. Можно заменить все остальные вещи, а якорь останется в образе.</> : demoLook ? <>Это пример из демонстрационного гардероба. Посмотри сочетание или добавь личную вещь, чтобы начать свой гардероб.</> : <>Комплект собран из твоего гардероба под сегодняшние планы. Можно сохранить его или посмотреть следующую комбинацию.</>}</p>
        {v2Result?.status === "limited" && <div className="outfit-v2-limitation" role="status">{v2Result.variants.length === 1 ? "Сейчас доступен 1 полный вариант из подтверждённых вещей." : "Сейчас доступны 2 полных варианта из подтверждённых вещей."} Ограничения и любимая вещь сохранены — недостающие варианты не добавляются искусственно.</div>}
        {explanationV2 ? <OutfitExplanationV2 explanation={explanationV2} onRate={rateExplanation} /> : <StylistExplanationCard facts={explanationFacts} onRate={rateExplanation} />}
        <div className="meta">
          <span>
            <small>КУДА</small>
            {prefs.goal}
          </span>
          <span>
            <small>ПОГОДА</small>
            {manualContext.temperatureC == null ? "Не указана" : `${manualContext.temperatureC > 0 ? "+" : ""}${manualContext.temperatureC}°`}
          </span>
          <span>
            <small>ВЕЩЕЙ</small>
            {outfit.length} из гардероба
          </span>
        </div>
        <div className="actions">
          {demoLook ? <button className="primary" onClick={addGarment}><Plus size={17} /> Добавить личную вещь</button> : <button className="primary" onClick={save}><Heart size={17} /> Сохранить</button>}
          <button onClick={other}>
            <Sparkles size={17} /> {anchor ? "Заменить остальное" : "Показать другой"}
          </button>
          {anchor && (
            <button className="change-anchor" onClick={changeAnchor}>
              Выбрать другую любимую вещь
            </button>
          )}
        </div>
        <div className="stylist-actions" aria-label="Уточнить образ" aria-busy={actionLoading}>
          <b>Изменить образ</b>
          <div>
            {Object.entries(STYLIST_ACTION_COPY).map(([code, action]) => (
              <button key={code} disabled={actionLoading} onClick={() => stylistAction(code)}>
                {action.label}
              </button>
            ))}
          </div>
          {actionLoading && <p role="status">Подбираю альтернативу…</p>}
          {!actionLoading && actionResult?.status === "changed" && (
            <p role="status">
              <b>Что изменилось:</b> {actionResult.change.added.join(", ") || "обновили сочетание"}. {actionResult.why} Якорь и ограничения сохранены.
            </p>
          )}
          {!actionLoading && actionResult?.status === "no_alternative" && <p role="status">Подходящей альтернативы в гардеробе пока нет. Текущий образ сохранён без изменений.</p>}
        </div>
        {!demoLook && <div className="rate">
          <span>Как тебе образ?</span>
          <button onClick={like}>
            <Heart size={16} /> Надела бы
          </button>
          <button onClick={dislike}>
            <ThumbsDown size={16} /> Не подходит
          </button>
        </div>}
        {!demoLook && <section className="learning-memory" aria-labelledby="learning-memory-title">
          <h3 id="learning-memory-title">Что стилист запомнил</h3>
          {learningProfile?.events?.some((event) => event.type === "recommendation_feedback" && !learningProfile.events.some((candidate) => candidate.type === "undo" && candidate.targetEventId === event.id)) ? (
            <>
              <p>Последняя явная реакция уже влияет на порядок следующих рекомендаций.</p>
              <button type="button" onClick={undoLearning}>
                <RotateCcw size={15} /> Отменить последнее обучение
              </button>
            </>
          ) : (
            <p>Пока ничего — только твои ответы онбординга.</p>
          )}
        </section>}
      </div>
    </section>
  );
}
function FlatLay({ items }) {
  const demoLook = items.some(isDemoGarment);
  return (
    <div className="look-visual flatlay">
      <div className="flat-title">
        <span>{demoLook ? "ДЕМОНСТРАЦИОННЫЙ ОБРАЗ" : "СОБРАНО ИЗ ТВОИХ ВЕЩЕЙ"}</span>
      </div>
      <div className={"flat-grid count-" + items.length}>
        {items.map((x, i) => (
          <div className={`flat-piece ${isDemoGarment(x) ? `demo-${x.id}` : "personal-piece"}`} key={x.id}>
            {x.photo ? <img src={x.photo} alt={x.name} /> : <span />}
            <small>
              {String(i + 1).padStart(2, "0")} · {x.name}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
function HistoryPage({ saved, setSaved, catalog }) {
  const [items, setItems] = useState(saved),
    [removing, setRemoving] = useState(null);
  const remove = () => {
    const next = items.filter((_, i) => i !== removing);
    setItems(next);
    setSaved(next);
    setRemoving(null);
  };
  return (
    <section className="page history">
      <Top
        step="—"
        label="МОИ ОБРАЗЫ"
        title={
          <>
            Сохранённые
            <br />
            <i>образы</i>
          </>
        }
        sub="Сохраняй удачные образы — и утром решение уже будет готово."
      />
      {items.length ? (
        <div className="history-list">
          {items.map((x, i) => (
            <article key={`${x.date}-${x.variant}-${i}`}>
              <HistoryThumb entry={x} catalog={catalog} />
              <div>
                <div className="eyebrow">
                  {x.date} · {x.goal}
                </div>
                <h3>{x.variant % 2 ? "Мягкий фокус" : "Тихая уверенность"}</h3>
                <p>{x.items.join(" · ")}</p>
                <button className="liked" onClick={() => setRemoving(i)} aria-label="Удалить образ из любимого">
                  <Heart size={14} fill="currentColor" /> {x.rating === "Надела бы" || x.rating === "Нравится" ? "В любимом" : x.rating}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <History />
          <h3>Здесь появятся твои образы</h3>
          <p>Сохрани первый образ на сегодня — вернуться к нему можно будет в любой момент.</p>
        </div>
      )}
      {removing !== null && (
        <div className="modal-bg" onClick={() => setRemoving(null)}>
          <div className="modal confirm" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">
              <Heart size={22} fill="currentColor" />
            </div>
            <h2>Удалить из любимого?</h2>
            <p>Образ исчезнет из истории. Это действие нельзя будет отменить.</p>
            <div className="confirm-actions">
              <button className="danger" onClick={remove}>
                Удалить
              </button>
              <button onClick={() => setRemoving(null)}>Оставить</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function HistoryThumb({ entry, catalog }) {
  const pieces = (entry.pieceIds?.length ? entry.pieceIds.map((id) => catalog.find((item) => item.id === id)) : entry.items.map((name) => catalog.find((item) => item.name === name))).filter(Boolean);
  if (!pieces.length) return <img className="history-fallback" src="/assets/editorial-look.png" alt="Сохранённый образ" />;
  return (
    <div className={`history-thumb pieces-${Math.min(pieces.length, 5)}`}>
      {pieces.slice(0, 5).map((piece) => (
        <div className={`history-piece ${isDemoGarment(piece) ? `demo-${piece.id}` : "personal-piece"}`} key={piece.id}>
          {piece.photo && <img src={piece.photo} alt={piece.name} />}
          <span>{piece.name}</span>
        </div>
      ))}
    </div>
  );
}
function Nav({ screen, setScreen, capsuleEnabled = false }) {
  return (
    <nav>
      <button className={screen === "test" ? "active" : ""} onClick={() => setScreen("test")}>
        <Sparkles />
        Сегодня
      </button>
      <button className={screen === "wardrobe" ? "active" : ""} onClick={() => setScreen("wardrobe")}>
        <Upload />
        Гардероб
      </button>
      {capsuleEnabled && <button className={screen === "capsules" ? "active" : ""} onClick={() => setScreen("capsules")}><WandSparkles />Капсулы</button>}
      <button className={screen === "history" ? "active" : ""} onClick={() => setScreen("history")}>
        <History />
        Мои образы
      </button>
    </nav>
  );
}
function Feedback({ close, choose }) {
  const a = rejectionLabels;
  return (
    <AccessibleDialog labelledBy="feedback-title" onClose={close}>
      <button className="x" onClick={close} aria-label="Закрыть">
        <X />
      </button>
      <div className="eyebrow">ПОМОГИ СТАТЬ ТОЧНЕЕ</div>
      <h2 id="feedback-title">Что не подошло?</h2>
      <p>Выбери главную причину. Перед изменением профиля покажем, что именно стилист предлагает запомнить.</p>
      {a.map((x) => (
        <button className="reason" onClick={() => choose(x)} key={x}>
          {x}
          <ChevronRight />
        </button>
      ))}
    </AccessibleDialog>
  );
}
function LearningConfirmation({ proposal, profile, close, apply, undo }) {
  const [consent, setConsent] = useState(false);
  const [etag] = useState(() => uiLearningEtag(profile));
  const [error, setError] = useState("");
  const lastEvent = profile.events.at(-1);
  const submit = () => {
    const result = apply(consent, etag);
    if (result?.status === 412) setError("Профиль изменился в другой вкладке. Закрой окно и повтори отзыв с актуальной версией.");
    else if (result?.status === 403) setError("Нужно отдельно разрешить сохранить этот вывод в профиле.");
  };
  return (
    <AccessibleDialog className="modal learning-modal" labelledBy="learning-title" onClose={close}>
      <button className="x" onClick={close} aria-label="Закрыть">
        <X />
      </button>
      <div className="eyebrow">
        <ShieldCheck size={14} /> ПРОЗРАЧНОЕ ОБУЧЕНИЕ
      </div>
      <h2 id="learning-title">{proposal.title}</h2>
      <p className="learning-benefit">
        {proposal.conclusion} {proposal.effect}
      </p>
      <dl className="learning-proof">
        <div>
          <dt>Источник</dt>
          <dd>
            Твоё явное действие
            {proposal.reason ? `: «${proposal.reason}»` : " с этим образом"}
          </dd>
        </div>
        <div>
          <dt>Статус вывода</dt>
          <dd>{proposal.kind === "rejection" ? "Предварительный сигнал" : "Факт о конкретном образе"}</dd>
        </div>
        <div>
          <dt>Версия профиля</dt>
          <dd>{etag}</dd>
        </div>
      </dl>
      <label className="consent-row">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          <b>Разрешаю сохранить этот вывод в профиле</b>
          <small>Только для персонализации образов. Фото и чувствительные данные не добавляются.</small>
        </span>
      </label>
      {error && (
        <p className="learning-error" role="alert">
          {error}
        </p>
      )}
      <div className="learning-actions">
        <button className="primary" onClick={submit}>
          Запомнить для следующих образов
        </button>
        <button onClick={close}>Только показать другой образ</button>
      </div>
      {lastEvent && (
        <button
          className="undo-learning"
          onClick={() => {
            const result = undo(lastEvent.id, uiLearningEtag(profile));
            if (result.ok) setError("Последнее изменение профиля отменено.");
            else if (result.status === 412) setError("Не удалось отменить: профиль уже обновлён в другой вкладке.");
          }}
        >
          <RotateCcw size={15} /> Отменить последнее обучение
        </button>
      )}
    </AccessibleDialog>
  );
}
function AddItem({ close, submit, localPilot = false }) {
  const palette = [
    ["Чёрный", "#20211f"],
    ["Белый", "#f5f3ed"],
    ["Бежевый", "#c6ab86"],
    ["Серый", "#92938f"],
    ["Синий", "#315b8a"],
    ["Голубой", "#95bcd4"],
    ["Коричневый", "#76533e"],
    ["Зелёный", "#6c8064"],
    ["Красный", "#a9433c"],
    ["Розовый", "#dca5ae"],
  ];
  const [f, setF] = useState({
      name: "",
      type: "Верх",
      subcategory: "",
      color: "Бежевый",
      colorHex: "#c6ab86",
      style: "Minimal",
      photo: "",
      photoBlob: null,
    }),
    [colorOpen, setColorOpen] = useState(false);
  const pickColor = (name, hex) => {
      setF({ ...f, color: name, colorHex: hex });
      setColorOpen(false);
    },
    onPhotoReady = ({ blob }) => {
      const reader = new FileReader();
      reader.onload = () => setF((v) => ({ ...v, photo: reader.result, photoBlob: blob }));
      reader.readAsDataURL(blob);
    };
  const [photoConsent, setPhotoConsent] = useState(false);
  return (
    <AccessibleDialog
      as="form"
      className="modal add-form"
      labelledBy="add-item-title"
      initialFocus="input[name='garment-name']"
      onClose={close}
      onSubmit={(e) => {
        e.preventDefault();
        if (f.name) submit(f);
      }}
    >
      <button type="button" className="x" onClick={close} aria-label="Закрыть">
        <X />
      </button>
      <div className="eyebrow">НОВАЯ ВЕЩЬ</div>
      <h2 id="add-item-title">Добавить в гардероб</h2>
      {localPilot && <div className="local-pilot-notice" role="status"><ShieldCheck size={18} /><span><b>Локально на устройстве</b><small>Без аккаунта и облачной синхронизации. Фото не отправляется в сеть.</small></span></div>}
      <PhotoIntake onReady={onPhotoReady} />
      {f.photo && <img className="photo-preview" src={f.photo} alt="Предпросмотр вещи" />}
      {f.photoBlob && (
        <label className="consent-row">
          <input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)} />
          <span>
            <b>Сохранить фото локально на этом устройстве</b>
            <small>Отдельное согласие. Фото не отправляется в сеть и автоматически удаляется через 30 дней.</small>
          </span>
        </label>
      )}
      <label>
        Название
        <input name="garment-name" placeholder="Например, молочный жакет" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <label>
        Тип
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {["Верх", "Низ", "Платье", "Юбка", "Обувь", "Верхний слой", "Аксессуар"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Подкатегория
        <input name="garment-subcategory" lang="ru" placeholder="Например, рубашка или лоферы" value={f.subcategory} onChange={(e) => setF({ ...f, subcategory: e.target.value })} />
      </label>
      <div className="two">
        <label className="color-field">
          Цвет
          <button type="button" className="field-button" onClick={() => setColorOpen((v) => !v)}>
            <span className="color-dot" style={{ background: f.colorHex }} />
            {f.color}
            <ChevronRight size={16} />
          </button>
          {colorOpen && (
            <div className="color-panel">
              <b>Выбери цвет</b>
              <div className="swatches">
                {palette.map(([name, hex]) => (
                  <button type="button" key={name} className={f.color === name ? "selected" : ""} title={name} onClick={() => pickColor(name, hex)}>
                    <span style={{ background: hex }} />
                    <small>{name}</small>
                  </button>
                ))}
              </div>
              <div className="custom-color">
                <input
                  type="color"
                  value={f.colorHex}
                  onChange={(e) =>
                    setF({
                      ...f,
                      color: "Свой цвет",
                      colorHex: e.target.value,
                    })
                  }
                />
                <span>
                  <b>Свой цвет</b>
                  <small>{f.colorHex.toUpperCase()}</small>
                </span>
              </div>
              <button type="button" className="color-done" onClick={() => setColorOpen(false)}>
                Готово
              </button>
            </div>
          )}
        </label>
        <label>
          Стиль
          <select value={f.style} onChange={(e) => setF({ ...f, style: e.target.value })}>
            {["Smart casual", "Casual", "Feminine", "Minimal", "Old money", "Sporty", "Romantic"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <button className="primary" disabled={Boolean(f.photoBlob) && !photoConsent}>
        Добавить вещь <Plus />
      </button>
    </AccessibleDialog>
  );
}
createRoot(document.getElementById("root")).render(
  <ContextProvider>
    <App />
  </ContextProvider>,
);
