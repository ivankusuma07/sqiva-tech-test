'use strict';

/* ==========================================================================
   Master Menu — app.js
   1. Constants  2. State  3. Pure utilities  4. Pure domain logic
   5. Data  6. Actions  7. Rendering  8. Dialogs & toasts  9. Events
   ========================================================================== */

/* 1. Constants ------------------------------------------------------------- */

// The brief writes the host as "typicòde" (accented ò), which does not resolve.
// The working endpoint is on typicode.com.
const API_URL = 'https://my-json-server.typicode.com/sqiva-sistem/sqiva-dummy/menus';
const API_TIMEOUT_MS = 5000;
const LOW_STOCK_LIMIT = 3;
const SEARCH_DELAY_MS = 500;
const TOAST_DURATION_MS = 3500;
const CATEGORIES = ['Food', 'Drink'];
const VISIBLE_CATEGORY = 'Food';

// Open the page with ?fail=1 to skip the API and demo the fallback path.
const FORCE_FALLBACK = new URLSearchParams(location.search).has('fail');

const FALLBACK_MENUS = [
  { id: 1, name: 'Nasi Goreng', category: 'Food', price: 25000, stock: 3 },
  { id: 2, name: 'Mie Ayam', category: 'Food', price: 18000, stock: 10 },
  { id: 3, name: 'Es Teh', category: 'Drink', price: 5000, stock: 20 },
  { id: 4, name: 'Jus Alpukat', category: 'Drink', price: 15000, stock: 2 },
  { id: 5, name: 'Ayam Bakar', category: 'Food', price: 30000, stock: 5 },
];

// The data has no image URLs, so photos are matched by name keyword. That way the
// API name ("Nasi Goreng Singapore") and the fallback name ("Nasi Goreng") share one.
// Photos are from Wikimedia Commons; credits are in the README.
const MENU_IMAGES = [
  { keyword: 'nasi goreng', src: 'images/nasi-goreng.webp' },
  { keyword: 'mie ayam', src: 'images/mie-ayam.webp' },
  { keyword: 'ayam bakar', src: 'images/ayam-bakar.webp' },
  { keyword: 'es teh', src: 'images/es-teh.webp' },
  { keyword: 'jus alpukat', src: 'images/jus-alpukat.webp' },
];
const DEFAULT_IMAGES = {
  Food: 'images/default-food.webp',
  Drink: 'images/default-drink.webp',
};

/* 2. State ----------------------------------------------------------------- */

// The arrays are the single source of truth; the UI is always derived from them.
const state = {
  menus: [],          // raw data (API or fallback), mutated by add/edit/delete/stock
  order: [],          // [{ id, name, price, qty }]
  query: '',          // search text (set after the debounce)
  source: 'api',      // 'api' | 'fallback'
  status: 'loading',  // 'loading' | 'ready'
};

