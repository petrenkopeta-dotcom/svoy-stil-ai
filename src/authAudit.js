const ALLOWED = new Set(["event","result","occurredAt","correlationId","userId"]);
export function safeAuthAuditEvent(input){return Object.fromEntries(Object.entries(input).filter(([key,value])=>ALLOWED.has(key)&&value!=null));}
