import {
  CATEGORIES,
  COLORS,
  CONTRACT_VERSION,
  QUARANTINE_REASONS,
  coverageReport,
  importedDisposition,
  validateAnnotation,
} from "./annotation-core.js";

const $ = (id) => document.getElementById(id);
const readJson = async (input, fallback) =>
  input.files[0] ? JSON.parse(await input.files[0].text()) : fallback;
const download = (name, value) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
};
const fill = (select, values) => {
  select.replaceChildren(...values.map((value) => new Option(value, value)));
};
fill($("category"), CATEGORIES);
fill($("color"), COLORS);
fill($("reasons"), QUARANTINE_REASONS);
fill(
  $("additionalColors"),
  COLORS.filter((color) => color !== "unknown"),
);

let manifest = [],
  ownerManifest = { files: [] },
  queue = [],
  annotations = [],
  allowlist = [],
  quarantine = [],
  disposition = importedDisposition([], []),
  imageFiles = new Map(),
  index = 0,
  image = null,
  bbox = null,
  boundary = null,
  mode = "bbox",
  dragStart = null;
const canvas = $("canvas"),
  ctx = canvas.getContext("2d");

$("start").addEventListener("click", async () => {
  manifest = await readJson($("manifest"), []);
  ownerManifest = await readJson($("ownerManifest"), { files: [] });
  allowlist = await readJson($("allowlist"), []);
  quarantine = await readJson($("quarantine"), []);
  annotations = await readJson($("annotations"), []);
  disposition = importedDisposition(allowlist, quarantine);
  if (disposition.overlap.length)
    return alert(
      `ID одновременно в allowlist и quarantine: ${disposition.overlap.join(", ")}`,
    );
  const ownerRows = (ownerManifest.files || []).map((row) => ({
    id: row.id || row.file,
    file: row.file,
    title: row.ground_truth || row.file,
    source_scope: "owner-provided",
  }));
  queue = [
    ...manifest.map((row) => ({
      ...row,
      id: String(row.id),
      source_scope: "openverse",
    })),
    ...ownerRows,
  ];
  for (const file of [...$("images").files, ...$("ownerImages").files])
    imageFiles.set(file.name, file);
  if (!queue.length || !$("annotator").value.trim())
    return alert("Нужны manifest и ID разметчика");
  $("workspace").hidden = false;
  index = 0;
  await show();
});

async function show() {
  const row = queue[index],
    saved = annotations.find((item) => item.id === row.id);
  $("position").textContent =
    `${index + 1}/${queue.length}${row.source_scope === "owner-provided" ? " · OWNER (не headline)" : ""}`;
  $("itemMeta").textContent = `${row.id} · ${row.title || row.file}`;
  $("category").value = saved?.category || "unknown";
  $("color").value = saved?.primary_color || "unknown";
  $("notes").value = saved?.notes || "";
  $("categoryRu").value = saved?.category_ru || "";
  $("patternRu").value = saved?.pattern_ru || "";
  $("textureRu").value = saved?.texture_ru || "";
  $("trimRu").value = saved?.trim_ru || "";
  $("edgeVisibility").value = saved?.edge_visibility || "uncertain";
  $("backgroundRisk").value = saved?.background_match_risk || "medium";
  [...$("additionalColors").options].forEach(
    (option) =>
      (option.selected = (saved?.additional_colors || []).includes(
        option.value,
      )),
  );
  document
    .querySelectorAll('[name="suitability"]')
    .forEach(
      (input) =>
        (input.checked =
          input.value ===
          (saved?.suitability ||
            (disposition.held.has(row.id)
              ? "quarantine"
              : disposition.allowed.has(row.id)
                ? "allowlist"
                : ""))),
    );
  [...$("reasons").options].forEach(
    (option) =>
      (option.selected = (saved?.quarantine_reasons || []).includes(
        option.value,
      )),
  );
  bbox = saved?.bbox || null;
  boundary = saved?.boundary || null;
  $("mask").value = "";
  $("validation").value = "";
  const file = imageFiles.get(row.file);
  image = file ? await createImageBitmap(file) : null;
  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!image) {
    ctx.fillText("Локальный файл изображения не выбран", 20, 40);
    return;
  }
  const scale = Math.min(
      canvas.width / image.width,
      canvas.height / image.height,
    ),
    w = image.width * scale,
    h = image.height * scale,
    ox = (canvas.width - w) / 2,
    oy = (canvas.height - h) / 2;
  canvas._view = { ox, oy, w, h };
  ctx.drawImage(image, ox, oy, w, h);
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 3;
  if (bbox)
    ctx.strokeRect(
      ox + bbox.x * w,
      oy + bbox.y * h,
      bbox.width * w,
      bbox.height * h,
    );
  if (boundary?.length) {
    ctx.beginPath();
    boundary.forEach(([x, y], i) =>
      i
        ? ctx.lineTo(ox + x * w, oy + y * h)
        : ctx.moveTo(ox + x * w, oy + y * h),
    );
    if (boundary.length > 2) ctx.closePath();
    ctx.stroke();
  }
}
const point = (event) => {
  const r = canvas.getBoundingClientRect(),
    v = canvas._view,
    x = ((event.clientX - r.left) * canvas.width) / r.width,
    y = ((event.clientY - r.top) * canvas.height) / r.height;
  return [
    Math.max(0, Math.min(1, (x - v.ox) / v.w)),
    Math.max(0, Math.min(1, (y - v.oy) / v.h)),
  ];
};
canvas.addEventListener("pointerdown", (event) => {
  if (!image) return;
  if (mode === "bbox") dragStart = point(event);
  else {
    boundary ||= [];
    boundary.push(point(event));
    draw();
  }
});
canvas.addEventListener("pointerup", (event) => {
  if (!dragStart || mode !== "bbox") return;
  const end = point(event),
    x = Math.min(dragStart[0], end[0]),
    y = Math.min(dragStart[1], end[1]);
  bbox = {
    x,
    y,
    width: Math.abs(end[0] - dragStart[0]),
    height: Math.abs(end[1] - dragStart[1]),
  };
  dragStart = null;
  draw();
});
$("bboxMode").onclick = () => (mode = "bbox");
$("boundaryMode").onclick = () => {
  mode = "boundary";
  boundary = [];
  draw();
};
$("clearGeometry").onclick = () => {
  bbox = null;
  boundary = null;
  draw();
};
$("prev").onclick = async () => {
  index = Math.max(0, index - 1);
  await show();
};
$("next").onclick = async () => {
  index = Math.min(queue.length - 1, index + 1);
  await show();
};