/* 3. Pure utilities -------------------------------------------------------- */

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function formatRupiah(amount) {
  return rupiahFormatter.format(amount);
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function nextId(menus) {
  return menus.reduce((max, menu) => Math.max(max, menu.id), 0) + 1;
}

/* 4. Pure domain logic (no DOM) -------------------------------------------- */

// Food only, flag low stock, most expensive first. Returns a new array.
function transformMenus(menus) {
  return menus
    .filter((menu) => menu.category === VISIBLE_CATEGORY)
    .map((menu) => ({ ...menu, isLowStock: menu.stock < LOW_STOCK_LIMIT }))
    .sort((a, b) => b.price - a.price);
}

function filterByName(list, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return list;
  return list.filter((menu) => menu.name.toLowerCase().includes(needle));
}

function calculateTotal(order) {
  return order.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function calculateItemCount(order) {
  return order.reduce((sum, item) => sum + item.qty, 0);
}

function getDefaultImage(category) {
  return DEFAULT_IMAGES[category] || DEFAULT_IMAGES.Food;
}

// An `image` field on the menu wins; otherwise match by name, then fall back to the category photo.
function getMenuImage(menu) {
  if (menu.image) return menu.image;
  const name = menu.name.toLowerCase();
  const match = MENU_IMAGES.find((entry) => name.includes(entry.keyword));
  return match ? match.src : getDefaultImage(menu.category);
}

function countLowStock(menus) {
  return menus.filter((menu) => menu.stock < LOW_STOCK_LIMIT).length;
}

// `data` holds raw form values (strings). Returns { field: message } for each invalid field.
function validateMenu(data) {
  const errors = {};

  if (!data.name) errors.name = 'Nama menu wajib diisi.';
  else if (data.name.length > 60) errors.name = 'Nama menu maksimal 60 karakter.';

  if (!data.category) errors.category = 'Pilih kategori.';
  else if (!CATEGORIES.includes(data.category)) errors.category = 'Kategori tidak valid.';

  const price = Number(data.price);
  if (data.price === '') errors.price = 'Harga wajib diisi.';
  else if (!Number.isFinite(price)) errors.price = 'Harga harus berupa angka.';
  else if (price <= 0) errors.price = 'Harga harus lebih dari 0.';

  const stock = Number(data.stock);
  if (data.stock === '') errors.stock = 'Stock wajib diisi.';
  else if (!Number.isFinite(stock)) errors.stock = 'Stock harus berupa angka.';
  else if (stock < 0) errors.stock = 'Stock tidak boleh negatif.';
  else if (!Number.isInteger(stock)) errors.stock = 'Stock harus bilangan bulat.';
  else if (stock === 0) errors.stock = 'Stock harus lebih dari 0.';

  return errors;
}

/* 5. Data ------------------------------------------------------------------ */

async function loadMenus() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    if (FORCE_FALLBACK) throw new Error('Fallback forced with ?fail=1');
    const res = await fetch(API_URL, { signal: controller.signal });
    // fetch only rejects on network errors, so HTTP errors are checked by hand.
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected payload');
    state.menus = data;
    state.source = 'api';
  } catch (err) {
    console.warn('API failed, using fallback:', err);
    state.menus = structuredClone(FALLBACK_MENUS);
    state.source = 'fallback';
  } finally {
    clearTimeout(timeout);
    state.status = 'ready';
    render();
  }
}

/* 6. Actions: change state, then render ------------------------------------ */

function findMenu(id) {
  return state.menus.find((menu) => menu.id === id);
}

function findOrderLine(id) {
  return state.order.find((item) => item.id === id);
}

function addToOrder(id) {
  const menu = findMenu(id);
  if (!menu) return;
  if (menu.stock <= 0) {
    toast(`Stok ${menu.name} habis.`, 'error');
    return;
  }

  const line = findOrderLine(id);
  if (line) line.qty += 1;
  else state.order.push({ id, name: menu.name, price: menu.price, qty: 1 });

  menu.stock -= 1; // D1: ordered portions come out of stock
  render();
}

function decreaseQty(id) {
  const line = findOrderLine(id);
  if (!line) return;

  line.qty -= 1;
  const menu = findMenu(id);
  if (menu) menu.stock += 1;
  if (line.qty === 0) state.order = state.order.filter((item) => item.id !== id);
  render();
}

function removeFromOrder(id) {
  const line = findOrderLine(id);
  if (!line) return;

  const menu = findMenu(id);
  if (menu) menu.stock += line.qty;
  state.order = state.order.filter((item) => item.id !== id);
  render();
}

function clearOrder() {
  state.order.forEach((line) => {
    const menu = findMenu(line.id);
    if (menu) menu.stock += line.qty;
  });
  state.order = [];
  render();
}

function createMenu(data) {
  const menu = { id: nextId(state.menus), ...data };
  state.menus.push(menu);
  render();
  return menu;
}

function updateMenu(id, data) {
  const menu = findMenu(id);
  if (!menu) return null;

  Object.assign(menu, data);
  const line = findOrderLine(id);
  if (line) {
    line.name = menu.name;
    line.price = menu.price;
  }
  render();
  return menu;
}

// Removes the menu from the array itself (not just the view) and from the order (D3).
function deleteMenu(id) {
  const index = state.menus.findIndex((menu) => menu.id === id);
  if (index === -1) return null;

  const [removed] = state.menus.splice(index, 1);
  state.order = state.order.filter((item) => item.id !== id);
  render();
  return removed;
}

function setQuery(query) {
  state.query = query;
  renderStats();
  renderMenuGrid();
}

/* 7. Rendering ------------------------------------------------------------- */

