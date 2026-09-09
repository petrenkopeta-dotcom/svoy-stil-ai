import React, { useMemo, useState } from "react";
import { createPhotoIntakeController, PHOTO_INTAKE_STATUS } from "./photoIntake.js";
import { PHOTO_INTAKE_COPY } from "./photoIntakeCopy.js";
import { GarmentOutlineSelector } from "./GarmentOutlineSelector.jsx";

export function PhotoIntake({ onReady, controller: suppliedController }) {
  const controller = useMemo(() => suppliedController || createPhotoIntakeController(), [suppliedController]);
  const [state, setState] = useState(controller.getState());
  const [selectionConfirmed, setSelectionConfirmed] = useState(false);

  async function choose(event) {
    const file = event.target.files?.[0];
    if (file) { setSelectionConfirmed(false); setState(await controller.select(file)); }
  }

  function declareScene(event) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const next = controller.declareScene({ person: data.get("person") === "no" ? false : true, itemCount: Number(data.get("items")), background: data.get("background"), backgroundContrast: data.get("contrast"), delicateDetails: data.get("details") === "yes", supportEquipment: data.get("support") === "yes" });
    setState(next); if (next.local_ready && onReady) onReady(controller.getLocalReviewPayload());
  }

  const copy = PHOTO_INTAKE_COPY[state.status];
  return (
    <section aria-labelledby="photo-intake-title">
      <h2 id="photo-intake-title">Добавить фото вещи</h2>
      <p>Проверка и подготовка выполняются на этом устройстве. До вашего подтверждения фото не отправляется в сеть.</p>
      <label>
        Выбрать фото
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={choose} disabled={state.busy} />
      </label>
      {state.uploadBlob && state.status === null && <GarmentOutlineSelector blob={state.uploadBlob} onClear={() => setSelectionConfirmed(false)} onConfirm={(selection) => { setState(controller.setSubjectSelection(selection)); setSelectionConfirmed(true); }} />}
      {state.uploadBlob && state.status === null && <form onSubmit={declareScene}>
        <fieldset><legend>Быстрая проверка кадра</legend>
          <label>Человек в кадре? <select name="person" defaultValue=""><option value="" disabled>Выберите</option><option value="no">Нет</option><option value="yes">Да или не уверен(а)</option></select></label>
          <label>Сколько вещей? <select name="items" defaultValue="1"><option value="1">Одна</option><option value="2">Несколько</option></select></label>
          <label>Фон <select name="background" defaultValue="plain"><option value="plain">Ровный</option><option value="complex">Сложный</option></select></label>
          <label>Контраст с фоном <select name="contrast" defaultValue="high"><option value="high">Хороший</option><option value="low">Вещь сливается с фоном</option></select></label>
          <label>Тонкие или прозрачные детали? <select name="details" defaultValue="no"><option value="no">Нет</option><option value="yes">Да</option></select></label>
          <label>Вешалка или стойка в кадре? <select name="support" defaultValue="no"><option value="no">Нет</option><option value="yes">Да</option></select></label>
          <button type="submit" disabled={!selectionConfirmed}>Проверить фото</button>
          <p>Автоматический допуск выключен: результат всегда нужно подтвердить вручную.</p>
        </fieldset>
      </form>}
      {state.quality?.issues?.length > 0 && <ul>{state.quality.issues.map((issue) => <li key={issue.code}>{issue.guide}</li>)}</ul>}
      {state.quality?.limitations?.includes("crop_signal_unknown") && <p role="status">Границы вещи не удалось надёжно оценить автоматически. Перед сохранением вручную проверьте, что вещь целиком в кадре; это не считается автоматическим подтверждением качества.</p>}
      {copy && <div role={state.status === PHOTO_INTAKE_STATUS.RETAKE ? "alert" : "status"}><strong>{copy.title}</strong><p>{copy.body}</p></div>}
    </section>
  );
}

export default PhotoIntake;
