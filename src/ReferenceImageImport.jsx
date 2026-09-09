import React, { useEffect, useMemo, useRef, useState } from "react";
import { createImageImportController, imageFromClipboardApi, imageFromClipboardEvent, imageFromDropEvent, ImageImportError } from "./imageImport.js";

function ImportIcon({ type }) {
  if (type === "camera") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7.5h3l1.5-2h7l1.5 2h3v11H4z"/><circle cx="12" cy="13" r="3.25"/></svg>;
  if (type === "paste") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 5.5V4h6v1.5M7 6h10v14H7z"/><path d="M10 10h4M10 14h4"/></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="16" rx="1"/><circle cx="16" cy="9" r="1.5"/><path d="m5.5 17 4.5-5 3.5 3 2-2 3 4"/></svg>;
}

export function ReferenceImageImport({ onImported, purpose = "reference", controller: suppliedController }) {
  const controller = useMemo(() => suppliedController || createImageImportController(), [suppliedController]);
  const pasteZone = useRef(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => controller.dispose(), [controller]);

  async function accept(file, provenance) {
    setBusy(true); setError(null);
    try { onImported?.(await controller.import(file, { provenance, purpose })); }
    catch (caught) { if (caught instanceof ImageImportError && caught.code !== "image_import_cancelled") setError(caught.code); }
    finally { setBusy(false); }
  }
  function paste(event) { try { void accept(imageFromClipboardEvent(event), "paste"); } catch (caught) { setError(caught.code || "image_import_no_image"); } }
  function drop(event) { try { void accept(imageFromDropEvent(event), "drag"); } catch (caught) { setError(caught.code || "image_import_no_image"); } }
  async function pasteFromButton() {
    setError(null);
    try { await accept(await imageFromClipboardApi(), "paste"); }
    catch (caught) { setError(caught.code || "image_import_permission_denied"); pasteZone.current?.focus(); }
  }

  return <section className="reference-import" aria-label="Импорт фото" onPaste={paste}>
    <div className="reference-import-heading"><h3>Как добавить фото?</h3><p>Изображение передаётся same-origin локальному worker на этом устройстве; внешней отправки нет.</p></div>
    <div className="reference-import-methods">
      <label className="reference-import-card"><ImportIcon type="gallery" /><strong>Из галереи</strong><span>Выбрать готовое фото</span><input type="file" accept="image/*" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void accept(file, "gallery"); event.target.value = ""; }} /></label>
      <label className="reference-import-card"><ImportIcon type="camera" /><strong>Сфотографировать</strong><span>Сделать снимок сейчас</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void accept(file, "camera"); event.target.value = ""; }} /></label>
      <button className="reference-import-card" type="button" disabled={busy} onClick={() => void pasteFromButton()}><ImportIcon type="paste" /><strong>Вставить фото</strong><span>Из буфера обмена</span></button>
    </div>
    <div className="reference-import-drop" ref={pasteZone} tabIndex={0} role="textbox" aria-multiline="false" contentEditable suppressContentEditableWarning aria-label="Зона перетаскивания и вставки фото" onBeforeInput={(event) => event.preventDefault()} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
      <span aria-hidden="true">↓</span><div><strong>Перетащите фото сюда</strong><small>или сфокусируйте область и используйте системную команду «Вставить»</small></div><small>JPG, PNG или WebP · до 20 МБ</small>
    </div>
    <p className="reference-import-help">На iPhone и iPad, если вставка недоступна, сохраните изображение в «Фото» или «Файлы» и выберите «Из галереи».</p>
    {error && <p role="alert">Не удалось добавить фото ({error}). На iPhone/iPad сохраните фото в «Фото» или «Файлы», затем выберите «Загрузить фото». Поддерживаются JPEG, PNG и WebP.</p>}
  </section>;
}