const dom = {
  grid: document.getElementById('menu-grid'),
  resultsNote: document.getElementById('results-note'),
  sourceChip: document.getElementById('source-chip'),
  banner: document.getElementById('fallback-banner'),
  kpiTotal: document.getElementById('kpi-total'),
  kpiShown: document.getElementById('kpi-shown'),
  kpiLow: document.getElementById('kpi-low'),
  kpiOrder: document.getElementById('kpi-order'),
  kpiOrderHint: document.getElementById('kpi-order-hint'),
  orderList: document.getElementById('order-list'),
  orderCount: document.getElementById('order-count'),
  summaryItems: document.getElementById('summary-items'),
  summaryTotal: document.getElementById('summary-total'),
  clearOrder: document.getElementById('clear-order'),
  checkout: document.getElementById('checkout'),
  orderBar: document.getElementById('order-bar'),
  orderBarCount: document.getElementById('order-bar-count'),
  orderBarTotal: document.getElementById('order-bar-total'),
  search: document.getElementById('search-input'),
  openCreate: document.getElementById('open-create'),
  sidebar: document.getElementById('sidebar'),
  backdrop: document.getElementById('backdrop'),
  drawerToggle: document.getElementById('drawer-toggle'),
  formDialog: document.getElementById('menu-form-dialog'),
  form: document.getElementById('menu-form'),
  formTitle: document.getElementById('menu-form-title'),
  confirmDialog: document.getElementById('confirm-dialog'),
  confirmText: document.getElementById('confirm-text'),
  toasts: document.getElementById('toasts'),
};

// Lucide swaps <i data-lucide> placeholders for inline SVGs. Re-rendered markup
// brings new placeholders, so each render draws the icons in what it replaced.
function drawIcons(root = document) {
  if (window.lucide) window.lucide.createIcons({ root });
}

function getVisibleMenus() {
  return filterByName(transformMenus(state.menus), state.query);
}

function render() {
  renderSource();
  renderStats();
  renderMenuGrid();
  renderOrder();
}

function renderSource() {
  if (state.status === 'loading') return;
  const live = state.source === 'api';
  dom.sourceChip.hidden = false;
  dom.sourceChip.className = `chip ${live ? 'chip--live' : 'chip--offline'}`;
  dom.sourceChip.innerHTML = live
    ? '<i data-lucide="wifi"></i>Live data'
    : '<i data-lucide="wifi-off"></i>Offline data';
  dom.banner.hidden = live;
  drawIcons(dom.sourceChip);
}

function renderStats() {
  if (state.status === 'loading') return;
  const foodCount = transformMenus(state.menus).length;
  const shown = getVisibleMenus().length;
  const itemCount = calculateItemCount(state.order);

  dom.kpiTotal.textContent = state.menus.length;
  dom.kpiShown.textContent = shown;
  dom.kpiLow.textContent = countLowStock(state.menus);
  dom.kpiOrder.textContent = formatRupiah(calculateTotal(state.order));
  dom.kpiOrderHint.textContent = `${itemCount} item`;

  dom.resultsNote.textContent = state.query.trim()
    ? `${shown} dari ${foodCount} menu Food cocok dengan “${state.query.trim()}”`
    : `Menampilkan ${foodCount} menu Food, harga tertinggi lebih dulu`;
}

// URLs that already failed once, so re-renders go straight to the fallback.
const brokenImages = new Set();

// Decorative (alt=""): the menu name sits right next to it. data-fallback is the
// category photo that handleImageError swaps in if this one fails to load.
function menuImageTemplate(menu, className) {
  const fallback = getDefaultImage(menu.category);
  const src = getMenuImage(menu);
  return `<img class="${className}" src="${escapeHTML(brokenImages.has(src) ? fallback : src)}"
               data-fallback="${fallback}" alt="" width="640" height="480"
               loading="lazy" decoding="async">`;
}

