import React, { useMemo, useState } from "react";
import { buildCapsule } from "./capsuleEngine.js";
import { CapsuleDetail, CapsuleEmpty, CapsuleEntry, OutfitMatrix } from "./CapsuleUI.jsx";
import { makeCapsuleRequest } from "./capsuleAppAdapter.js";
import "./CapsuleExperience.css";

const reasonText = (codes) => codes?.length
  ? "Часть признаков не подтверждена; результат опирается только на состав и известные категории вещей."
  : "Сочетание собрано из подтверждённых вещей этой капсулы.";

export function CapsuleExperience({ demoItems, personalItems, personalAllowed, ownerScope, occasion, onRequestPersonal, onWardrobe }) {
  const [mode, setMode] = useState("demo");
  const [generated, setGenerated] = useState(false);
  const items = mode === "demo" ? demoItems : personalItems;
  const request = useMemo(() => makeCapsuleRequest({ items, mode, ownerScope: mode === "demo" ? "demo-session" : ownerScope, occasion }), [items, mode, ownerScope, occasion]);
  const output = useMemo(() => generated ? buildCapsule(request) : null, [generated, request]);
  const byId = new Map(request.wardrobe.map((item) => [item.id, item]));
  const openPersonal = () => {
    if (!personalAllowed) return onRequestPersonal();
    setMode("personal"); setGenerated(false);
  };
  const capsule = output && {
    mode, name: mode === "demo" ? "Рабочая капсула — пример" : "Моя рабочая капсула",
    itemCount: output.result.itemIds.length, outfitCount: output.result.looks.length,
    contexts: [occasion || "work"], summaryContext: "для выбранной ситуации",
    items: output.result.itemIds.map((id) => byId.get(id)).filter(Boolean),
  };
  const outfits = output?.result.looks.map((look, index) => ({
    id: `${look.scenarioId}-${index}`, title: `Образ ${index + 1}`, context: occasion || "Работа",
    items: look.itemIds.map((id) => byId.get(id)).filter(Boolean), reason: reasonText(look.reasonCodes),
  })) || [];

  return <section className="capsule-page" data-capsule-mode={mode}>
    <div className="capsule-mode-switch" aria-label="Источник вещей">
      <button type="button" aria-pressed={mode === "demo"} onClick={() => { setMode("demo"); setGenerated(false); }}>Демо</button>
      <button type="button" aria-pressed={mode === "personal"} onClick={openPersonal}>Мои вещи</button>
    </div>
    {!generated && <CapsuleEntry mode={mode} onPrimary={() => setGenerated(true)} onExample={() => { setMode("demo"); setGenerated(true); }} />}
    {generated && output.result.status === "hold" && <CapsuleEmpty kind="coverage" onAction={onWardrobe} />}
    {generated && output.result.status !== "hold" && <><CapsuleDetail capsule={capsule} onOutfits={() => document.getElementById("capsule-outfits")?.scrollIntoView()} onSecondary={mode === "personal" ? onWardrobe : openPersonal} /><div id="capsule-outfits"><OutfitMatrix outfits={outfits} mode={mode} /></div></>}
    <p className="capsule-local-note">Локальный прототип: ничего не отправляется в сеть и не сохраняется как личная капсула.</p>
  </section>;
}
