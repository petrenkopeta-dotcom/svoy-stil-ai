const MIN_AREA = 0.001;
const GEOMETRY_EPSILON = 1e-10;
const finitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const samePoint = (a, b) => Math.abs(a.x - b.x) <= GEOMETRY_EPSILON && Math.abs(a.y - b.y) <= GEOMETRY_EPSILON;
const orientation = (a, b, c) => { const value = cross(a, b, c); return Math.abs(value) <= GEOMETRY_EPSILON ? 0 : value > 0 ? 1 : -1; };
const onSegment = (a, point, b) => orientation(a, point, b) === 0 && point.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON && point.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON && point.y >= Math.min(a.y, b.y) - GEOMETRY_EPSILON && point.y <= Math.max(a.y, b.y) + GEOMETRY_EPSILON;
const segmentsIntersect = (a, b, c, d) => {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  return (o1 !== o2 && o3 !== o4) || (o1 === 0 && onSegment(a, c, b)) || (o2 === 0 && onSegment(a, d, b)) || (o3 === 0 && onSegment(c, a, d)) || (o4 === 0 && onSegment(c, b, d));
};
const adjacentOverlap = (a, shared, d) => orientation(a, shared, d) === 0 && (onSegment(a, d, shared) || onSegment(shared, a, d));
const invalidEdgeIntersections = (points) => {
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    const a = points[i], b = points[(i + 1) % count];
    if (samePoint(a, b)) return true;
    for (let j = i + 1; j < count; j += 1) {
      const c = points[j], d = points[(j + 1) % count];
      const adjacentForward = j === i + 1;
      const adjacentClosure = i === 0 && j === count - 1;
      if (adjacentForward) { if (adjacentOverlap(a, b, d)) return true; continue; }
      if (adjacentClosure) { if (adjacentOverlap(b, a, c)) return true; continue; }
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
};
const area = (points) => Math.abs(points.reduce((sum, point, index) => sum + point.x * points[(index + 1) % points.length].y - points[(index + 1) % points.length].x * point.y, 0)) / 2;

export function createGarmentSelection(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const clean = points.map((point) => ({ x: Number(point?.x), y: Number(point?.y) }));
  if (!clean.every(finitePoint)) return null;
  for (let i = 0; i < clean.length; i += 1) for (let j = i + 1; j < clean.length; j += 1) if (samePoint(clean[i], clean[j])) return null;
  if (area(clean) < MIN_AREA || invalidEdgeIntersections(clean)) return null;
  const xs = clean.map((point) => point.x); const ys = clean.map((point) => point.y);
  return Object.freeze({ version: "manual-outline-v1", points: Object.freeze(clean.map(Object.freeze)), bounds: Object.freeze({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }), source: "user_confirmed" });
}
