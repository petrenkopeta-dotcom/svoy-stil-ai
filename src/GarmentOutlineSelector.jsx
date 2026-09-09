import React, { useEffect, useMemo, useRef, useState } from "react";
import { createGarmentSelection } from "./garmentSelection.js";
import { nearestPointIndex, normalizeClosedTrace, pointFromClient } from "./outlineGeometry.js";
import "./GarmentOutlineSelector.css";

const DRAW_STEP_PX = 7;

export function GarmentOutlineSelector({ blob, onConfirm, onClear, onCancel }) {
  const image = useRef(null);
  const gesture = useRef(null);
  const [points, setPoints] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [keyboardPoint, setKeyboardPoint] = useState({ x: 50, y: 50 });
  const [selectedPoint, setSelectedPoint] = useState(0);
  const [error, setError] = useState("");
  const url = useMemo(() => blob ? URL.createObjectURL(blob) : "", [blob]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const imageRect = () => image.current?.getBoundingClientRect() || null;

  function startGesture(event) {
    if (confirmed || event.button > 0) return;
    const rect = imageRect();
    const point = pointFromClient(rect, event.clientX, event.clientY);
    if (!point) { setError("Начните контур внутри изображения вещи."); return; }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const handle = nearestPointIndex(points, point, rect);
    if (handle >= 0) {
      gesture.current = { mode: "move", index: handle, pointerId: event.pointerId };
      setSelectedPoint(handle);
      setKeyboardPoint({ x: Math.round(points[handle].x * 100), y: Math.round(points[handle].y * 100) });
      return;
    }
    setError("");
    setPoints((current) => {
      const next = [...current, point];
      setSelectedPoint(next.length - 1);
      return next;
    });
    gesture.current = { mode: "draw", pointerId: event.pointerId, last: point };
  }

  function continueGesture(event) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId || confirmed) return;
    const rect = imageRect();
    const point = pointFromClient(rect, event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    if (active.mode === "move") {
      setPoints((current) => current.map((candidate, index) => index === active.index ? point : candidate));
      return;
    }
    const distance = Math.hypot((point.x - active.last.x) * rect.width, (point.y - active.last.y) * rect.height);
    if (distance < DRAW_STEP_PX) return;
    active.last = point;
    setPoints((current) => [...current, point]);
  }

  function endGesture(event) {
    if (gesture.current?.pointerId !== event.pointerId) return;
    if (gesture.current.mode === "draw") setPoints((current) => normalizeClosedTrace(current, imageRect()));
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    gesture.current = null;
  }

  function addKeyboardPoint() {
    if (confirmed) return;
    setError("");
    setPoints((current) => {
      const next = [...current, { x: keyboardPoint.x / 100, y: keyboardPoint.y / 100 }];
      setSelectedPoint(next.length - 1);
      return next;
    });
  }

  function moveSelectedPoint() {
    if (confirmed || !points.length) return;
    setPoints((current) => current.map((point, index) => index === selectedPoint ? { x: keyboardPoint.x / 100, y: keyboardPoint.y / 100 } : point));
  }

  function reset() {
    gesture.current = null;
    setPoints([]); setSelectedPoint(0); setConfirmed(false); setError(""); onClear?.();
  }

  function confirm() {
    const selection = createGarmentSelection(points);
    if (!selection) { setError("Контур пересекает сам себя или слишком мал. Исправьте точки и повторите."); return; }
    setConfirmed(true); setError(""); onConfirm?.(selection);
  }

  const polygon = points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");
  return <section className="garment-outline" aria-labelledby="garment-outline-title">
    <div className="garment-outline-heading">
      <div><h3 id="garment-outline-title">Обведите вещь на фото</h3><p>Проведите пальцем или мышью по краю вещи. Любую точку можно захватить и передвинуть.</p></div>
      {onCancel && <button type="button" className="garment-outline-back" onClick={onCancel}>← Назад к фото</button>}
    </div>
    <div className={`garment-outline-frame${confirmed ? " is-confirmed" : ""}`} role="group" aria-label="Редактор контура вещи. Проведите по краю вещи или перетащите существующую точку.">
      <div className="garment-outline-canvas" onPointerDown={startGesture} onPointerMove={continueGesture} onPointerUp={endGesture} onPointerCancel={endGesture}>
        <img ref={image} src={url} alt="Загруженное фото для выделения вещи" draggable="false" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{points.length > 1 && <polyline points={polygon}/>} {points.length > 2 && <polygon points={polygon}/>} {points.map((point, index) => <circle className={index === selectedPoint ? "is-selected" : ""} key={index} cx={point.x * 100} cy={point.y * 100} r="1.7"/>)}</svg>
      </div>
    </div>
    <fieldset className="garment-outline-keyboard"><legend>Точное управление точками</legend>{points.length > 0 && <label>Точка<select value={selectedPoint} onChange={(event) => { const index = Number(event.target.value); setSelectedPoint(index); setKeyboardPoint({ x: Math.round(points[index].x * 100), y: Math.round(points[index].y * 100) }); }}>{points.map((_, index) => <option value={index} key={index}>№ {index + 1}</option>)}</select></label>}<label>X, %<input type="number" min="0" max="100" value={keyboardPoint.x} onChange={(event) => setKeyboardPoint((value) => ({ ...value, x: Math.max(0, Math.min(100, Number(event.target.value))) }))}/></label><label>Y, %<input type="number" min="0" max="100" value={keyboardPoint.y} onChange={(event) => setKeyboardPoint((value) => ({ ...value, y: Math.max(0, Math.min(100, Number(event.target.value))) }))}/></label>{points.length > 0 && <button type="button" onClick={moveSelectedPoint} disabled={confirmed}>Передвинуть</button>}<button type="button" onClick={addKeyboardPoint} disabled={confirmed}>Добавить точку</button></fieldset>
    <div className="garment-outline-actions"><button type="button" onClick={() => setPoints((current) => current.slice(0, -1))} disabled={!points.length || confirmed}>Отменить точку</button><button type="button" onClick={reset} disabled={!points.length}>Начать заново</button><button type="button" onClick={confirm} disabled={points.length < 3 || confirmed}>{confirmed ? "Контур подтверждён" : "Подтвердить контур"}</button></div>
    <p role="status">{error || (confirmed ? "Контур сохранён как локальная пользовательская подсказка." : `Точек: ${points.length}. Фото и контур остаются только на этом устройстве.`)}</p>
  </section>;
}