function menuCardTemplate(menu) {
  const name = escapeHTML(menu.name);
  const soldOut = menu.stock <= 0;
  const isDrink = menu.category === 'Drink';
  const modifiers = `${menu.isLowStock ? ' menu-card--low' : ''}${soldOut ? ' menu-card--sold-out' : ''}`;

  return `
    <article class="menu-card${modifiers}">
      <div class="menu-card__media${isDrink ? ' menu-card__media--drink' : ''}">
        <i data-lucide="${isDrink ? 'cup-soda' : 'utensils'}"></i>
        ${menuImageTemplate(menu, 'menu-card__img')}
        <div class="menu-card__tools">
          <button class="btn btn--icon" type="button" data-action="edit" data-id="${menu.id}"
                  aria-label="Edit ${name}" title="Edit"><i data-lucide="pencil"></i></button>
          <button class="btn btn--icon btn--icon-danger" type="button" data-action="delete" data-id="${menu.id}"
                  aria-label="Delete ${name}" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
      <div class="menu-card__body">
        <h3 class="menu-card__name">${name}</h3>
        <p class="menu-card__category">${escapeHTML(menu.category)}</p>
        <p class="menu-card__price">${formatRupiah(menu.price)}</p>
        <div class="menu-card__meta">
          <span>Stock: <strong>${menu.stock}</strong></span>
          ${menu.isLowStock
            ? '<span class="badge badge--low"><i data-lucide="triangle-alert"></i>Low Stock</span>'
            : '<span class="badge badge--normal">Normal</span>'}
        </div>
        <button class="btn btn--primary btn--block" type="button" data-action="add" data-id="${menu.id}"
                ${soldOut ? 'disabled' : ''} aria-label="${soldOut ? `${name} habis` : `Add ${name} ke pesanan`}">
          ${soldOut ? 'Habis' : '<i data-lucide="shopping-cart"></i>Add'}
        </button>
      </div>
    </article>`;
}

function skeletonTemplate() {
  return `
    <div class="skeleton" aria-hidden="true">
      <div class="skeleton__block skeleton__media"></div>
      <div class="skeleton__block" style="width:75%;height:16px"></div>
      <div class="skeleton__block" style="width:40%;height:12px"></div>
      <div class="skeleton__block" style="width:55%;height:18px"></div>
      <div class="skeleton__block" style="width:100%;height:40px;margin-top:8px"></div>
    </div>`;
}

function emptyGridTemplate() {
  const query = state.query.trim();
  if (query) {
    return `
      <div class="empty">
        <i data-lucide="search"></i>
        <p class="empty__title">Tidak ada menu dengan nama “${escapeHTML(query)}”</p>
        <p>Coba kata kunci lain.</p>
        <button class="btn btn--ghost" type="button" data-action="clear-search"><i data-lucide="x"></i>Hapus pencarian</button>
      </div>`;
  }
  return `
    <div class="empty">
      <i data-lucide="package-x"></i>
      <p class="empty__title">Belum ada menu Food</p>
      <button class="btn btn--primary" type="button" data-action="open-create"><i data-lucide="plus"></i>Tambah Menu</button>
    </div>`;
}

function renderMenuGrid() {
  if (state.status === 'loading') {
    dom.grid.innerHTML = skeletonTemplate().repeat(8);
    return;
  }

  const visible = getVisibleMenus();
  dom.grid.innerHTML = visible.length ? visible.map(menuCardTemplate).join('') : emptyGridTemplate();
  dom.grid.setAttribute('aria-busy', 'false');
  drawIcons(dom.grid);
}

function orderLineTemplate(line) {
  const name = escapeHTML(line.name);
  const menu = findMenu(line.id);
  const canAddMore = Boolean(menu && menu.stock > 0);

  return `
    <li class="order-line">
      <span class="order-line__thumb">${menu ? menuImageTemplate(menu, 'order-line__img') : ''}</span>
      <div>
        <p class="order-line__name">${name}</p>
        <p class="order-line__unit">${formatRupiah(line.price)} × ${line.qty}</p>
      </div>
      <button class="btn btn--icon btn--icon-danger" type="button" data-action="remove" data-id="${line.id}"
              aria-label="Hapus ${name} dari pesanan" title="Hapus"><i data-lucide="trash-2"></i></button>
      <div class="qty">
        <button class="btn btn--icon" type="button" data-action="decrease" data-id="${line.id}"
                aria-label="Kurangi ${name}"><i data-lucide="minus"></i></button>
        <span class="qty__value" aria-label="Jumlah ${name}">${line.qty}</span>
        <button class="btn btn--icon" type="button" data-action="increase" data-id="${line.id}"
                aria-label="Tambah ${name}" ${canAddMore ? '' : 'disabled title="Stok habis"'}><i data-lucide="plus"></i></button>
      </div>
      <p class="order-line__total">${formatRupiah(line.price * line.qty)}</p>
    </li>`;
}

