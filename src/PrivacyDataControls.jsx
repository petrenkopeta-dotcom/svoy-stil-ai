import React, { useState } from "react";

export function PrivacyDataControls({
  controller,
  onReset,
  onDelete,
  reload = () => globalThis.location?.reload(),
}) {
  const deletionResult = useState(() => controller.consumeDeletionResult())[0];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState(
    deletionResult ? "Все локальные данные удалены. Вы можете начать заново." : "",
  );
  const exportName = `ai-stylist-export-${new Date().toISOString().slice(0, 10)}.json`;

  const reset = () => {
    controller.resetProfile();
    onReset?.();
    setStatus("Профиль, предпочтения и сохранённые рекомендации сброшены. Гардероб сохранён.");
  };

  const deleteAll = async () => {
    await controller.deleteAll();
    onDelete?.();
    setConfirmDelete(false);
    reload?.();
  };

  return (
    <section className="privacy-data-controls" aria-labelledby="privacy-data-title">
      <h2 id="privacy-data-title">Локальные данные</h2>
      <p>
        Данные хранятся на этом устройстве. Экспорт включает профиль, гардероб и предпочтения,
        но не временные адреса фотографий.
      </p>
      <div className="privacy-data-actions">
        <a className="privacy-data-button" href={controller.exportHref()} download={exportName}>
          Экспортировать данные
        </a>
        <button type="button" onClick={reset}>Сбросить профиль и рекомендации</button>
        {!confirmDelete ? (
          <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
            Удалить все локальные данные
          </button>
        ) : (
          <div role="alert" className="privacy-delete-confirmation">
            <p>
              Удалятся гардероб, образы, профиль, предпочтения, согласия и сохранённый контекст.
              Это нельзя отменить.
            </p>
            <button type="button" className="danger" onClick={deleteAll}>Да, удалить всё</button>
            <button type="button" onClick={() => setConfirmDelete(false)}>Отмена</button>
          </div>
        )}
      </div>
      {status && <p role="status">{status}</p>}
    </section>
  );
}

export default PrivacyDataControls;
