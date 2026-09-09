import { generateAndRankCandidates } from "./stylistCandidateEngine.js";

const normalize=s=>(s||'').toLowerCase();
const includes=(value,query)=>normalize(value).includes(normalize(query));

const TYPE_MAP={
  dress:['плать','комбинезон'],
  layer:['верхний слой','верхняя одежда','жакет','тренч','пальто','куртк'],
  shoes:['обув','лофер','кед','бот','туф','сапог'],
  bottom:['низ','брюк','джинс','юбк','шорт'],
  top:['верх','рубаш','свитер','блуз','топ','футбол'],
  accessory:['аксессуар','сумк','ремень','шарф']
};

export function itemKind(item){
  const hay=`${item.type} ${item.name}`;
  return Object.entries(TYPE_MAP).find(([,words])=>words.some(w=>includes(hay,w)))?.[0]||'top';
}

const colorGroups={
  neutral:['бел','черн','сер','беж','молоч','корич'],
  cool:['син','голуб','зел','фиолет'],
  warm:['крас','роз','оранж','желт','бордо']
};
const colorGroup=color=>Object.entries(colorGroups).find(([,xs])=>xs.some(x=>includes(color,x)))?.[0]||'neutral';
const compatibleColors=(a,b)=>a==='neutral'||b==='neutral'||a===b;
const styleTokens=item=>normalize(item.style).split(/\s*[·,/+]\s*/).filter(Boolean);

const signature=items=>items.map(x=>x.id).sort().join('-');

function requestForFlow(prefs={},anchorId=null,learningContext=null){
  return {
    anchorId,
    occasion:prefs.goal,
    preferences:{styleTags:[prefs.style].filter(Boolean)},
    limit:30,
    learningContext,
  };
}

/** Product orchestration adapter. Engine ranking data never crosses this boundary. */
export function generateOutfitFlow(items,prefs,history=[],anchorId=null,learningContext=null){
  const result=generateAndRankCandidates(items,requestForFlow(prefs,anchorId,learningContext));
  const recent=new Set(history.map(h=>h.signature).filter(Boolean));
  const looks=result.candidates.map(candidate=>({
    items:candidate.items,
    signature:signature(candidate.items),
  })).sort((a,b)=>Number(recent.has(a.signature))-Number(recent.has(b.signature)));
  return {looks,noCandidateReasons:result.noCandidateReasons};
}

export function generateOutfits(items,prefs,history=[],anchorId=null,learningContext=null){
  return generateOutfitFlow(items,prefs,history,anchorId,learningContext).looks;
}

export function missingCategoriesForAnchor(anchor,items){
  if(!anchor)return ['любимая вещь'];
  const kinds=new Set(items.filter(item=>item.id!==anchor.id).map(itemKind));
  const kind=itemKind(anchor); const missing=[];
  if(kind==='dress'){
    if(!kinds.has('shoes'))missing.push('обувь');
  }else{
    if(kind!=='top'&&!kinds.has('top'))missing.push('верх');
    if(kind!=='bottom'&&!kinds.has('bottom'))missing.push('низ');
    if(kind!=='shoes'&&!kinds.has('shoes'))missing.push('обувь');
  }
  return missing;
}

export function missingCategories(items){
  const kinds=new Set(items.map(itemKind));
  const missing=[];
  if(!kinds.has('dress')&&!(kinds.has('top')&&kinds.has('bottom')))missing.push('верх и низ или платье');
  if(!kinds.has('shoes'))missing.push('обувь');
  return missing;
}

export function alternativesFor(item,items){const kind=itemKind(item);return items.filter(x=>x.id!==item.id&&itemKind(x)===kind)}
