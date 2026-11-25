const products = [
  { id: "gulmohar-box", name: "The Gulmohar Ritual Box", category: "gifting", type: "THE GATHERING SET", price: 2490, badge: "Bestseller", image: "photo-1603006905003-be475563bc59", tone: "rose" },
  { id: "brass-diya", name: "Hand-beaten Brass Diyas", category: "lighting", type: "A PAIR · AGED BRASS", price: 1250, badge: "Small batch", image: "photo-1602874801007-bd458bb1b8b6", tone: "amber" },
  { id: "genda-toran", name: "Genda Bloom Door Toran", category: "decor", type: "HAND-STRUNG · 90 CM", price: 890, image: "photo-1610701596007-11502861dcfa", tone: "saffron" },
  { id: "saffron-runner", name: "Saffron Silk Table Runner", category: "decor", type: "HANDWOVEN · 180 CM", price: 1890, badge: "Just arrived", image: "photo-1616486338812-3dadae4b4ace", tone: "clay" },
  { id: "kesar-gift-tin", name: "Kesar & Rose Mithai Tin", category: "gifting", type: "ASSORTED · 24 PIECES", price: 760, image: "photo-1578500494198-246f612d3b3d", tone: "plum" },
  { id: "sandstone-urli", name: "Moonlit Sandstone Urli", category: "decor", type: "CARVED STONEWARE", price: 1650, image: "photo-1600210492486-724fe5c67fb0", tone: "stone" },
  { id: "marigold-kit", name: "Marigold Memory Kit", category: "gifting", type: "A LITTLE OF EVERYTHING", price: 2200, badge: "Gift-ready", image: "photo-1590736969955-71cc94901144", tone: "olive" },
  { id: "zari-candle", name: "Zari-wrapped Candle Pair", category: "lighting", type: "JASMINE & WARM AMBER", price: 980, image: "photo-1603905179139-d6b47e2f437a", tone: "gold" },
];

// Load the same hosted script merchants install; only the public widget ID is exposed.
const widgetScript = document.createElement("script");
widgetScript.async = true;
widgetScript.src = `${(import.meta.env.VITE_DIYA_API_BASE_URL || "http://localhost:4002").replace(/\/$/, "")}/widget.js`;
widgetScript.dataset.widgetId = import.meta.env.VITE_DIYA_WIDGET_ID || "diya_demo_festive_mart";
document.body.append(widgetScript);

const imageUrl = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=850&q=82`;
const money = (value) => `₹${value.toLocaleString("en-IN")}`;
const grid = document.querySelector("#product-grid");
const toast = document.querySelector(".toast");
let activeCategory = "all";
let searchQuery = "";
let cartCount = 0;
let toastTimer;

function renderProducts() {
  const visible = products.filter((product) => (activeCategory === "all" || product.category === activeCategory)
    && (!searchQuery || `${product.name} ${product.category} ${product.type}`.toLowerCase().includes(searchQuery)));
  grid.innerHTML = visible.map((product, index) => `
    <article class="product-card" style="--card-index:${index}">
      <div class="product-visual tone-${product.tone}">
        <img src="${imageUrl(product.image)}" alt="${product.name}" loading="lazy" />
        ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}
        <button class="favorite-button" type="button" aria-label="Save ${product.name}" data-favorite="${product.id}"><span aria-hidden="true">♡</span></button>
        <button class="ask-product" type="button" data-product="${product.id}"><span>Ask about this piece</span><span aria-hidden="true">↗</span></button>
      </div>
      <div class="product-info"><div><p class="product-type">${product.type}</p><h3>${product.name}</h3></div><span class="product-price">${money(product.price)}</span></div>
      <button class="add-button" type="button" data-add="${product.id}">Add to bag <span aria-hidden="true">+</span></button>
    </article>
  `).join("");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function openDiya(productName) {
  const open = () => {
    if (!window.DiyaWidget) return false;
    return window.DiyaWidget.open(productName ? { productName } : undefined) !== false;
  };
  if (open()) return;
  let opened = false;
  const onReady = () => { opened = open(); };
  window.addEventListener("diya:ready", onReady, { once: true });
  window.setTimeout(() => {
    if (!opened) {
      window.removeEventListener("diya:ready", onReady);
      showToast("The enquiry form isn't available from this page right now.");
    }
  }, 4000);
}

grid.addEventListener("click", (event) => {
  const productButton = event.target.closest("[data-product]");
  if (productButton) {
    const product = products.find((item) => item.id === productButton.dataset.product);
    if (product) openDiya(product.name);
    return;
  }

  const addButton = event.target.closest("[data-add]");
  if (addButton) {
    cartCount++;
    document.querySelector(".bag-count").textContent = String(cartCount);
    showToast("Added to your festive bag.");
    return;
  }

  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) {
    const active = favoriteButton.classList.toggle("is-favorite");
    favoriteButton.querySelector("span").textContent = active ? "♥" : "♡";
  }
});

document.querySelector(".category-row").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  document.querySelectorAll(".category-chip").forEach((chip) => chip.classList.toggle("is-active", chip === button));
  renderProducts();
});

document.querySelector(".bag-button").addEventListener("click", () => showToast(cartCount ? `${cartCount} lovely thing${cartCount === 1 ? "" : "s"} in your bag.` : "Your festive bag is waiting for something lovely."));
const searchOverlay = document.querySelector(".search-overlay");
const searchInput = document.querySelector("#product-search");
const searchTrigger = document.querySelector(".search-button");
function closeSearch() {
  searchOverlay.hidden = true;
  searchTrigger.focus();
}
searchTrigger.addEventListener("click", () => {
  searchOverlay.hidden = false;
  window.setTimeout(() => searchInput.focus(), 40);
});
document.querySelector(".search-close").addEventListener("click", closeSearch);
searchOverlay.addEventListener("click", (event) => {
  if (event.target === searchOverlay) closeSearch();
});
searchOverlay.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSearch();
});
document.querySelector(".search-panel").addEventListener("submit", (event) => {
  event.preventDefault();
  searchQuery = searchInput.value.trim().toLowerCase();
  activeCategory = "all";
  document.querySelectorAll(".category-chip").forEach((chip) => chip.classList.toggle("is-active", chip.dataset.category === "all"));
  renderProducts();
  closeSearch();
  const match = grid.querySelector(".product-card");
  if (match) match.scrollIntoView({ behavior: "smooth", block: "center" });
  else showToast("No exact match yet. Ask us and we’ll help you find it.");
});
document.querySelector(".menu-toggle").addEventListener("click", () => document.querySelector(".main-nav").classList.toggle("is-open"));
document.querySelectorAll(".main-nav a").forEach((link) => link.addEventListener("click", () => document.querySelector(".main-nav").classList.remove("is-open")));

renderProducts();
