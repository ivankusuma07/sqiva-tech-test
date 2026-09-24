# Master Menu — Sqiva Frontend Case Study

A menu management page (Studi Kasus: Menu Management) built with **vanilla HTML, CSS and JavaScript**: no framework and no build step. The layout follows the RestoDash POS reference: sidebar, top bar, KPI row, menu grid and a Current Order panel.

**Live demo: <https://sqiva-tech-test.netlify.app/>**

## Running it

The app is deployed on Netlify at <https://sqiva-tech-test.netlify.app/>, so there is nothing to install to try it.

To run it locally, open `index.html` in a browser. Or serve the folder, which is closer to how it runs when deployed:

```bash
npx serve .
# or
python -m http.server
```

To see the fallback path, open the page with `?fail=1`, for example <https://sqiva-tech-test.netlify.app/?fail=1>. Blocking the API request in DevTools has the same effect.

## Files

| File | Contents |
| --- | --- |
| `index.html` | Semantic page shell: sidebar, top bar, KPI row, grid, order panel, form and confirm dialogs |
| `styles.css` | Design tokens (CSS custom properties), layout, components, breakpoints |
| `app.js` | State, data loading, pure domain logic, rendering, delegated events |
| `images/` | Menu photos, 640×480 WebP (see [Image credits](#image-credits)) |

## Where each requirement lives

| # | Requirement | Where |
| --- | --- | --- |
| 1 | Fetch with `async/await` + `try…catch`, with fallback data | `loadMenus()` |
| 2 | Food only, `isLowStock` (stock < 3), sort price high → low | `transformMenus(menus)`, a pure function that returns a new array |
| 3 | CSS Grid: 4 / 2 / 1 columns, 16px gap | `.menu-grid` plus two media queries in `styles.css` |
| 4 | Card: name, category, price, stock, status, Add / Edit / Delete | `menuCardTemplate(menu)` |
| 5 | Low Stock / Normal badge | `.badge--low` / `.badge--normal` in `menuCardTemplate` |
| 6 | Tambah Menu form with a Simpan button | `<dialog id="menu-form-dialog">` |
| 7 | Validation | `validateMenu(data)` returns an `errors` object, shown inline per field |
| 8 | Add to order, qty++ for repeats, block when out of stock, totals | `addToOrder(id)`, `renderOrder()`, `calculateTotal(order)` |
| 9 | Search by name, debounced 500ms | `debounce(fn, 500)` on the search input, then `filterByName()` |
| 10 | Delete from the view **and** the array | `deleteMenu(id)` → `state.menus.splice(index, 1)`, then `render()` |

The arrays in `state` are the single source of truth. Every change goes through an action that updates state and then calls `render()`, so the UI is always derived from the data.

## Decisions

- **API URL.** The brief spells the host `typicòde` (with an accented ò), which doesn't resolve. The app uses `https://my-json-server.typicode.com/sqiva-sistem/sqiva-dummy/menus`. The request has a 5-second timeout, and a non-2xx response or an unexpected payload also triggers the fallback. A chip shows **Live data** or **Offline data** so it's clear which source is in use.
- **D1: adding to the order reduces stock.** Removing an item or lowering its qty puts the stock back. `isLowStock` is recalculated on every render, so the badge updates live. At stock 0 the Add button is disabled and reads "Habis".
- **D2: a new Drink item is saved but not shown**, because the grid shows Food only. A toast explains this.
- **D3: deleting a menu that is in the order** asks for confirmation first, then removes the order line too.
- **D4: Edit (optional) is implemented.** It reuses the same dialog, and the matching order line's name and price stay in sync.
- **D5: currency** is formatted with `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })`, for example "Rp 25.000".
- **D6: icons** are [Lucide](https://lucide.dev) 1.47.0 from unpkg, pinned and checked with SRI. Every icon-only button has an `aria-label`, so the page still works if the CDN is blocked.
- **D7: menu photos.** The API data has no image URLs, so `getMenuImage(menu)` matches a photo by name keyword. That way "Nasi Goreng Singapore" from the API and "Nasi Goreng" from the fallback get the same photo. Menus with no match, such as new ones created in the form, get a default Food or Drink photo. If a menu has its own `image` field, that is used instead. If a photo fails to load, the category photo is used, and if that fails too, a category icon shows.

## Other details

- **User input is escaped.** Every value typed into the form goes through `escapeHTML()` before it reaches the card or order markup.
- **Event delegation.** There is one click listener on the grid and one on the order list. They use `closest('[data-action]')`, so clicks on an icon's `<svg>` still reach the button.
- **Accessibility.** The form uses `novalidate` with its own errors, linked through `aria-invalid` and `aria-describedby`. Dialogs are native `<dialog>` elements, Esc closes them, and focus goes back to the button that opened them. Badges use text as well as color.
- **Keyboard.** <kbd>Ctrl</kbd>+<kbd>K</kbd> focuses the search, and <kbd>Esc</kbd> clears it.
- **Responsive layout.**
  - Above 1280px, the sidebar, grid and order panel sit side by side.
  - From 1025px to 1280px, the sidebar collapses to icons so the 4 cards still fit.
  - From 1024px down, the order panel moves below the grid.
  - Below 600px, the sidebar becomes a drawer, and a sticky bar shows the order total.

## Image credits

All photos are from Wikimedia Commons, cropped to 4:3 and resized to 640×480.

| File | Photo | Author | License |
| --- | --- | --- | --- |
| `nasi-goreng.webp` | [Nasi Goreng Kampung](https://commons.wikimedia.org/wiki/File:Nasi_Goreng_Kampung.jpg) | Supardisahabu | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `mie-ayam.webp` | [Mi ayam jamur](https://commons.wikimedia.org/wiki/File:Mi_ayam_jamur.JPG) | Midori | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) |
| `ayam-bakar.webp` | [Set menu Ayam Bakar Tempe Tahu](https://commons.wikimedia.org/wiki/File:Set_menu_Ayam_Bakar_Tempe_Tahu.jpg) | christian r from Jakarta | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) |
| `es-teh.webp` | [Es teh manis](https://commons.wikimedia.org/wiki/File:Es_teh_manis.jpg) | Cendy00 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) |
| `jus-alpukat.webp` | [Jus alpukat Bandung](https://commons.wikimedia.org/wiki/File:Jus_alpukat_Bandung.JPG) | Midori | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0) |
| `default-food.webp` | [Nasi campur, Ubud, Indonesia](https://commons.wikimedia.org/wiki/File:Nasi_campur,_Ubud,_Indonesia.jpg) | Vyacheslav Argenberg | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) |
| `default-drink.webp` | [Pineapple Juice fruits](https://commons.wikimedia.org/wiki/File:Pineapple_Juice_fruits-465832.jpg) | public domain | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
