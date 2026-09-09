import React, { useEffect, useRef, useState } from "react";
import { ReferenceImageImport } from "./ReferenceImageImport.jsx";
import {
  adaptAutomaticReferenceRegions,
  adaptLocalReferenceRegions,
  prepareConfirmedWardrobeBatch,
  undoReferenceReview,
  updateReferenceReview,
} from "./referenceWorkflow.js";
import { analyzeLocalGarments } from "./localCvAuto.js";
import {
  mapDetectedCategory,
  mapDetectedColor,
} from "./cvClassificationAdapter.js";
import "./ReferenceExperience.css";
import { AccessibleDialog } from "./AccessibleDialog.js";
import { GarmentOutlineSelector } from "./GarmentOutlineSelector.jsx";
import { MaskEditor } from "./MaskEditor.jsx";
import { referenceDraftStore } from "./referenceDraft.js";

const categories = [
  ["unknown", "Не определено"],
  ["top", "Верх"],
  ["bottom", "Низ"],
  ["outerwear", "Верхний слой"],
  ["dress", "Платье"],
  ["shoes", "Обувь"],
  ["bag", "Сумка"],
  ["accessory", "Аксессуар"],
];
const label = (field) =>
  `${field.value === "unknown" ? "не определено" : field.value} · ${field.status}`;

