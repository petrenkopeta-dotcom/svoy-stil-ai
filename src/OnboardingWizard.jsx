import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { clearWizardState, isWizardStepComplete, loadWizardState, ONBOARDING_STEP_COUNT, saveWizardState, wizardPreferences } from "./onboardingWizardState.js";
import { OccasionDressCodeStep } from "./onboarding/OccasionDressCodeStep.jsx";
import { FitStep } from "./onboarding/FitStep.jsx";
import { ColorComparisonStep } from "./onboarding/ColorComparisonStep.jsx";

const STEPS=[OccasionDressCodeStep,FitStep,ColorComparisonStep];
const TITLES = ["Куда собираемся?", "Комфортная посадка", "Сочетания цветов"];

export function OnboardingWizard({ preferences, onComplete, onStepCompleted }) {
  const storage = globalThis.sessionStorage;
  const [state, setState] = useState(() => loadWizardState(storage, preferences));
  const Step = STEPS[state.step];
  useEffect(() => saveWizardState(state, storage), [state, storage]);
  const update = (patch) => setState((current) => ({ ...current, answers: { ...current.answers, ...patch } }));
  const complete = () => {
    const result = wizardPreferences(state, preferences);
    clearWizardState(storage);
    onComplete(result, state.consent);
  };
  return <section className="page onboarding-wizard" aria-labelledby="wizard-title">
    <header className="wizard-header"><span>ТРИ РЕШЕНИЯ ДЛЯ СТАРТА</span><b aria-label={`Шаг ${state.step + 1} из ${ONBOARDING_STEP_COUNT}`}>{state.step + 1}/{ONBOARDING_STEP_COUNT}</b></header>
    <div className="wizard-progress" role="progressbar" aria-valuemin="1" aria-valuemax={ONBOARDING_STEP_COUNT} aria-valuenow={state.step + 1} aria-label="Прогресс онбординга"><span style={{ width: `${((state.step + 1) / ONBOARDING_STEP_COUNT) * 100}%` }} /></div>
    <div className="wizard-title"><p>Шаг {state.step + 1}</p><h1 id="wizard-title" tabIndex="-1">{TITLES[state.step]}</h1></div>
    <Step answers={state.answers} update={update} />
    {state.step === ONBOARDING_STEP_COUNT - 1 && <label className="wizard-consent"><input type="checkbox" checked={state.consent} onChange={(event) => setState({ ...state, consent: event.target.checked })} /><span><b>Запомнить мои ответы на этом устройстве</b><small>Необязательно. Без галочки ответы используются только в текущей сессии. Фото и параметры тела не нужны.</small></span></label>}
    <footer className="wizard-actions">
      <button type="button" aria-label="Вернуться к предыдущему шагу" disabled={state.step === 0} onClick={() => setState({ ...state, step: state.step - 1 })}><ArrowLeft size={18} aria-hidden="true" /> Назад</button>
      {state.step < ONBOARDING_STEP_COUNT - 1
        ? <button type="button" className="primary" disabled={!isWizardStepComplete(state.step, state)} onClick={() => { onStepCompleted?.(state.step + 1); setState({ ...state, step: state.step + 1 }); }}>Дальше <ArrowRight size={18} aria-hidden="true" /></button>
        : <button type="button" className="primary" disabled={!isWizardStepComplete(state.step, state)} onClick={complete}>Продолжить <ArrowRight size={18} aria-hidden="true" /></button>}
    </footer>
    {!isWizardStepComplete(state.step, state) && <p className="wizard-required" role="status">Выберите один вариант, чтобы продолжить.</p>}
  </section>;
}
