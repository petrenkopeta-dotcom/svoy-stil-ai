const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function pointerToImagePoint(rect, clientX, clientY, width, height) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (x < 0 || y < 0 || x > 1 || y > 1) return null;
  return { x: clamp(Math.round(x * (width - 1)), 0, width - 1), y: clamp(Math.round(y * (height - 1)), 0, height - 1) };
}

export function removeSmallIslands(mask, width, height, minimumArea = Math.max(16, Math.round(width * height * 0.00015))) {
  const output = new Uint8ClampedArray(mask), seen = new Uint8Array(mask.length);
  for (let start = 0; start < output.length; start += 1) {
    if (!output[start] || seen[start]) continue;
    const stack = [start], component = []; seen[start] = 1;
    while (stack.length) {
      const index = stack.pop(); component.push(index);
      const x = index % width, y = Math.floor(index / width);
      for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (next >= 0 && output[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
      }
    }
    if (component.length < minimumArea) for (const index of component) output[index] = 0;
  }
  return output;
}

function morphology(mask, width, height, mode) {
  const output = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let value = mode === "dilate" ? 0 : 255;
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      const nx = x + ox, ny = y + oy;
      const sample = nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : mask[ny * width + nx];
      value = mode === "dilate" ? Math.max(value, sample) : Math.min(value, sample);
    }
    output[y * width + x] = value;
  }
  return output;
}

export function postprocessMask(mask, width, height) {
  const binary = Uint8ClampedArray.from(mask, (value) => value >= 128 ? 255 : 0);
  return removeSmallIslands(morphology(morphology(binary, width, height, "dilate"), width, height, "erode"), width, height);
}

export function featherMask(mask, width, height) {
  const output = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let sum = 0, weight = 0;
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const w = ox === 0 && oy === 0 ? 4 : (ox === 0 || oy === 0 ? 2 : 1);
      sum += mask[ny * width + nx] * w; weight += w;
    }
    output[y * width + x] = Math.round(sum / weight);
  }
  return output;
}

export function paddedAlphaBounds(alpha, width, height, paddingRatio = 0.04) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let index = 0; index < alpha.length; index += 1) if (alpha[index] > 8) {
    const x = index % width, y = Math.floor(index / width);
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) return null;
  const padX = Math.max(1, Math.round((right - left + 1) * clamp(paddingRatio, .03, .05)));
  const padY = Math.max(1, Math.round((bottom - top + 1) * clamp(paddingRatio, .03, .05)));
  left = Math.max(0, left - padX); top = Math.max(0, top - padY);
  right = Math.min(width - 1, right + padX); bottom = Math.min(height - 1, bottom + padY);
  return { x: left / width, y: top / height, width: (right - left + 1) / width, height: (bottom - top + 1) / height };
}