export function ReferenceExperience({
  onClose,
  existingItems = [],
  onSave,
  onBuildSimilar,
  onChooseItems,
  emit,
}) {
  const [stage, setStage] = useState("idle"),
    [dto, setDto] = useState(null),
    [items, setItems] = useState([]),
    [undo, setUndo] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [manualOpen, setManualOpen] = useState(false),
    [selections, setSelections] = useState([]),
    [savedAnchorId, setSavedAnchorId] = useState(null),
    [analysisSeconds, setAnalysisSeconds] = useState(0),
    [editingMaskId, setEditingMaskId] = useState(null);
  const editedUrls = useRef(new Set());
  const ownedPreviewUrl = useRef(null);
  const batchId = useRef(`reference-${Date.now()}`);
  const analysisAbort = useRef(null),
    generation = useRef(0);
  useEffect(
    () => {
      let active = true;
      void referenceDraftStore.load().then((draft) => {
        if (!active || !draft) return;
        const previewUrl = URL.createObjectURL(draft.dto.blob); ownedPreviewUrl.current = previewUrl;
        setDto({ ...draft.dto, previewUrl }); setItems(draft.items || []); setStage("review"); setEditingMaskId(draft.stage === "editor" ? draft.editingMaskId : null);
        setMessage(draft.stage === "editor" ? "Черновик восстановлен. Продолжите уточнение маски." : "Черновик фото и проверки восстановлен локально.");
      }).catch(() => {});
      return () => {
      active = false;
      analysisAbort.current?.abort();
      for (const url of editedUrls.current) URL.revokeObjectURL(url);
      editedUrls.current.clear();
      if (ownedPreviewUrl.current) URL.revokeObjectURL(ownedPreviewUrl.current);
      setItems([]);
      };
    },
    [],
  );
  useEffect(() => {
    if (stage !== "analyzing") return;
    const timer = setInterval(
      () => setAnalysisSeconds((value) => value + 1),
      1000,
    );
    return () => clearInterval(timer);
  }, [stage]);
  const imported = async (next) => {
    const current = ++generation.current;
    analysisAbort.current?.abort();
    analysisAbort.current = new AbortController();
    if (ownedPreviewUrl.current) URL.revokeObjectURL(ownedPreviewUrl.current);
    const previewUrl = URL.createObjectURL(next.blob); ownedPreviewUrl.current = previewUrl;
    const localDto = { ...next, previewUrl };
    setDto(localDto);
    setItems([]);
    setSelections([]);
    setManualOpen(false);
    setAnalysisSeconds(0);
    setStage("analyzing");
    setMessage("Ищем видимые вещи локально…");
    emit?.("imported", next.provenance, 0, "completed");
    try {
      const payload = await analyzeLocalGarments(localDto, {
        photoId: batchId.current,
        signal: analysisAbort.current.signal,
      });
      if (current !== generation.current) return;
      const regions = payload.candidates.map((item) => ({
        id: `${batchId.current}:${item.id}`,
        crop: item.crop,
        mask: { previewUrl: item.maskUrl, source: "sam2", trust: "untrusted" },
        visibility: item.visibility,
        previewUrl: item.cutoutUrl,
        observations: {
          category: {
            status: "inferred",
            value: mapDetectedCategory(item.label),
            score: item.detectionScore,
            evidence: ["groundingdino_label"],
          },
          color: {
            status: "inferred",
            value: mapDetectedColor(item.color?.label),
            score: item.color?.confidence,
            evidence: ["masked_pixel_color"],
          },
        },
      }));
      const candidates = adaptAutomaticReferenceRegions(
        next,
        regions,
        batchId.current,
      );
      setItems(candidates);
      setStage("review");
      await referenceDraftStore.save({ dto: localDto, items: candidates, stage: "review" }).catch(() => setMessage("Результат готов, но восстановление черновика после закрытия недоступно."));
      setMessage(
        candidates.length
          ? `Предлагаем проверить ${candidates.length} вариант(а). Автомаски — прототипные предположения.`
          : "Подходящих видимых вещей не найдено. Можно выделить вручную.",
      );
      emit?.(
        "analyzed",
        next.provenance,
        candidates.length,
        candidates.length ? "review_required" : "empty",
      );
    } catch (error) {
      if (
        current !== generation.current ||
        error.message === "cv_auto_cancelled"
      )
        return;
      const timedOut = error.message === "cv_auto_timeout";
      const personPresent = error.message === "cv_person_or_face_present";
      setStage(timedOut ? "timeout" : "error");
      setMessage(
        personPresent
          ? "На фото обнаружено присутствие человека или лица. Автомаска остановлена: выберите фото вещи отдельно или используйте ручной контур. Личность и признаки человека не определяются."
          : timedOut
          ? "Локальное распознавание не завершилось за 120 секунд."
          : "Локальное распознавание недоступно. Фото никуда не отправлено.",
      );
      emit?.("analyzed", next.provenance, 0, timedOut ? "timeout" : "failed");
    }
  };
  const act = (id, action, corrections) => {
    setUndo(items);
    setItems(updateReferenceReview(items, id, action, corrections));
    emit?.("review", dto?.provenance, items.length, action);
  };
  const save = async () => {
    const batch = prepareConfirmedWardrobeBatch(
      items,
      existingItems,
      batchId.current,
      items.filter((item) => item.selected).map((item) => item.id),
    );
    if (!batch.length) {
      setMessage(
        "Подтвердите хотя бы одну вещь. Повторно сохранённые позиции не дублируются.",
      );
      return;
    }
    setBusy(true);
    setStage("saving");
    try {
      await onSave(batch, { sourceBlob: dto?.blob });
      await referenceDraftStore.clear();
      setSavedAnchorId(batch[0]?.id || null);
      setStage("saved");
      setMessage(
        batch.length === 1
          ? "Вещь сохранена"
          : `Сохранено вещей: ${batch.length}`,
      );
      emit?.("save", dto?.provenance, batch.length, "completed");
    } catch {
      setStage("review");
      setMessage("Не удалось сохранить весь набор. Гардероб не изменён.");
      emit?.("save", dto?.provenance, batch.length, "failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AccessibleDialog
      as="section"
      className="reference-experience"
      labelledBy="reference-title"
      onClose={onClose}
    >
      <button
        className="reference-close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        ×
      </button>
      {dto && <button className="reference-discard-draft" onClick={async () => { await referenceDraftStore.clear(); onClose(); }}>Отменить и удалить черновик</button>}
      <p className="eyebrow">РЕФЕРЕНС ОБРАЗА · ЛОКАЛЬНО</p>
      <h2 id="reference-title">Добавить образ по фото</h2>
      <p>
        Фото передаётся только same-origin локальному worker на этом устройстве.
        GroundingDINO и SAM2 предложат видимые области; внешней отправки нет,
        а категорию, цвет и маску подтвердите вы.
      </p>
      <div hidden={stage !== "idle"}>
        <ReferenceImageImport onImported={imported} />
        <aside>
          Для Pinterest и других источников укажите источник для себя и
          убедитесь, что вправе использовать фото. Мы не проверяем и не обещаем
          лицензию.
        </aside>
      </div>
      {stage !== "idle" && dto && (
        <div
          className="reference-layout"
          data-analysis-state={stage}
          data-analysis-seconds={analysisSeconds}
        >
          <img src={dto.previewUrl} alt="Загруженный референс" />
          <div aria-live="polite">
            <h3>
              {stage === "analyzing"
                ? "Ищем видимые вещи…"
                : `Предлагаем проверить ${items.length} вариант(а)`}
            </h3>
            <p className="reference-honesty">
              Маски, категория и цвет — предположения прототипа, не гарантия
              качества. Невидимые части не дорисовываются.
            </p>
            {stage === "analyzing" && (
              <div className="reference-analysis">
                <progress aria-label="Локальное распознавание" />
                <span>{analysisSeconds} с</span>
                <button
                  onClick={() => {
                    generation.current += 1;
                    analysisAbort.current?.abort();
                    setStage("cancelled");
                    setMessage("Распознавание отменено.");
                  }}
                >
                  Отменить
                </button>
                <button
                  onClick={() => {
                    generation.current += 1;
                    analysisAbort.current?.abort();
                    setStage("review");
                    setManualOpen(true);
                  }}
                >
                  Выделить вручную
                </button>
              </div>
            )}
            {!manualOpen &&
              ["timeout", "error", "cancelled"].includes(stage) && (
                <div className="reference-analysis-recovery">
                  <button onClick={() => void imported(dto)}>
                    Повторить локальное распознавание
                  </button>
                  <button onClick={() => setManualOpen(true)}>
                    Выделить вручную
                  </button>
                </div>
              )}
            {!manualOpen && stage === "review" && items.length === 0 && (
              <div className="reference-empty">
                <b>Подходящих вариантов нет</b>
                <p>
                  Выберите другое фото или обведите одну видимую вещь вручную.
                </p>
                <button onClick={() => setManualOpen(true)}>
                  Выделить вещь вручную
                </button>
                <button
                  onClick={() => {
                    setStage("idle");
                    setDto(null);
                  }}
                >
                  Выбрать другое фото
                </button>
              </div>
            )}
            {manualOpen && (
              <GarmentOutlineSelector
                blob={dto.blob}
                onCancel={() => {
                  setManualOpen(false);
                  setMessage(
                    "Вы вернулись к фото. Загруженное изображение сохранено.",
                  );
                }}
                onClear={() => {}}
                onConfirm={(selection) => {
                  const nextSelections = [...selections, selection];
                  setSelections(nextSelections);
                  const extracted = adaptLocalReferenceRegions(
                    dto,
                    nextSelections.map((value, index) => ({
                      id: `${batchId.current}:manual-${index + 1}`,
                      visible: true,
                      selection: value,
                    })),
                    batchId.current,
                  );
                  setItems(
                    extracted.map(
                      (candidate) =>
                        items.find((current) => current.id === candidate.id) ||
                        candidate,
                    ),
                  );
                  setManualOpen(false);
                  setMessage(`Добавлено выделений: ${nextSelections.length}`);
                }}
              />
            )}
            {!manualOpen &&
              items.map((item) => (
                <React.Fragment key={item.id}>
                  <ReferenceCard item={item} onEditMask={() => { setEditingMaskId(item.id); void referenceDraftStore.save({ dto, items, stage: "editor", editingMaskId: item.id }); }} onAction={act} onSelect={(selected) => setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, selected } : candidate))}/>
                  {editingMaskId === item.id && <MaskEditor sourceUrl={dto.previewUrl} maskUrl={item.region.mask.previewUrl} onManualFallback={() => { setEditingMaskId(null); setManualOpen(true); void referenceDraftStore.save({ dto, items, stage: "review" }); }} onCancel={() => { setEditingMaskId(null); void referenceDraftStore.save({ dto, items, stage: "review" }); }} onApply={async ({ blob, bounds }) => {
                    const previewUrl = URL.createObjectURL(blob); editedUrls.current.add(previewUrl);
                    const nextItems = items.map((candidate) => candidate.id === item.id ? { ...candidate, previewUrl, local_cutout_blob: blob, region: { ...candidate.region, crop: bounds, mask: { ...candidate.region.mask, edited: true } } } : candidate);
                    setItems(nextItems); await referenceDraftStore.save({ dto, items: nextItems, stage: "review" });
                    setEditingMaskId(null); setMessage("Маска применена локально. Теперь подтвердите вещь перед сохранением.");
                  }}
                />}
                </React.Fragment>
              ))}
            {!manualOpen && items.length > 0 && (
              <button onClick={() => setManualOpen(true)}>
                Выделить ещё одну вещь
              </button>
            )}
            {!manualOpen && undo && (
              <button
                onClick={() => {
                  setItems(undoReferenceReview(items, undo));
                  setUndo(null);
                }}
              >
                Отменить последнее действие
              </button>
            )}
            {!manualOpen && stage !== "saved" && (
              <div className="reference-batch">
                <button disabled={busy} className="primary" onClick={save}>
                  Сохранить подтверждённые
                </button>
                <button onClick={onBuildSimilar}>Собрать похожий образ</button>
              </div>
            )}
            {!manualOpen && message && <p role="status">{message}</p>}
            {!manualOpen && stage === "saved" && (
              <section
                className="reference-saved"
                aria-label="Что сделать дальше"
              >
                <p className="eyebrow">ГОТОВО</p>
                <h3>Что сделать дальше?</h3>
                <div className="reference-saved-actions">
                  <button
                    className="primary"
                    onClick={() => onBuildSimilar?.(savedAnchorId)}
                  >
                    Собрать образ с этой вещью
                  </button>
                  <button onClick={onChooseItems}>Открыть мой гардероб</button>
                  <button
                    onClick={() => {
                      setStage("idle");
                      setDto(null);
                      setItems([]);
                      setSelections([]);
                      setSavedAnchorId(null);
                      setMessage("");
                    }}
                  >
                    Добавить ещё фото
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </AccessibleDialog>
  );
}

function ReferenceCard({ item, onAction, onSelect, onEditMask }) {
  const [category, setCategory] = useState(item.fields.category.value),
    [color, setColor] = useState(
      item.fields.color.value === "unknown" ? "" : item.fields.color.value,
    ),
    [outline, setOutline] = useState(
      item.fields.silhouette.value === "unknown"
        ? "unknown"
        : item.fields.silhouette.value,
    );
  return (
    <article className={`reference-card state-${item.state}`}>
      <div className="reference-crop">
        {item.previewUrl && (
          <img src={item.previewUrl} alt="Предлагаемая маска и обрезка вещи" />
        )}
        <span
          style={{
            left: `${item.region.crop.x * 100}%`,
            top: `${item.region.crop.y * 100}%`,
            width: `${item.region.crop.width * 100}%`,
            height: `${item.region.crop.height * 100}%`,
          }}
        />
      </div>
      <div>
        <label className="reference-select">
          <input
            type="checkbox"
            checked={item.selected !== false}
            onChange={(event) => onSelect(event.target.checked)}
          />{" "}
          Выбрать для сохранения
        </label>
        <b>Кандидат</b>
        {item.reconstruction_status === "preview_only" && (
          <em>AI-превью · проверьте детали</em>
        )}
        <small>Категория: {label(item.fields.category)}</small>
        <small>Цвет: {label(item.fields.color)}</small>
        <small>
          {item.region.mask?.source === "sam2"
            ? "Автомаска SAM2 · предположение · untrusted"
            : "Геометрия: ручная подсказка · guidance_only · untrusted"}
        </small>
        <small>Силуэт: {label(item.fields.silhouette)}</small>
        {item.duplicate_review.status === "possible_match_review" && (
          <p>Возможный дубль — сравните вручную. Автослияния нет.</p>
        )}
        <div className="reference-fields">
          <label>
            Категория
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Цвет
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Укажите вручную"
            />
          </label>
          <label>
            Силуэт / посадка
            <select
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
            >
              <option value="unknown">Не определён</option>
              <option value="fitted">По фигуре</option>
              <option value="straight">Прямой</option>
              <option value="relaxed">Свободный</option>
              <option value="oversized">Оверсайз</option>
              <option value="a_line">А-силуэт</option>
              <option value="wide">Широкий</option>
            </select>
          </label>
        </div>
        <div className="reference-card-actions">
          {item.region.mask?.source === "sam2" && <button onClick={onEditMask}>{item.region.mask.edited ? "Уточнить маску ещё раз" : "Уточнить маску"}</button>}
          <button
            onClick={() =>
              onAction(item.id, "correct", {
                category: item.fields.category.value,
                color: item.fields.color.value,
                silhouette: item.fields.silhouette.value,
                __declarePersonal: true,
              })
            }
          >
            Подтвердить — это моя вещь
          </button>
          <button
            onClick={() =>
              onAction(item.id, "correct", {
                category,
                color: color || "unknown",
                silhouette: outline || "unknown",
                __declarePersonal: true,
              })
            }
          >
            Исправить и подтвердить
          </button>
          <button onClick={() => onAction(item.id, "reject")}>Отклонить</button>
        </div>
      </div>
    </article>
  );
}
