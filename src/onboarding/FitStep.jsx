import React from "react";import{WizardChoiceGroup}from"./WizardChoiceGroup.jsx";
const FITS=[
  {value:"Свободная",label:"Свободная",description:"Вещи не прилегают и оставляют больше воздуха"},
  {value:"Сбалансированная",label:"По фигуре, но не тесно",description:"Контур заметен, движения остаются свободными"},
  {value:"Собранная",label:"Более прилегающая",description:"Чёткий силуэт и минимум лишнего объёма"},
];
export function FitStep({answers,update}){return <WizardChoiceGroup n="02" title="Как вещи должны сидеть?" description="Здесь нет правильного ответа — выбирайте по ощущению комфорта." required value={answers.fit} items={FITS} set={(fit)=>update({fit})}/>;}
