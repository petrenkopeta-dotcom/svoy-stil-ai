import React, { useEffect, useState } from "react";
import { PERSON_PHOTO_S1_FIXTURE_IDS } from "./personPhotoS1Prototype.js";

/** Developer harness only. It is deliberately not imported by main.jsx. */
export function PersonPhotoS1Prototype({ controller }) {
  const [state, setState] = useState(controller.getState());
  useEffect(() => () => controller.exit(), [controller]);
  const open = async (fixtureId) => setState(await controller.openSyntheticFixture({
    fixtureId,
    ownerScope: "developer_s1",
    mode: "demo",
    injectedSignals: { person: { present: false, confidence: "high" }, face: { present: false, confidence: "high" } },
  }));
  return <section aria-labelledby="person-photo-s1-title">
    <h2 id="person-photo-s1-title">Synthetic guidance harness</h2>
    <p>No detector capability. Synthetic no-person fixtures and injected coarse signals only.</p>
    {PERSON_PHOTO_S1_FIXTURE_IDS.map((id) => <button key={id} type="button" onClick={() => open(id)}>{id}</button>)}
    {state.preview_url && <img src={state.preview_url} alt="Synthetic abstract garment QA fixture" />}
    <output aria-live="polite">{state.status}</output>
    <button type="button" onClick={() => { controller.cancel(); setState(controller.getState()); }}>Cancel and dispose</button>
  </section>;
}
