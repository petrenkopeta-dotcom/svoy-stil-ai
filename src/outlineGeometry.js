const clamp = (value) => Math.max(0, Math.min(1, value));

export function pointFromClient(rect, clientX, clientY) {
  if (!rect?.width || !rect?.height) return null;
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) };
}

export function nearestPointIndex(points, point, rect, radius = 18) {
  if (!point || !rect?.width || !rect?.height) return -1;
  let nearest = -1;
  let best = radius;
  points.forEach((candidate, index) => {
    const distance = Math.hypot((candidate.x - point.x) * rect.width, (candidate.y - point.y) * rect.height);
    if (distance <= best) { nearest = index; best = distance; }
  });
  return nearest;
}

export function normalizeClosedTrace(points, rect, radius = 18) {
  if (points.length < 4 || !rect?.width || !rect?.height) return points;
  const first = points[0], last = points.at(-1);
  const distance = Math.hypot((last.x - first.x) * rect.width, (last.y - first.y) * rect.height);
  return distance <= radius ? points.slice(0, -1) : points;
}
