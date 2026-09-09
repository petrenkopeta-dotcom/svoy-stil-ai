import React from "react";import{WizardChoiceGroup}from"./WizardChoiceGroup.jsx";
export function ThermalComfortStep({answers,update}){return <WizardChoiceGroup n="03" title="Как вы обычно ощущаете температуру?" value={answers.thermalComfort} items={["Часто мёрзну","Обычно комфортно","Мне часто жарко"]} set={(thermalComfort)=>update({thermalComfort})}/>;}
