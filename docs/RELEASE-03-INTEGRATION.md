# RELEASE-03 — integration contract

`src/main.jsx` intentionally remains unchanged. The integration owner imports `HonestReadinessCard` and the domain helpers.

```jsx
import { HonestReadinessCard } from "./HonestReadinessCard.jsx";
import { readinessFromWardrobe, transitionReadiness } from "./honestReadiness.js";

const [readiness, setReadiness] = useState(() =>
  readinessFromWardrobe({ wardrobe, canBuild: canBuildPersonalOutfit(wardrobe) })
);

<HonestReadinessCard
  state={readiness}
  onAddItems={() => openPhotoIntake()}
  onBuild={() => buildLocally(wardrobe)
    .then((result) => setReadiness((state) => transitionReadiness(state, {
      type: "PERSONAL_BUILT", wardrobe, result,
    })))
    .catch((error) => setReadiness((state) => transitionReadiness(state, {
      type: "BUILD_FAILED", reason: error?.code,
    })))}
  onLeaveDemo={() => setReadiness(readinessFromWardrobe({ wardrobe, canBuild: canBuildPersonalOutfit(wardrobe) }))}
  onRetry={() => setReadiness((state) => transitionReadiness(state, {
    type: "RETRY", wardrobe, canBuild: canBuildPersonalOutfit(wardrobe),
  }))}
/>
```

Required data contract:

- Every user garment has a stable `id` and `source: "personal"`.
- Demo is entered only with `{ type: "SHOW_DEMO", items }`; the domain layer overwrites every demo item source to `"demo"`.
- A personal build completes only through `{ type: "PERSONAL_BUILT", wardrobe, result: { items } }`. Every result item must be personal and its ID must occur in the supplied wardrobe. Otherwise state becomes `error`.
- A build rejection dispatches `BUILD_FAILED`. Never dispatch `SHOW_DEMO` as an error fallback.
- `canBuildPersonalOutfit` remains the integration owner's category/constraint check. It must not count demo items.
- The module performs no network calls and persists nothing. Existing local-first repositories remain the only source of wardrobe data.
