import React, { useId, useState } from "react";
import { AccessibleDialog } from "./AccessibleDialog.js";
import { PhotoIntake } from "./PhotoIntake.jsx";
import { SHOPPING_FLOW_STATUS } from "./shoppingFlowState.js";

const CATEGORIES = [
  ["top", "Верх"], ["bottom", "Низ"], ["dress", "Платье"],
  ["outerwear", "Верхняя одежда"], ["shoes", "Обувь"], ["accessory", "Аксессуар"],
];

export function ShoppingFlowPanel({ controller, photoController, onClose }) {
  if (!controller) throw new TypeError("ShoppingFlowPanel controller is required");
  const titleId = useId();
  const descriptionId = useId();
  const [flow, setFlow] = useState(() => controller.getState());
  const [method, setMethod] = useState("manual");
  const [form, setForm] = useState({ name: "", category: "", color: "", style: "" });
  const [photoReview, setPhotoReview] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const addTemporary = (event) => {
    event.preventDefault();
    try {
      const next = method === "photo"
        ? controller.addPhoto({ ...form, photoRef: `shopping-photo-${Date.now()}` }, photoReview)
        : controller.addManual(form);
      setFlow(next);
      setNotice("Вещь используется только временно и ещё не сохранена.");
    } catch (error) {
      setNotice(error.message === "SHOPPING_LOCAL_PHOTO_REVIEW_REQUIRED"
        ? "Сначала локально проверьте фотографию вещи."
        : "Укажите категорию вещи.");
    }
  };
  const findMatches = () => {
    const result = controller.findMatches();
    setFlow(result.state);
    setNotice(result.state.matches.length ? "Подбор готов." : "Подходящих комплектов пока нет.");
  };
  const askToSave = () => setFlow(controller.requestSave());
  const confirmSave = async () => {
    setBusy(true);
    try {
      const result = await controller.confirmSave(true);
      setFlow(result.state);
      setNotice("Вещь сохранена в личный гардероб на этом устройстве.");
    } catch {
      setNotice("Не удалось сохранить вещь. Предыдущее содержимое гардероба не изменено — повторите попытку.");
    } finally {
      setBusy(false);
    }
  };
  const cancel = () => {
    controller.discard();
    onClose?.();
  };

  return (
    <AccessibleDialog
      className="modal shopping-flow-panel"
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocus="[data-shopping-cancel]"
      onClose={cancel}
    >
      <header>
        <h2 id={titleId}>В магазине</h2>
        <p id={descriptionId}>Проверьте новую вещь с личным гардеробом. Ничего не отправляется в сеть и не сохраняется без подтверждения.</p>
      </header>

      {flow.status === SHOPPING_FLOW_STATUS.IDLE && (
        <form onSubmit={addTemporary} aria-label="Новая временная вещь">
          <fieldset>
            <legend>Как добавить вещь?</legend>
            <button type="button" aria-pressed={method === "manual"} onClick={() => setMethod("manual")}>Вручную</button>
            <button type="button" aria-pressed={method === "photo"} onClick={() => setMethod("photo")}>Сфотографировать</button>
          </fieldset>
          {method === "photo" && <PhotoIntake controller={photoController} onReady={setPhotoReview} />}
          <label>Название<input name="shopping-name" value={form.name} onChange={update("name")} /></label>
          <label>Категория<select name="shopping-category" required value={form.category} onChange={update("category")}>
            <option value="">Выберите</option>
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Цвет<input name="shopping-color" value={form.color} onChange={update("color")} /></label>
          <label>Стиль<input name="shopping-style" value={form.style} onChange={update("style")} /></label>
          <button type="submit" disabled={method === "photo" && !photoReview}>Использовать временно</button>
        </form>
      )}

      {flow.anchor && (
        <section aria-labelledby={`${titleId}-anchor`}>
          <h3 id={`${titleId}-anchor`}>Временный якорь</h3>
          <p><strong>{flow.anchor.name}</strong> · {flow.anchor.category}</p>
          {flow.status === SHOPPING_FLOW_STATUS.READY && <button type="button" onClick={findMatches}>Подобрать из моего гардероба</button>}
        </section>
      )}

      {flow.status === SHOPPING_FLOW_STATUS.MATCHED && (
        <section aria-labelledby={`${titleId}-matches`}>
          <h3 id={`${titleId}-matches`}>С чем сочетается</h3>
          {flow.matches.length ? <ol>{flow.matches.map((match, index) => (
            <li key={`${match.itemIds.join("-")}-${index}`}>
              <ul>{match.items.map((item) => <li key={item.id}>{item.name || item.category}</li>)}</ul>
              {match.explanation && <p>{match.explanation}</p>}
            </li>
          ))}</ol> : <p>В личном гардеробе не хватает вещей для комплекта.</p>}
          <button type="button" onClick={askToSave}>Сохранить эту вещь…</button>
        </section>
      )}

      {flow.status === SHOPPING_FLOW_STATUS.SAVE_CONFIRMATION && (
        <section role="alertdialog" aria-labelledby={`${titleId}-confirm`} aria-describedby={`${titleId}-confirm-copy`}>
          <h3 id={`${titleId}-confirm`}>Сохранить вещь?</h3>
          <p id={`${titleId}-confirm-copy`}>Только после подтверждения она попадёт в личный гардероб на этом устройстве.</p>
          <button type="button" onClick={() => setFlow(controller.cancelSave())}>Назад</button>
          <button type="button" disabled={busy} onClick={confirmSave}>Да, сохранить</button>
        </section>
      )}

      {flow.status === SHOPPING_FLOW_STATUS.SAVED && <p role="status">Вещь сохранена в личный гардероб на этом устройстве.</p>}
      {notice && <p role="status" aria-live="polite">{notice}</p>}
      <footer><button type="button" data-shopping-cancel onClick={cancel}>{flow.status === SHOPPING_FLOW_STATUS.SAVED ? "Закрыть" : "Отменить и не сохранять"}</button></footer>
    </AccessibleDialog>
  );
}

export const ShoppingFlowDialog = ShoppingFlowPanel;
export default ShoppingFlowPanel;