$("form").addEventListener("submit", (event) => {
  event.preventDefault();
  const row = queue[index],
    suitability = document.querySelector('[name="suitability"]:checked')?.value;
  const annotatorB = $("annotatorB").value.trim() || null,
    adjudicator = $("adjudicator").value.trim() || null,
    maskIou = $("maskIou").value === "" ? null : Number($("maskIou").value),
    boundaryFscore =
      $("boundaryFscore").value === ""
        ? null
        : Number($("boundaryFscore").value);
  const annotation = {
    contract_version: CONTRACT_VERSION,
    id: row.id,
    file: row.file,
    source_scope: row.source_scope,
    category: $("category").value,
    category_ru: $("categoryRu").value.trim(),
    primary_color: $("color").value,
    additional_colors: [...$("additionalColors").selectedOptions].map(
      (o) => o.value,
    ),
    pattern_ru: $("patternRu").value.trim(),
    texture_ru: $("textureRu").value.trim(),
    trim_ru: $("trimRu").value.trim(),
    edge_visibility: $("edgeVisibility").value,
    background_match_risk: $("backgroundRisk").value,
    suitability,
    quarantine_reasons: [...$("reasons").selectedOptions].map((o) => o.value),
    bbox,
    boundary: boundary?.length ? boundary : null,
    exclusion_polygons: null,
    mask: $("mask").files[0]
      ? { kind: "local_file", file: $("mask").files[0].name }
      : null,
    annotator_id: $("annotator").value.trim(),
    annotator_b: annotatorB,
    adjudicator,
    agreement: { mask_iou: maskIou, boundary_fscore: boundaryFscore },
    adjudication_status:
      annotatorB && adjudicator && maskIou != null && boundaryFscore != null
        ? "PASS"
        : "HOLD",
    annotated_at: new Date().toISOString(),
    notes: $("notes").value.trim(),
  };
  const result = validateAnnotation(annotation, {
    manifestIds: new Set(manifest.map((x) => String(x.id))),
    ownerIds: new Set(
      (ownerManifest.files || []).map((x) => String(x.id || x.file)),
    ),
  });
  $("validation").value = result.valid
    ? "Сохранено локально"
    : result.errors.join("\n");
  if (!result.valid) return;
  annotations = annotations.filter((item) => item.id !== row.id);
  annotations.push(annotation);
  localStorage.setItem(
    "garment-real-200-04b-draft",
    JSON.stringify({ contract_version: CONTRACT_VERSION, annotations }),
  );
});
$("export").onclick = () =>
  download(
    "garment-real-200-04b-annotations.json",
    annotations.sort((a, b) => a.id.localeCompare(b.id)),
  );
$("coverage").onclick = () =>
  download(
    "garment-real-200-04b-coverage.json",
    coverageReport({
      manifest,
      ownerManifest,
      annotations,
      allowlist,
      quarantine,
    }),
  );
