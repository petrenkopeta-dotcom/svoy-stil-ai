import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, "generated");
const width = 640;
const height = 800;

const cases = [
  {
    id: "pp06-blur",
    condition: "blur",
    expected: "review_or_retake",
    filter: "blur(10px)",
  },
  {
    id: "pp06-low-light",
    condition: "low_light",
    expected: "retake",
    bg: "#111722",
    garment: "#202a38",
    overlay: '<rect width="640" height="800" fill="#000" opacity=".42"/>',
  },
  {
    id: "pp06-compression",
    condition: "compression",
    expected: "review",
    extra:
      '<filter id="pixel"><feFlood flood-color="#8da0b3" flood-opacity=".13"/><feComposite in2="SourceGraphic" operator="in"/><feTile/></filter><path d="M155 210h330v390H155z" fill="url(#blocks)" opacity=".34"/>',
  },
  {
    id: "pp06-occlusion",
    condition: "occlusion",
    expected: "review_or_retake",
    overlay:
      '<rect x="250" y="330" width="300" height="150" rx="12" fill="#262a30" opacity=".96"/>',
  },
  {
    id: "pp06-same-color",
    condition: "same_color_background",
    expected: "review",
    bg: "#66788a",
    garment: "#697b8d",
  },
  {
    id: "pp06-motion",
    condition: "motion",
    expected: "review_or_retake",
    motion: true,
  },
  {
    id: "pp06-glare",
    condition: "glare",
    expected: "review_or_retake",
    overlay:
      '<path d="M70 700 430 80h115L185 700z" fill="url(#glare)" opacity=".82"/>',
  },
  {
    id: "pp06-tiny-subject",
    condition: "tiny_subject",
    expected: "review_or_retake",
    scale: 0.23,
  },
];

function shirt(fill) {
  return `<path d="M230 218 160 265l42 90 48-25v250h140V330l48 25 42-90-70-47-45-18c-14 31-76 31-90 0z" fill="${fill}" stroke="#d9e1e8" stroke-width="7" stroke-linejoin="round"/>`;
}

function svg(entry) {
  const bg = entry.bg ?? "#d8e0e7";
  const garment = entry.garment ?? "#355a78";
  const scale = entry.scale ?? 1;
  const transform =
    scale === 1
      ? ""
      : `transform="translate(${width / 2} ${height / 2}) scale(${scale}) translate(${-width / 2} ${-height / 2})"`;
  const motion = entry.motion
    ? `<g opacity=".16" transform="translate(-28 8)">${shirt(garment)}</g><g opacity=".24" transform="translate(-14 4)">${shirt(garment)}</g>`
    : "";
  const filter = entry.filter ? `style="filter:${entry.filter}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Synthetic single garment ${entry.condition}">
  <defs>
    <linearGradient id="glare" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".48" stop-color="#fff"/><stop offset=".62" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <pattern id="blocks" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#bac5cf"/><rect x="16" y="16" width="16" height="16" fill="#4c6073"/></pattern>
  </defs>
  <rect width="640" height="800" fill="${bg}"/>
  <g ${transform} ${filter}>${motion}${shirt(garment)}</g>
  ${entry.extra ?? ""}
  ${entry.overlay ?? ""}
</svg>\n`;
}

await mkdir(output, { recursive: true });
for (const entry of cases)
  await writeFile(join(output, `${entry.id}.svg`), svg(entry), "utf8");

const manifest = {
  schema_version: "photo-person-06-fixtures-v1",
  generated_at: "deterministic",
  generator: "../generate-fixtures.mjs",
  corpus_policy: {
    synthetic_only: true,
    identifying_people: false,
    faces: false,
    downloads: false,
    network_required: false,
    biometric_processing: false,
    inference: [],
    generative_inpainting: false,
    subject: "one abstract garment silhouette",
  },
  defaults: {
    width,
    height,
    declarations: {
      person: false,
      itemCount: 1,
      background: "plain",
      backgroundContrast: "normal",
      delicateDetails: false,
    },
    required_gate:
      "single garment; a person or itemCount != 1 must remain blocking",
  },
  fixtures: cases.map(({ id, condition, expected }) => ({
    id,
    file: `${id}.svg`,
    condition,
    expected_disposition: expected,
    oracle_strength: "calibration_candidate_not_production_truth",
    synthetic_only: true,
    person_present: false,
    faces: false,
    item_count: 1,
    subject: "abstract_garment_silhouette",
    consent_scope: "local_qa_only",
    deletion: "delete generated directory; regenerate deterministically",
  })),
};
await writeFile(
  join(output, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(`Generated ${cases.length} synthetic fixtures in ${output}`);