function renderOrder() {
  const itemCount = calculateItemCount(state.order);
  const total = formatRupiah(calculateTotal(state.order));
  const isEmpty = state.order.length === 0;

  dom.orderList.innerHTML = isEmpty
    ? `<li class="order-empty">
         <span class="order-empty__icon"><i data-lucide="shopping-bag"></i></span>
         <p class="order-empty__title">Belum ada pesanan</p>
         <p>Tekan “Add” pada menu untuk menambahkannya.</p>
       </li>`
    : state.order.map(orderLineTemplate).join('');
  drawIcons(dom.orderList);

  dom.orderCount.textContent = `${itemCount} item`;
  dom.summaryItems.textContent = itemCount;
  dom.summaryTotal.textContent = total;
  dom.clearOrder.disabled = isEmpty;
  dom.checkout.disabled = isEmpty;

  dom.orderBar.hidden = isEmpty;
  dom.orderBarCount.textContent = itemCount;
  dom.orderBarTotal.textContent = total;
}

/* 8. Dialogs & toasts ------------------------------------------------------ */

const TOAST_ICONS = { success: 'circle-check', error: 'circle-x', info: 'info' };

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<i data-lucide="${TOAST_ICONS[type]}"></i><p></p>`;
  el.querySelector('p').textContent = message;
  dom.toasts.append(el);
  drawIcons(el);

  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  }, TOAST_DURATION_MS);
}

// Resolves true when the user confirms.
function confirmDialog(message) {
  dom.confirmText.textContent = message;
  dom.confirmDialog.returnValue = '';
  dom.confirmDialog.showModal();
  return new Promise((resolve) => {
    dom.confirmDialog.addEventListener(
      'close',
      () => resolve(dom.confirmDialog.returnValue === 'confirm'),
      { once: true },
    );
  });
}

// Cards are re-rendered while a dialog is open, so the button that opened it may
// no longer exist. Focus goes back to its replacement, or to a stable fallback.
let focusReturn = null;

function restoreFocus() {
  const target = focusReturn && document.querySelector(focusReturn);
  (target || dom.openCreate).focus();
  focusReturn = null;
}

const FORM_FIELDS = ['name', 'category', 'price', 'stock'];
let editingId = null;

function readForm() {
  const fields = dom.form.elements;
  return {
    name: fields.name.value.trim(),
    category: fields.category.value,
    price: fields.price.value.trim(),
    stock: fields.stock.value.trim(),
  };
}

function showFieldError(field, message) {
  const input = dom.form.elements[field];
  const error = document.getElementById(`error-${field}`);
  error.textContent = message || '';
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function showErrors(errors) {
  FORM_FIELDS.forEach((field) => showFieldError(field, errors[field]));
}

function resetForm() {
  dom.form.reset();
  showErrors({});
  editingId = null;
}

function openMenuForm(menu = null) {
  resetForm();
  editingId = menu ? menu.id : null;
  dom.formTitle.textContent = menu ? 'Edit Menu' : 'Tambah Menu';

  if (menu) {
    const fields = dom.form.elements;
    fields.name.value = menu.name;
    fields.category.value = menu.category;
    fields.price.value = menu.price;
    fields.stock.value = menu.stock;
  }

  dom.formDialog.showModal();
  dom.form.elements.name.focus();
}

function handleFormSubmit(event) {
  event.preventDefault();
  const raw = readForm();
  const errors = validateMenu(raw);
  showErrors(errors);

  const firstInvalid = FORM_FIELDS.find((field) => errors[field]);
  if (firstInvalid) {
    dom.form.elements[firstInvalid].focus();
    return;
  }

  const data = { name: raw.name, category: raw.category, price: Number(raw.price), stock: Number(raw.stock) };
  const isEdit = editingId !== null;
  const menu = isEdit ? updateMenu(editingId, data) : createMenu(data);
  if (!menu) return;

  dom.formDialog.close();

  const verb = isEdit ? 'diperbarui' : 'disimpan';
  if (menu.category !== VISIBLE_CATEGORY) {
    // D2: the data is saved, but the Food-only filter hides it from the grid.
    toast(`${menu.name} ${verb}. Menu ${menu.category} disembunyikan oleh filter Food.`, 'info');
  } else if (!filterByName([menu], state.query).length) {
    toast(`${menu.name} ${verb}, tetapi tidak cocok dengan pencarian saat ini.`, 'info');
  } else {
    toast(`${menu.name} berhasil ${verb}.`);
  }
}

// Fields start validating live only after they have shown an error.
function handleFieldRevalidate(event) {
  const field = event.target.name;
  if (!FORM_FIELDS.includes(field)) return;
  if (event.type === 'input' && !event.target.hasAttribute('aria-invalid')) return;
  if (event.type === 'focusout' && event.target.value === '' && !event.target.hasAttribute('aria-invalid')) return;
  showFieldError(field, validateMenu(readForm())[field]);
}

async function handleDelete(id) {
  const menu = findMenu(id);
  if (!menu) return;

  const line = findOrderLine(id);
  const message = line
    ? `“${menu.name}” juga ada di pesanan (${line.qty} item) dan akan ikut dihapus.`
    : `“${menu.name}” akan dihapus dari daftar menu.`;

  focusReturn = `[data-action="delete"][data-id="${id}"]`;
  const confirmed = await confirmDialog(message);
  if (confirmed) {
    deleteMenu(id);
    focusReturn = null;
    toast(`${menu.name} dihapus.`);
  }
  restoreFocus();
}

/* 9. Events: delegated, so they survive re-renders ------------------------- */

function handleGridClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const id = Number(button.dataset.id);

  switch (button.dataset.action) {
    case 'add':
      addToOrder(id);
      break;
    case 'edit':
      focusReturn = `[data-action="edit"][data-id="${id}"]`;
      openMenuForm(findMenu(id));
      break;
    case 'delete':
      handleDelete(id);
      break;
    case 'clear-search':
      dom.search.value = '';
      setQuery('');
      dom.search.focus();
      break;
    case 'open-create':
      focusReturn = null;
      openMenuForm();
      break;
  }
}

function handleOrderClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const id = Number(button.dataset.id);

  switch (button.dataset.action) {
    case 'increase': addToOrder(id); break;
    case 'decrease': decreaseQty(id); break;
    case 'remove': removeFromOrder(id); break;
  }
}

// A missing photo falls back to the category photo once; if that fails too, the
// image is hidden and the category icon behind it shows through.
function handleImageError(event) {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
  const src = img.getAttribute('src');
  brokenImages.add(src);
  if (src !== img.dataset.fallback) img.src = img.dataset.fallback;
  else img.hidden = true;
}

function setDrawer(open) {
  dom.sidebar.classList.toggle('is-open', open);
  dom.backdrop.hidden = !open;
  dom.drawerToggle.setAttribute('aria-expanded', String(open));
  if (open) dom.sidebar.querySelector('[aria-current="page"]').focus();
  else if (dom.sidebar.contains(document.activeElement)) dom.drawerToggle.focus();
}

function bindEvents() {
  dom.grid.addEventListener('click', handleGridClick);
  // Image errors don't bubble, so listen in the capture phase.
  document.addEventListener('error', handleImageError, true);
  dom.orderList.addEventListener('click', handleOrderClick);

  dom.clearOrder.addEventListener('click', () => {
    clearOrder();
    toast('Pesanan dikosongkan.', 'info');
  });
  dom.checkout.addEventListener('click', () => {
    toast('Checkout di luar cakupan studi kasus ini.', 'info');
  });

  // Reads the input when the timer fires, so a pending call can't restore a query
  // that Esc or "Hapus pencarian" has already cleared.
  const debouncedSearch = debounce(() => setQuery(dom.search.value), SEARCH_DELAY_MS);
  dom.search.addEventListener('input', debouncedSearch);
  dom.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.search.value) {
      dom.search.value = '';
      setQuery('');
    }
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      dom.search.focus();
      dom.search.select();
    }
    if (event.key === 'Escape' && dom.sidebar.classList.contains('is-open')) setDrawer(false);
  });

  dom.openCreate.addEventListener('click', () => {
    focusReturn = '#open-create';
    openMenuForm();
  });

  dom.form.addEventListener('submit', handleFormSubmit);
  dom.form.addEventListener('focusout', handleFieldRevalidate);
  dom.form.addEventListener('input', handleFieldRevalidate);
  dom.form.addEventListener('change', handleFieldRevalidate);
  dom.formDialog.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => dom.formDialog.close());
  });
  dom.formDialog.addEventListener('close', () => {
    resetForm();
    restoreFocus();
  });

  dom.drawerToggle.addEventListener('click', () => setDrawer(!dom.sidebar.classList.contains('is-open')));
  dom.backdrop.addEventListener('click', () => setDrawer(false));

  // Nav items other than Menu are placeholders from the reference layout.
  document.querySelectorAll('[data-inert]').forEach((el) => {
    el.addEventListener('click', (event) => event.preventDefault());
  });
}

/* Init --------------------------------------------------------------------- */

bindEvents();
render();
drawIcons();
loadMenus();
