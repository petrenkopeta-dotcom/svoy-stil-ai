import React, { useEffect, useRef, useState } from "react";
import { featherMask, paddedAlphaBounds, pointerToImagePoint, postprocessMask } from "./maskEditor.js";
import "./MaskEditor.css";

const imageFrom = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
const blobFromCanvas = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("MASK_ENCODE_FAILED")), "image/png"));

export function MaskEditor({ sourceUrl, maskUrl, onApply, onCancel, onManualFallback }) {
  const sourceCanvas = useRef(null), editCanvas = useRef(null), resultCanvas = useRef(null), gesture = useRef(null), sourcePixels = useRef(null), initialMask = useRef(null), history = useRef([]), future = useRef([]);
  const [tool, setTool] = useState("add"), [brush, setBrush] = useState(28), [zoom, setZoom] = useState(1), [ready, setReady] = useState(false), [revision, setRevision] = useState(0), [message, setMessage] = useState("Готовим локальную маску…");

  const render = () => {
    const edit = editCanvas.current, result = resultCanvas.current, pixels = sourcePixels.current;
    if (!edit || !result || !pixels) return;
    const mask = edit.getContext("2d").getImageData(0, 0, edit.width, edit.height).data;
    const output = new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
    for (let i = 0; i < mask.length; i += 4) output.data[i + 3] = mask[i + 3];
    result.getContext("2d").putImageData(output, 0, 0);
    setRevision((value) => value + 1);
  };

  useEffect(() => {
    let active = true;
    Promise.all([imageFrom(sourceUrl), imageFrom(maskUrl)]).then(([source, maskImage]) => {
      if (!active) return;
      const width = source.naturalWidth, height = source.naturalHeight;
      for (const canvas of [sourceCanvas.current, editCanvas.current, resultCanvas.current]) { canvas.width = width; canvas.height = height; }
      const sourceContext = sourceCanvas.current.getContext("2d", { willReadFrequently: true }); sourceContext.drawImage(source, 0, 0, width, height); sourcePixels.current = sourceContext.getImageData(0, 0, width, height);
      const scratch = document.createElement("canvas"); scratch.width = width; scratch.height = height; const context = scratch.getContext("2d", { willReadFrequently: true }); context.drawImage(maskImage, 0, 0, width, height);
      const rgba = context.getImageData(0, 0, width, height).data, raw = new Uint8ClampedArray(width * height);
      for (let p = 0, i = 0; p < raw.length; p += 1, i += 4) raw[p] = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
      const clean = postprocessMask(raw, width, height), imageData = new ImageData(width, height);
      for (let p = 0, i = 0; p < clean.length; p += 1, i += 4) { imageData.data[i] = 88; imageData.data[i + 1] = 210; imageData.data[i + 2] = 150; imageData.data[i + 3] = clean[p]; }
      editCanvas.current.getContext("2d", { willReadFrequently: true }).putImageData(imageData, 0, 0); initialMask.current = imageData;
      history.current = []; future.current = []; setReady(true); setMessage("Маска очищена от малых островков и небольших разрывов."); render();
    }).catch(() => setMessage("Не удалось открыть автомаску. Вернитесь к ручному контуру."));
    return () => { active = false; sourcePixels.current = null; initialMask.current = null; history.current = []; future.current = []; };
  }, [sourceUrl, maskUrl]);

  const snapshot = () => editCanvas.current.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, editCanvas.current.width, editCanvas.current.height);
  const restore = (data) => { editCanvas.current.getContext("2d").putImageData(data, 0, 0); render(); };
  const begin = (event) => {
    if (!ready || event.button > 0) return; event.preventDefault(); history.current = [...history.current.slice(-19), snapshot()]; future.current = []; gesture.current = event.pointerId; try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {} paint(event);
  };
  const paint = (event) => {
    if (gesture.current !== event.pointerId) return; event.preventDefault(); const canvas = editCanvas.current; const point = pointerToImagePoint(canvas.getBoundingClientRect(), event.clientX, event.clientY, canvas.width, canvas.height); if (!point) return;
    const context = canvas.getContext("2d"); context.save(); context.globalCompositeOperation = tool === "add" ? "source-over" : "destination-out"; context.fillStyle = "rgba(88,210,150,1)"; context.beginPath(); context.arc(point.x, point.y, brush / 2, 0, Math.PI * 2); context.fill(); context.restore(); render();
  };
  const end = (event) => { if (gesture.current !== event.pointerId) return; try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {} gesture.current = null; };
  const undo = () => { const previous = history.current.pop(); if (!previous) return; future.current.push(snapshot()); restore(previous); };
  const redo = () => { const next = future.current.pop(); if (!next) return; history.current.push(snapshot()); restore(next); };
  const reset = () => { if (!initialMask.current) return; history.current.push(snapshot()); future.current = []; restore(initialMask.current); };
  const apply = async () => {
    const edit = editCanvas.current, rgba = edit.getContext("2d").getImageData(0, 0, edit.width, edit.height).data, alpha = new Uint8ClampedArray(edit.width * edit.height);
    for (let p = 0, i = 0; p < alpha.length; p += 1, i += 4) alpha[p] = rgba[i + 3];
    const feathered = featherMask(alpha, edit.width, edit.height), bounds = paddedAlphaBounds(feathered, edit.width, edit.height, .04); if (!bounds) { setMessage("Маска пуста — добавьте видимую область вещи."); return; }
    const output = resultCanvas.current, pixels = new ImageData(new Uint8ClampedArray(sourcePixels.current.data), edit.width, edit.height); for (let p = 0, i = 0; p < feathered.length; p += 1, i += 4) pixels.data[i + 3] = feathered[p]; output.getContext("2d").putImageData(pixels, 0, 0);
    await onApply({ blob: await blobFromCanvas(output), bounds });
  };

  return <section className="mask-editor" aria-labelledby="mask-editor-title" data-revision={revision}>
    <div className="mask-editor__heading"><div><h3 id="mask-editor-title">Уточнить маску вещи</h3><p>Меняйте только видимую область: редактор не дорисовывает скрытые части и не меняет исходное фото.</p></div><button type="button" onClick={onCancel}>Закрыть редактор</button></div>
    <div className="mask-editor__toolbar" role="toolbar" aria-label="Инструменты маски">
      <button type="button" aria-pressed={tool === "add"} onClick={() => setTool("add")}>Добавить область</button><button type="button" aria-pressed={tool === "remove"} onClick={() => setTool("remove")}>Убрать область</button>
      <label>Кисть <input aria-label="Размер кисти" type="range" min="8" max="120" value={brush} onChange={(e) => setBrush(Number(e.target.value))}/><output>{brush}px</output></label>
      <label>Масштаб <input aria-label="Масштаб превью" type="range" min="1" max="2.5" step=".1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}/><output>{zoom.toFixed(1)}×</output></label>
      <button type="button" onClick={undo} disabled={!history.current.length}>Отменить</button><button type="button" onClick={redo} disabled={!future.current.length}>Повторить</button><button type="button" onClick={reset}>Сбросить</button>
    </div>
    <div className="mask-editor__previews" style={{ "--mask-zoom": zoom }}>
      <figure><figcaption>Исходник</figcaption><div><canvas ref={sourceCanvas}/></div></figure>
      <figure><figcaption>Контур и маска</figcaption><div className="mask-editor__edit"><img src={sourceUrl} alt="" draggable="false"/><canvas ref={editCanvas} onPointerDown={begin} onPointerMove={paint} onPointerUp={end} onPointerCancel={end} aria-label="Холст редактирования маски" role="img" tabIndex="0"/></div></figure>
      <figure><figcaption>Результат на прозрачном фоне</figcaption><div className="mask-editor__checker"><canvas ref={resultCanvas}/></div></figure>
    </div>
    <p role="status">{message}</p><div className="mask-editor__actions">{onManualFallback && <button type="button" onClick={onManualFallback}>Исправить контур клавиатурой</button>}<button type="button" onClick={onCancel}>Отмена</button><button type="button" className="primary" disabled={!ready} onClick={() => void apply()}>Применить маску</button></div>
  </section>;
}
