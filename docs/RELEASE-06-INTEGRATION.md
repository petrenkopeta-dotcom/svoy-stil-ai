# RELEASE-06 integration patch

`src/main.jsx` has a single owner and was intentionally not edited. Apply these exact integration steps there.

1. Add the import:

```jsx
import { DeleteGarmentDialog, WardrobeTabs } from "./WardrobeAccessibility.jsx";
```

2. In `Wardrobe`, add state beside `tab`:

```jsx
const [pendingDelete, setPendingDelete] = useState(null);
```

3. Replace `removeItem` with:

```jsx
const removeItem = (garment) => {
  const updated = items.filter((item) => item.id !== garment.id);
  window.dispatchEvent(new CustomEvent("atelier-wardrobe-change", { detail: updated }));
  setPendingDelete(null);
};
```

4. Replace the `.closet-tabs` block and the following visible-items content with:

```jsx
<WardrobeTabs
  activeTab={tab}
  counts={{ personal: personalItems.length, demo: demoItems.length }}
  onChange={setTab}
>
  {visibleItems.length ? <div className="closet">
    {/* keep the existing visibleItems.map(...) here */}
  </div> : /* keep the existing personal-empty block here */}
</WardrobeTabs>
```

Keep the adjacent item-count `<span>` in `.closet-head`. Move only the existing closet/empty block into `WardrobeTabs`.

5. Change the delete button handler from `onClick={() => removeItem(x)}` to:

```jsx
onClick={() => setPendingDelete(x)}
```

6. Render before the closing `</section>`:

```jsx
{pendingDelete && (
  <DeleteGarmentDialog
    garment={pendingDelete}
    onCancel={() => setPendingDelete(null)}
    onConfirm={removeItem}
  />
)}
```

The shared dialog supplies focus trapping, Escape handling, scroll lock and focus return. The cancel button receives initial focus to avoid accidental destructive confirmation.
