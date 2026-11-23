// ================= КОНФИГУРАЦИЯ =================
// Локально: ws://127.0.0.1:8000/ws
// Для GitHub Pages (HTTPS): wss://твой-домен/ws
const WS_URL = "wss://api.stablehost.online/ws";
const MAX_CURRENCY_AMOUNT = 100000;

const AVATAR_FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1a1326"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#f5b4dc" font-family="sans-serif" font-weight="800" font-size="24">BG</text></svg>`
);
const CURRENCY_FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="#1b1329"/><circle cx="60" cy="60" r="36" fill="#f5b4dc" fill-opacity="0.14" stroke="#f5b4dc" stroke-width="4"/><polygon points="60,32 82,60 60,88 38,60" fill="#f5b4dc"/><polygon points="60,32 82,60 60,60" fill="#c49bff" fill-opacity="0.65"/></svg>`
);
const PIG_FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 220"><rect x="48" y="20" width="84" height="84" rx="8" fill="#f497a9"/><rect x="62" y="48" width="16" height="12" fill="#fff"/><rect x="62" y="48" width="8" height="12" fill="#111"/><rect x="102" y="48" width="16" height="12" fill="#fff"/><rect x="110" y="48" width="8" height="12" fill="#111"/><rect x="74" y="70" width="32" height="18" rx="4" fill="#e57d92"/><rect x="80" y="74" width="6" height="10" fill="#7c3a47"/><rect x="94" y="74" width="6" height="10" fill="#7c3a47"/><rect x="44" y="106" width="92" height="114" rx="6" fill="#1a1820"/><polygon points="78,106 102,106 90,140" fill="#ffffff"/><polygon points="85,106 95,106 98,176 90,188 82,176" fill="#dc2626"/></svg>`
);

window.AVATAR_FALLBACK = AVATAR_FALLBACK;
window.CURRENCY_FALLBACK = CURRENCY_FALLBACK;
window.PIG_FALLBACK = PIG_FALLBACK;

let state = {
    settings: {
        siteName: "BoomGrief",
        avatar: "avatar.webp",
        serverIp: "play.boomgrief.ru",
        version: "1.16.5–1.21",
        online: 142,
        heroTitle: "Донат-магазин {siteName}",
        heroSubtitle: "Привилегии, кейсы и токены с моментальной выдачей на сервер"
    },
    teamBanners: [
        {
            id: "team-1",
            enabled: true,
            title: "Вступай в команду",
            description: "Помогай игрокам и следи за порядком на сервере. Принимаем заявки от 13 лет. Исключения обсуждаем индивидуально.",
            buttonText: "Подать заявку в Discord",
            buttonUrl: "https://discord.gg/boomgrief",
            image: "pig-team.webp"
        }
    ],
    faqSection: {
        enabled: true,
        title: "Частые вопросы",
        subtitle: "Ответы на популярные вопросы о покупке и выдаче доната",
        items: []
    },
    categories: [],
    products: [],
    promocodes: [],
    payments: {
        enabled: true,
        donationAlerts: {
            enabled: true,
            url: "",
            instruction: "1. Перейдите по ссылке DonationAlerts.\n2. Укажите ваш никнейм и точную сумму.\n3. Нажмите «Оплатить», чтобы отправить заявку на проверку."
        },
        yoomoney: { enabled: true }
    },
    orders: [],
    system: {
        autoOnline: false,
        secret: "",
        pluginOnline: null,
        pluginConnected: false,
        pluginAvailable: false
    }
};

let ws = null;
let adminToken = sessionStorage.getItem("boomgrief_admin_token") || null;
let isAdminAuth = false;
let selectedCategoryId = null;
let editingCategoryId = null;
let pendingAvatarValue = null;
let expandedOrderGroups = new Set();
let currencySelections = {}; // { [productId]: amount }

let checkoutProduct = null;
let checkoutQuantity = 1;
let checkoutPromo = null;
let checkoutMethod = null;

// ================= УТИЛИТЫ =================
function esc(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDecimal(val) {
    return Number(String(val ?? "").trim().replace(",", "."));
}

function roundMoney(val) {
    return Math.round(val * 100) / 100;
}

function roundUnitPrice(val) {
    return Math.round(val * 10000) / 10000;
}

function clampCurrency(val, minAmt) {
    const min = Math.max(1, Math.min(MAX_CURRENCY_AMOUNT, Number(minAmt) || 1));
    const n = Math.round(Number(val) || min);
    return Math.max(min, Math.min(MAX_CURRENCY_AMOUNT, n));
}

let toastTimer = null;
function showToast(message, isError = false) {
    const el = document.getElementById("toast");
    const dot = document.getElementById("toast-dot");
    document.getElementById("toast-msg").textContent = message;
    dot.className = `w-2 h-2 rounded-full ${isError ? "bg-red-500" : "bg-pinksoft"}`;
    el.classList.remove("opacity-0", "translate-y-3", "pointer-events-none");
    el.classList.add("opacity-100", "translate-y-0");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.add("opacity-0", "translate-y-3", "pointer-events-none");
        el.classList.remove("opacity-100", "translate-y-0");
    }, 3200);
}

function isAdminRoute() {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();
    return path.endsWith("/admin") || path.endsWith("/admin/") || hash === "#admin" || search.includes("admin");
}

function goPublic(e) {
    if (e) e.preventDefault();
    if (window.location.pathname.toLowerCase().endsWith("/admin")) {
        history.pushState({}, "", "/");
    } else {
        window.location.hash = "";
    }
    updateRoute();
}

function updateRoute() {
    const admin = isAdminRoute();
    document.getElementById("public-view").classList.toggle("hidden", admin);
    document.getElementById("admin-view").classList.toggle("hidden", !admin);
    if (admin) {
        renderAdminAuthView();
        if (isAdminAuth) syncAdminUI();
    } else {
        renderPublic();
    }
}

window.addEventListener("hashchange", updateRoute);
window.addEventListener("popstate", updateRoute);

function applyBrandElements() {
    const siteName = state.settings.siteName || "BoomGrief";
    const avatarSrc = state.settings.avatar || "avatar.webp";

    document.title = `${siteName} — Донат-магазин`;
    document.querySelectorAll("[data-site-name]").forEach(el => {
        el.textContent = siteName;
    });
    document.querySelectorAll("[data-site-avatar]").forEach(img => {
        const failed = img.complete && img.naturalWidth === 0;
        if (img.getAttribute("data-last-src") !== avatarSrc || failed) {
            img.setAttribute("data-last-src", avatarSrc);
            img.onerror = function () { this.onerror = null; this.src = AVATAR_FALLBACK; };
            img.src = failed ? AVATAR_FALLBACK : avatarSrc;
        }
    });
    const fav = document.getElementById("site-favicon");
    if (fav) fav.href = avatarSrc;
}

function formatHeroTitle(rawTitle, siteName) {
    const title = (rawTitle || `Донат-магазин {siteName}`).trim();
    const safeName = `<span class="text-pinksoft">${esc(siteName)}</span>`;

    if (title.includes("{siteName}")) {
        return esc(title).replace(/\{siteName\}/g, safeName);
    }
    if (siteName && title.toLowerCase().includes(siteName.toLowerCase())) {
        const re = new RegExp(escRegex(esc(siteName)), "i");
        return esc(title).replace(re, safeName);
    }
    return esc(title);
}

function extractIsoDate(order) {
    if (order.createdDate && /^\d{4}-\d{2}-\d{2}$/.test(order.createdDate)) {
        return order.createdDate;
    }
    const m = String(order.createdAt || "").match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return "";
}

// ================= WEBSOCKET =================
function setWsStatus(connected) {
    ["ws-status-login", "ws-status-dash"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const dot = el.querySelector(".ws-dot");
        const txt = el.querySelector(".ws-text");
        dot.className = `ws-dot w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"}`;
        txt.textContent = connected ? "Подключено" : "Нет соединения";
    });
}

function sendWs(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToast("Нет соединения с WebSocket-сервером", true);
        return false;
    }
    ws.send(JSON.stringify(payload));
    return true;
}

function connectWs() {
    try {
        ws = new WebSocket(WS_URL);
    } catch (e) {
        setWsStatus(false);
        setTimeout(connectWs, 3000);
        return;
    }

    ws.onopen = () => {
        setWsStatus(true);
        if (adminToken) {
            sendWs({ type: "admin_verify", token: adminToken });
        }
    };

    ws.onclose = () => {
        setWsStatus(false);
        setTimeout(connectWs, 3000);
    };

    ws.onerror = () => setWsStatus(false);

    ws.onmessage = (event) => {
        try {
            handleWsMessage(JSON.parse(event.data));
        } catch (e) {
            console.warn("Invalid WS JSON", e);
        }
    };
}

function handleWsMessage(msg) {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "state" && msg.data) {
        const d = msg.data;
        if (d.settings) state.settings = { ...state.settings, ...d.settings };
        if (Array.isArray(d.teamBanners)) state.teamBanners = d.teamBanners;
        else if (d.teamBanner) state.teamBanners = [{ id: "team-1", ...d.teamBanner }];
        if (d.faqSection) state.faqSection = { ...state.faqSection, ...d.faqSection };
        if (Array.isArray(d.categories)) state.categories = d.categories;
        if (Array.isArray(d.products)) state.products = d.products;
        if (Array.isArray(d.promocodes)) state.promocodes = d.promocodes;
        if (d.payments) state.payments = d.payments;
        if (Array.isArray(d.orders)) state.orders = d.orders;
        if (d.system) state.system = { ...state.system, ...d.system };

        renderPublic();
        if (isAdminAuth) syncAdminUI();
    }
    else if (msg.type === "auth_result") {
        const errEl = document.getElementById("admin-login-error");
        if (msg.success) {
            const wasAuth = isAdminAuth;
            isAdminAuth = true;
            if (msg.token) {
                adminToken = msg.token;
                sessionStorage.setItem("boomgrief_admin_token", msg.token);
            }
            errEl.classList.add("hidden");
            renderAdminAuthView();
            syncAdminUI();
            if (!msg.silent && !wasAuth && isAdminRoute()) {
                showToast("Вы вошли в панель управления");
            }
        } else {
            isAdminAuth = false;
            adminToken = null;
            sessionStorage.removeItem("boomgrief_admin_token");
            renderAdminAuthView();
            if (msg.error) {
                errEl.textContent = msg.error;
                errEl.classList.remove("hidden");
            }
        }
    }
    else if (msg.type === "order_created") {
        closeBuyModal();
    }
    else if (msg.type === "toast") {
        showToast(msg.message || "Выполнено", Boolean(msg.isError));
    }
}

// ================= РЕНДЕР ПУБЛИЧНОГО САЙТА =================
function renderPublic() {
    const s = state.settings;
    applyBrandElements();

    const onlineVal = (state.system?.autoOnline && state.system?.pluginOnline !== null && state.system?.pluginOnline !== undefined)
        ? state.system.pluginOnline
        : (s.online ?? 0);

    document.getElementById("pub-version").textContent = s.version || "";
    document.getElementById("pub-hero-version").textContent = s.version || "";
    document.getElementById("pub-online").textContent = onlineVal;
    document.getElementById("pub-ip").textContent = s.serverIp || "";
    document.getElementById("pub-hero-ip").textContent = s.serverIp || "";
    document.getElementById("pub-hero-title").innerHTML = formatHeroTitle(s.heroTitle, s.siteName || "BoomGrief");
    document.getElementById("pub-hero-sub").textContent = s.heroSubtitle || "";

    renderPublicCatalog();
    renderRecentPurchases();
    renderPublicTeam();
    renderPublicFaq();
}

// --- Интерактивное обновление блока валюты ---
function updateCurrencyUI(prodId, rawQty, source = "slider") {
    const prod = state.products.find(p => p.id === prodId);
    if (!prod) return;
    const unitPrice = Number(prod.pricePerUnit) || Number(prod.price) || 1;
    const minAmt = Math.max(1, Math.min(MAX_CURRENCY_AMOUNT, Number(prod.minAmount) || 1));
    const qty = clampCurrency(rawQty, minAmt);
    const rubles = roundMoney(qty * unitPrice);

    currencySelections[prodId] = qty;

    const slider = document.getElementById(`curr-slider-${prodId}`);
    const disp = document.getElementById(`curr-disp-${prodId}`);
    const rubInp = document.getElementById(`curr-rub-${prodId}`);
    const qtyInp = document.getElementById(`curr-qty-${prodId}`);

    if (disp) disp.textContent = qty.toLocaleString("ru-RU");
    if (slider && source !== "slider") slider.value = qty;
    if (qtyInp && source !== "qty") qtyInp.value = qty;
    if (rubInp && source !== "rub") rubInp.value = rubles;
}

function onCurrencySlider(prodId, val) {
    updateCurrencyUI(prodId, val, "slider");
}

function onCurrencyQtyInput(prodId, val) {
    if (val === "") return;
    updateCurrencyUI(prodId, val, "qty");
}

function onCurrencyQtyBlur(prodId) {
    const prod = state.products.find(p => p.id === prodId);
    if (!prod) return;
    const qtyInp = document.getElementById(`curr-qty-${prodId}`);
    updateCurrencyUI(prodId, qtyInp ? qtyInp.value : prod.minAmount, "blur");
}

function onCurrencyRubInput(prodId, val) {
    const prod = state.products.find(p => p.id === prodId);
    if (!prod || val === "") return;
    const unitPrice = Number(prod.pricePerUnit) || Number(prod.price) || 1;
    const qty = Math.round(parseDecimal(val) / unitPrice);
    if (Number.isFinite(qty)) updateCurrencyUI(prodId, qty, "rub");
}

function onCurrencyRubBlur(prodId) {
    const prod = state.products.find(p => p.id === prodId);
    if (!prod) return;
    const curQty = currencySelections[prodId] || prod.minAmount || 1;
    updateCurrencyUI(prodId, curQty, "blur");
}

function setCurrencyPresetRubles(prodId, rubles) {
    const prod = state.products.find(p => p.id === prodId);
    if (!prod) return;
    const unitPrice = Number(prod.pricePerUnit) || Number(prod.price) || 1;
    const qty = Math.round(rubles / unitPrice);
    updateCurrencyUI(prodId, qty, "preset");
}

function renderPublicCatalog() {
    const catsEl = document.getElementById("pub-categories");
    const prodsEl = document.getElementById("pub-products");

    if (!state.categories.length && !state.products.length) {
        catsEl.innerHTML = "";
        prodsEl.innerHTML = `
            <div class="max-w-lg mx-auto bg-card border border-dashed border-pinksoft/25 rounded-3xl py-14 px-6 text-center">
                <div class="w-12 h-12 mx-auto mb-4 rounded-2xl bg-pinksoft/10 border border-pinksoft/25 flex items-center justify-center text-pinksoft text-xl">✦</div>
                <h3 class="text-lg font-bold mb-1.5">Товаров пока нет</h3>
                <p class="text-sm text-[#b8aec8]">Магазин сейчас наполняется. Скоро здесь появятся привилегии, кейсы и услуги.</p>
            </div>`;
        return;
    }

    if (state.categories.length && !state.categories.some(c => c.id === selectedCategoryId)) {
        selectedCategoryId = state.categories[0].id;
    }

    catsEl.innerHTML = state.categories.map(c => {
        const active = c.id === selectedCategoryId;
        return `
            <button type="button" onclick="selectedCategoryId='${esc(c.id)}';renderPublicCatalog()"
                class="px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                    active
                        ? "bg-pinksoft/15 border-pinksoft text-white"
                        : "bg-card border-soft text-[#b8aec8] hover:text-white border-soft-hover"
                }">
                ${esc(c.name)}
            </button>`;
    }).join("");

    const filtered = state.categories.length
        ? state.products.filter(p => p.categoryId === selectedCategoryId)
        : state.products;

    if (!filtered.length) {
        prodsEl.innerHTML = `
            <div class="max-w-lg mx-auto bg-card border border-dashed border-pinksoft/25 rounded-3xl py-12 px-6 text-center">
                <h3 class="text-base font-bold mb-1">В этой категории пока нет товаров</h3>
                <p class="text-xs text-[#b8aec8]">Выберите другую категорию или загляните позже.</p>
            </div>`;
        return;
    }

    const currencyProds = filtered.filter(p => p.type === "currency");
    const regularProds = filtered.filter(p => p.type !== "currency");

    let html = "";

    // 1. Товары типа "Валюта" — сверху, друг под другом
    if (currencyProds.length) {
        const presets = [100, 500, 1000, 2000, 5000];
        html += `<div class="flex flex-col gap-4 ${regularProds.length ? "mb-7" : ""}">` +
            currencyProds.map(p => {
                const unitPrice = Number(p.pricePerUnit) || Number(p.price) || 1;
                const minAmt = Math.max(1, Math.min(MAX_CURRENCY_AMOUNT, Number(p.minAmount) || 1));
                const initialQty = clampCurrency(currencySelections[p.id] ?? minAmt, minAmt);
                currencySelections[p.id] = initialQty;
                const initialRub = roundMoney(initialQty * unitPrice);
                const iconSrc = (p.icon && p.icon.trim()) ? p.icon.trim() : CURRENCY_FALLBACK;

                return `
                    <div class="bg-card border border-soft border-soft-hover rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row items-stretch md:items-center gap-6 transition">
                        <div class="w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 rounded-2xl bg-card2 border border-pinksoft/20 overflow-hidden shrink-0 flex items-center justify-center self-center md:self-auto">
                            <img src="${esc(iconSrc)}" alt="${esc(p.name)}"
                                class="w-full h-full object-cover"
                                onerror="this.onerror=null;this.src=CURRENCY_FALLBACK;">
                        </div>

                        <div class="flex-1 min-w-0 space-y-4">
                            <div class="flex items-start justify-between gap-4">
                                <div>
                                    <div class="flex items-center gap-2.5 flex-wrap">
                                        <h3 class="text-xl font-extrabold text-white">${esc(p.name)}</h3>
                                        ${p.badge ? `<span class="px-2.5 py-0.5 rounded-full bg-pinksoft/15 border border-pinksoft/35 text-pinksoft text-[11px] font-bold">${esc(p.badge)}</span>` : ""}
                                    </div>
                                    ${p.description ? `<p class="text-xs text-[#b8aec8] mt-1 whitespace-pre-line">${esc(p.description)}</p>` : ""}
                                </div>
                                <div class="text-right shrink-0">
                                    <div id="curr-disp-${esc(p.id)}" class="text-2xl font-extrabold text-pinksoft leading-none">${initialQty.toLocaleString("ru-RU")}</div>
                                    <div class="text-[11px] text-[#b8aec8] mt-1">${unitPrice} ₽ / шт.</div>
                                </div>
                            </div>

                            <div>
                                <div class="flex items-center justify-between text-[11px] text-[#b8aec8] mb-1.5">
                                    <span>Выберите количество</span>
                                    <span>от ${minAmt.toLocaleString("ru-RU")} до ${MAX_CURRENCY_AMOUNT.toLocaleString("ru-RU")}</span>
                                </div>
                                <input id="curr-slider-${esc(p.id)}" type="range"
                                    min="${minAmt}" max="${MAX_CURRENCY_AMOUNT}" value="${initialQty}"
                                    oninput="onCurrencySlider('${esc(p.id)}', this.value)"
                                    class="w-full accent-[#f5b4dc] cursor-pointer">
                            </div>

                            <div class="flex flex-wrap gap-2">
                                ${presets.map(rub => `
                                    <button type="button" onclick="setCurrencyPresetRubles('${esc(p.id)}', ${rub})"
                                        class="px-3 py-1 rounded-full bg-bg border border-soft hover:border-pinksoft/50 text-xs font-semibold text-[#b8aec8] hover:text-white transition">
                                        ${rub} ₽
                                    </button>
                                `).join("")}
                            </div>

                            <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                                <div class="flex items-center gap-2">
                                    <div class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg border border-soft focus-within:border-pinksoft">
                                        <input id="curr-rub-${esc(p.id)}" type="number" step="any" value="${initialRub}"
                                            oninput="onCurrencyRubInput('${esc(p.id)}', this.value)"
                                            onblur="onCurrencyRubBlur('${esc(p.id)}')"
                                            class="w-20 bg-transparent text-sm font-bold text-white focus:outline-none">
                                        <span class="text-xs font-semibold text-[#b8aec8]">₽</span>
                                    </div>
                                    <span class="text-[#b8aec8] text-sm select-none">⇄</span>
                                    <div class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg border border-soft focus-within:border-pinksoft">
                                        <input id="curr-qty-${esc(p.id)}" type="number" min="${minAmt}" max="${MAX_CURRENCY_AMOUNT}" value="${initialQty}"
                                            oninput="onCurrencyQtyInput('${esc(p.id)}', this.value)"
                                            onblur="onCurrencyQtyBlur('${esc(p.id)}')"
                                            class="w-24 bg-transparent text-sm font-bold text-white focus:outline-none">
                                        <span class="text-xs font-semibold text-[#b8aec8] truncate max-w-[80px]">${esc(p.name)}</span>
                                    </div>
                                </div>

                                <button type="button" onclick="openBuyModal('${esc(p.id)}', currencySelections['${esc(p.id)}'])"
                                    class="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-pinksoft hover:bg-[#f8c6e5] text-[#140d1f] font-bold text-sm transition shrink-0">
                                    <span>Приобрести</span>
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>`;
            }).join("") + `</div>`;
    }

    // 2. Обычные товары — сеткой ниже
    if (regularProds.length) {
        html += `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                ${regularProds.map(p => {
                    const feats = Array.isArray(p.features) ? p.features : [];
                    return `
                        <div class="relative bg-card border border-soft border-soft-hover rounded-2xl p-6 flex flex-col transition hover:-translate-y-0.5">
                            ${p.badge ? `<span class="absolute top-4 right-4 px-2.5 py-0.5 rounded-full bg-pinksoft/15 border border-pinksoft/35 text-pinksoft text-[11px] font-bold">${esc(p.badge)}</span>` : ""}
                            <div class="text-xl font-extrabold mb-2 pr-14">${esc(p.name)}</div>
                            ${p.description ? `<p class="text-xs text-[#b8aec8] mb-4 whitespace-pre-line">${esc(p.description)}</p>` : ""}
                            ${feats.length ? `
                                <ul class="space-y-1.5 mb-5 text-xs text-[#e5dff0]">
                                    ${feats.map(f => `<li class="flex items-start gap-2"><span class="text-pinksoft font-bold">•</span><span>${esc(f)}</span></li>`).join("")}
                                </ul>` : ""}
                            <div class="mt-auto pt-4 border-t border-soft flex items-center justify-between gap-3">
                                <div class="flex items-baseline gap-2">
                                    <span class="text-xl font-extrabold">${p.price} ₽</span>
                                    ${p.oldPrice ? `<span class="text-xs text-[#b8aec8] line-through">${p.oldPrice} ₽</span>` : ""}
                                </div>
                                <button type="button" onclick="openBuyModal('${esc(p.id)}')"
                                    class="px-4 py-2 rounded-xl bg-pinksoft hover:bg-[#f8c6e5] text-[#140d1f] font-bold text-xs transition">
                                    Купить
                                </button>
                            </div>
                        </div>`;
                }).join("")}
            </div>`;
    }

    prodsEl.innerHTML = html;
}

function renderRecentPurchases() {
    const approved = (state.orders || []).filter(o => o.status === "approved").slice(0, 4);
    const sec = document.getElementById("recent-purchases");
    sec.classList.toggle("hidden", !approved.length);
    if (!approved.length) return;

    document.getElementById("pub-recent-list").innerHTML = approved.map(o => {
        const initial = esc((o.nickname || "?").charAt(0).toUpperCase());
        return `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-bg border border-soft">
                <div class="w-9 h-9 rounded-lg bg-pinksoft/15 border border-pinksoft/30 flex items-center justify-center font-extrabold text-xs text-pinksoft shrink-0">
                    ${initial}
                </div>
                <div class="min-w-0">
                    <div class="text-xs font-bold text-white truncate">${esc(o.nickname)}</div>
                    <div class="text-[11px] text-[#b8aec8] truncate">${esc(o.productName)}</div>
                </div>
            </div>`;
    }).join("");
}

function renderPublicTeam() {
    const visible = (state.teamBanners || []).filter(b => b.enabled !== false);
    document.getElementById("team").classList.toggle("hidden", !visible.length);
    document.getElementById("nav-team-link").classList.toggle("hidden", !visible.length);

    document.getElementById("pub-team-list").innerHTML = visible.map(b => `
        <div class="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#161023] via-[#1b122b] to-[#241436] border border-soft px-7 py-9 sm:px-11 sm:py-11 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 min-h-[240px]">
            <div class="max-w-xl z-10">
                <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3">${esc(b.title)}</h2>
                <p class="text-sm text-[#b8aec8] leading-relaxed mb-6 whitespace-pre-line">${esc(b.description)}</p>
                ${b.buttonText ? `
                    <a href="${esc(b.buttonUrl || "#")}" target="_blank" rel="noopener"
                        class="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#fde8f5] hover:bg-white text-[#140d1f] font-bold text-sm transition">
                        <span>${esc(b.buttonText)}</span>
                        <span>↗</span>
                    </a>` : ""}
            </div>
            ${b.image ? `
                <div class="md:absolute md:right-10 md:bottom-0 h-[200px] sm:h-[240px] self-end -mb-9 md:mb-0 pointer-events-none select-none">
                    <img src="${esc(b.image)}" alt="${esc(b.title)}"
                        class="h-full w-auto object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,0.45)]"
                        onerror="this.onerror=null;this.src=PIG_FALLBACK;">
                </div>` : ""}
        </div>
    `).join("");
}

function renderPublicFaq() {
    const items = (state.faqSection.items || []).filter(i => i.enabled !== false);
    const show = state.faqSection.enabled !== false && items.length > 0;
    document.getElementById("faq").classList.toggle("hidden", !show);
    document.getElementById("nav-faq-link").classList.toggle("hidden", !show);
    if (!show) return;

    document.getElementById("pub-faq-title").textContent = state.faqSection.title || "Частые вопросы";
    document.getElementById("pub-faq-sub").textContent = state.faqSection.subtitle || "";
    document.getElementById("pub-faq-list").innerHTML = items.map(item => `
        <div class="bg-card border border-soft rounded-2xl overflow-hidden transition">
            <button type="button" onclick="togglePublicFaq(this)"
                class="w-full px-5 py-4 flex items-center justify-between gap-4 text-left text-sm font-bold text-white">
                <span>${esc(item.question)}</span>
                <svg class="w-4 h-4 text-pinksoft shrink-0 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </button>
            <div class="hidden px-5 pb-4 text-sm text-[#b8aec8] whitespace-pre-line">${esc(item.answer)}</div>
        </div>
    `).join("");
}

function togglePublicFaq(btn) {
    const ans = btn.nextElementSibling;
    const svg = btn.querySelector("svg");
    ans.classList.toggle("hidden");
    svg.classList.toggle("rotate-180");
}

function copyServerIp() {
    navigator.clipboard.writeText(state.settings.serverIp || "")
        .then(() => showToast(`IP скопирован: ${state.settings.serverIp}`))
        .catch(() => showToast("Не удалось скопировать IP", true));
}

function openRulesModal() { document.getElementById("rules-modal").classList.remove("hidden"); }
function closeRulesModal() { document.getElementById("rules-modal").classList.add("hidden"); }

// ================= ПОКУПКА =================
function isPromoExpired(promo) {
    if (promo.maxUses > 0 && (promo.usedCount || 0) >= promo.maxUses) return true;
    if (promo.expiresAt) {
        const exp = new Date(promo.expiresAt + "T23:59:59");
        if (Date.now() > exp.getTime()) return true;
    }
    return false;
}

function openBuyModal(productId, qty = null) {
    const prod = state.products.find(p => p.id === productId);
    if (!prod) return;
    checkoutProduct = prod;
    checkoutPromo = null;

    if (prod.type === "currency") {
        const minAmt = Math.max(1, Math.min(MAX_CURRENCY_AMOUNT, Number(prod.minAmount) || 1));
        checkoutQuantity = clampCurrency(qty ?? currencySelections[prod.id] ?? minAmt, minAmt);
        document.getElementById("buy-title").textContent = `Покупка: ${prod.name} (${checkoutQuantity.toLocaleString("ru-RU")} шт.)`;
    } else {
        checkoutQuantity = 1;
        document.getElementById("buy-title").textContent = `Покупка: ${prod.name}`;
    }

    document.getElementById("buy-nick").value = "";
    document.getElementById("buy-promo").value = "";
    document.getElementById("buy-promo-msg").textContent = "";

    const enabled = state.payments?.enabled !== false;
    document.getElementById("buy-disabled-notice").classList.toggle("hidden", enabled);
    document.getElementById("buy-form-body").classList.toggle("hidden", !enabled);

    if (enabled) {
        renderCheckoutMethods();
        updateCheckoutPrice();
    }
    document.getElementById("buy-modal").classList.remove("hidden");
}

function closeBuyModal() {
    document.getElementById("buy-modal").classList.add("hidden");
    checkoutProduct = null;
}

function renderCheckoutMethods() {
    const methods = [];
    if (state.payments?.donationAlerts?.enabled) {
        methods.push({ id: "donationalerts", title: "DonationAlerts", sub: "Перевод по ссылке" });
    }
    if (state.payments?.yoomoney?.enabled) {
        methods.push({ id: "yoomoney", title: "YooMoney", sub: "Пока недоступно" });
    }

    const wrap = document.getElementById("buy-methods");
    const details = document.getElementById("buy-method-details");
    const btn = document.getElementById("buy-submit-btn");

    if (!methods.length) {
        checkoutMethod = null;
        wrap.innerHTML = `<div class="col-span-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">Нет доступных способов оплаты.</div>`;
        details.innerHTML = "";
        btn.disabled = true;
        return;
    }

    if (!methods.some(m => m.id === checkoutMethod)) checkoutMethod = methods[0].id;

    wrap.innerHTML = methods.map(m => `
        <button type="button" onclick="checkoutMethod='${m.id}';renderCheckoutMethods()"
            class="p-3 rounded-xl text-left border transition ${
                checkoutMethod === m.id
                    ? "bg-pinksoft/10 border-pinksoft"
                    : "bg-bg border-soft border-soft-hover"
            }">
            <div class="text-sm font-bold text-white">${m.title}</div>
            <div class="text-[11px] text-[#b8aec8]">${m.sub}</div>
        </button>
    `).join("");

    if (checkoutMethod === "donationalerts") {
        const da = state.payments.donationAlerts || {};
        details.innerHTML = `
            <div class="p-3.5 rounded-xl bg-purplesoft/10 border border-pinksoft/25 text-xs text-[#ece6f7] space-y-2.5">
                <div class="font-bold text-pinksoft">Инструкция оплаты</div>
                <div class="whitespace-pre-line leading-relaxed">${esc(da.instruction || "Переведите нужную сумму по ссылке DonationAlerts и нажмите кнопку ниже.")}</div>
                ${da.url ? `<a href="${esc(da.url)}" target="_blank" rel="noopener" class="block text-center py-2 rounded-lg bg-card2 border border-soft hover:border-pinksoft font-semibold text-white transition">Открыть DonationAlerts ↗</a>` : ""}
            </div>`;
        btn.disabled = false;
        btn.textContent = "Оплатить";
    } else if (checkoutMethod === "yoomoney") {
        details.innerHTML = `<div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">Пока недоступно. Выберите другой способ оплаты.</div>`;
        btn.disabled = true;
        btn.textContent = "Пока недоступно";
    }
}

function applyCheckoutPromo() {
    const code = document.getElementById("buy-promo").value.trim().toLowerCase();
    const msgEl = document.getElementById("buy-promo-msg");
    if (!code) {
        checkoutPromo = null;
        msgEl.textContent = "";
        updateCheckoutPrice();
        return;
    }
    const found = (state.promocodes || []).find(p => p.code.toLowerCase() === code);
    if (!found) {
        checkoutPromo = null;
        msgEl.className = "text-xs mt-1.5 text-red-300";
        msgEl.textContent = "Промокод не найден";
    } else if (isPromoExpired(found)) {
        checkoutPromo = null;
        msgEl.className = "text-xs mt-1.5 text-red-300";
        msgEl.textContent = "Срок действия или лимит купона истёк";
    } else {
        checkoutPromo = found;
        msgEl.className = "text-xs mt-1.5 text-emerald-300";
        msgEl.textContent = `Скидка −${found.discount}% применена`;
    }
    updateCheckoutPrice();
}

function getFinalPrice() {
    if (!checkoutProduct) return 0;
    let price = checkoutProduct.type === "currency"
        ? (Number(checkoutProduct.pricePerUnit) || Number(checkoutProduct.price) || 1) * checkoutQuantity
        : (Number(checkoutProduct.price) || 0);
    if (checkoutPromo) {
        price = price * (100 - checkoutPromo.discount) / 100;
    }
    return Math.max(0.01, roundMoney(price));
}

function updateCheckoutPrice() {
    document.getElementById("buy-final-price").textContent = `${getFinalPrice()} ₽`;
}

function submitOrder() {
    if (!checkoutProduct || !checkoutMethod) return;
    const nickname = document.getElementById("buy-nick").value.trim();
    if (!nickname) return showToast("Введите игровой никнейм", true);
    if (checkoutMethod === "yoomoney") return showToast("Пока недоступно", true);

    sendWs({
        type: "create_order",
        data: {
            nickname,
            productId: checkoutProduct.id,
            productName: checkoutProduct.name,
            quantity: checkoutQuantity,
            amount: getFinalPrice(),
            promocode: checkoutPromo ? checkoutPromo.code : null,
            method: checkoutMethod
        }
    });
}

// ================= АДМИНКА =================
function renderAdminAuthView() {
    document.getElementById("admin-login-box").classList.toggle("hidden", isAdminAuth);
    document.getElementById("admin-dashboard").classList.toggle("hidden", !isAdminAuth);
}

document.getElementById("admin-login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    sendWs({
        type: "admin_login",
        login: document.getElementById("login-input").value.trim(),
        password: document.getElementById("password-input").value
    });
});

function adminLogout() {
    sendWs({ type: "admin_logout", token: adminToken });
    isAdminAuth = false;
    adminToken = null;
    sessionStorage.removeItem("boomgrief_admin_token");
    renderAdminAuthView();
}

document.getElementById("admin-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".adm-tab");
    if (!btn) return;
    document.querySelectorAll(".adm-tab").forEach(b => {
        b.className = "adm-tab px-4 py-2 rounded-xl text-xs font-semibold border transition bg-card border-soft text-[#b8aec8] hover:text-white";
    });
    btn.className = "adm-tab px-4 py-2 rounded-xl text-xs font-semibold border transition bg-pinksoft/15 border-pinksoft text-white";
    document.querySelectorAll(".adm-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
});

function syncAdminUI() {
    const s = state.settings;
    pendingAvatarValue = s.avatar || "avatar.webp";

    const avUrlInput = document.getElementById("adm-avatar-url");
    const avPreview = document.getElementById("adm-avatar-preview");
    const avBadge = document.getElementById("adm-avatar-badge");

    avPreview.onerror = function () { this.onerror = null; this.src = AVATAR_FALLBACK; };
    avPreview.src = pendingAvatarValue;

    if (pendingAvatarValue.startsWith("data:image/")) {
        avUrlInput.value = "";
        avUrlInput.placeholder = "Загружен локальный файл (введите URL, чтобы заменить)";
        avBadge.classList.remove("hidden");
    } else {
        avUrlInput.value = pendingAvatarValue;
        avUrlInput.placeholder = "avatar.webp или https://...";
        avBadge.classList.add("hidden");
    }

    document.getElementById("adm-site-name").value = s.siteName || "";
    document.getElementById("adm-server-ip").value = s.serverIp || "";
    document.getElementById("adm-version").value = s.version || "";
    document.getElementById("adm-online").value = s.online ?? 0;
    document.getElementById("adm-hero-title").value = s.heroTitle || "";
    document.getElementById("adm-hero-sub").value = s.heroSubtitle || "";

    renderAdminCategories();
    renderAdminProducts();
    renderAdminTeamBanners();

    document.getElementById("adm-faq-enabled").checked = state.faqSection.enabled !== false;
    document.getElementById("adm-faq-title").value = state.faqSection.title || "";
    document.getElementById("adm-faq-sub").value = state.faqSection.subtitle || "";
    renderAdminFaqItems();

    renderAdminPromos();
    renderAdminPayments();
    populateHistoryProductFilter();
    renderAdminOrders();
    renderAdminSystem();
}

// --- 1. Основное и Аватар ---
function onAvatarUrlInput(val) {
    const clean = val.trim();
    pendingAvatarValue = clean || "avatar.webp";
    document.getElementById("adm-avatar-badge").classList.add("hidden");
    const prev = document.getElementById("adm-avatar-preview");
    prev.onerror = function () { this.onerror = null; this.src = AVATAR_FALLBACK; };
    prev.src = pendingAvatarValue;
}

function onAvatarFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const size = 256;
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            const side = Math.min(img.width, img.height);
            const sx = (img.width - side) / 2;
            const sy = (img.height - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

            let dataUrl = canvas.toDataURL("image/webp", 0.86);
            if (!dataUrl.startsWith("data:image/webp")) {
                dataUrl = canvas.toDataURL("image/png");
            }
            pendingAvatarValue = dataUrl;
            document.getElementById("adm-avatar-url").value = "";
            document.getElementById("adm-avatar-url").placeholder = "Загружен локальный файл (нажмите «Сохранить настройки»)";
            document.getElementById("adm-avatar-preview").src = dataUrl;
            document.getElementById("adm-avatar-badge").classList.remove("hidden");
            showToast("Аватар загружен. Нажмите «Сохранить настройки»");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
}

function resetAvatarSetting() {
    pendingAvatarValue = "avatar.webp";
    document.getElementById("adm-avatar-url").value = "avatar.webp";
    document.getElementById("adm-avatar-badge").classList.add("hidden");
    const prev = document.getElementById("adm-avatar-preview");
    prev.onerror = function () { this.onerror = null; this.src = AVATAR_FALLBACK; };
    prev.src = "avatar.webp";
}

function insertHeroSiteName() {
    const el = document.getElementById("adm-hero-title");
    const start = el.selectionStart || el.value.length;
    const end = el.selectionEnd || el.value.length;
    el.value = el.value.slice(0, start) + "{siteName}" + el.value.slice(end);
    el.focus();
    el.selectionStart = el.selectionEnd = start + 10;
}

function saveSettings() {
    const oldName = state.settings.siteName || "";
    const newName = document.getElementById("adm-site-name").value.trim() || "BoomGrief";
    let heroTitle = document.getElementById("adm-hero-title").value.trim();

    if (oldName && oldName !== newName && heroTitle && !heroTitle.includes("{siteName}")) {
        const re = new RegExp(escRegex(oldName), "gi");
        if (re.test(heroTitle)) {
            heroTitle = heroTitle.replace(re, newName);
        }
    }

    const urlVal = document.getElementById("adm-avatar-url").value.trim();
    const avatar = (pendingAvatarValue && pendingAvatarValue.startsWith("data:image/") && !urlVal)
        ? pendingAvatarValue
        : (urlVal || "avatar.webp");

    sendWs({
        type: "update_settings",
        token: adminToken,
        data: {
            siteName: newName,
            avatar,
            serverIp: document.getElementById("adm-server-ip").value.trim(),
            version: document.getElementById("adm-version").value.trim(),
            online: Number(document.getElementById("adm-online").value) || 0,
            heroTitle: heroTitle || "Донат-магазин {siteName}",
            heroSubtitle: document.getElementById("adm-hero-sub").value.trim()
        }
    });
}

// --- 2. Категории и Товары ---
function renderAdminCategories() {
    const list = document.getElementById("adm-cat-list");
    if (!state.categories.length) {
        list.innerHTML = `<div class="text-xs text-[#b8aec8]">Категорий пока нет.</div>`;
        return;
    }
    list.innerHTML = state.categories.map(c => {
        if (editingCategoryId === c.id) {
            return `
                <div class="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-bg border border-pinksoft/40">
                    <input id="cat-rename-input-${esc(c.id)}" value="${esc(c.name)}"
                        onkeydown="if(event.key==='Enter') saveCategoryRename('${esc(c.id)}'); if(event.key==='Escape'){editingCategoryId=null;renderAdminCategories();}"
                        class="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg bg-card border border-soft focus:border-pinksoft focus:outline-none text-sm text-white">
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="saveCategoryRename('${esc(c.id)}')"
                            class="px-3 py-1.5 rounded-lg bg-pinksoft text-[#140d1f] font-bold text-xs">Сохранить</button>
                        <button type="button" onclick="editingCategoryId=null;renderAdminCategories()"
                            class="px-3 py-1.5 rounded-lg bg-card2 border border-soft text-xs text-[#b8aec8]">Отмена</button>
                    </div>
                </div>`;
        }
        return `
            <div class="flex flex-wrap items-center justify-between gap-2.5 p-3.5 rounded-xl bg-bg border border-soft">
                <span class="text-sm font-semibold">${esc(c.name)}</span>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="startCategoryRename('${esc(c.id)}')"
                        class="px-3 py-1.5 rounded-lg bg-card2 border border-soft hover:border-pinksoft/40 text-xs font-semibold text-white transition">
                        Переименовать
                    </button>
                    <button type="button" onclick="deleteCategory('${esc(c.id)}')"
                        class="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-300 transition">
                        Удалить
                    </button>
                </div>
            </div>`;
    }).join("");

    if (editingCategoryId) {
        const inp = document.getElementById(`cat-rename-input-${editingCategoryId}`);
        if (inp) { inp.focus(); inp.select(); }
    }
}

function addCategory() {
    const inp = document.getElementById("adm-new-cat");
    const name = inp.value.trim();
    if (!name) return;
    inp.value = "";
    sendWs({
        type: "update_categories",
        token: adminToken,
        data: [...state.categories, { id: "cat-" + Date.now(), name }]
    });
}

function startCategoryRename(id) {
    editingCategoryId = id;
    renderAdminCategories();
}

function saveCategoryRename(id) {
    const inp = document.getElementById(`cat-rename-input-${id}`);
    const name = inp ? inp.value.trim() : "";
    if (!name) return showToast("Название не может быть пустым", true);
    editingCategoryId = null;
    const next = state.categories.map(c => c.id === id ? { ...c, name } : c);
    sendWs({ type: "update_categories", token: adminToken, data: next });
}

function deleteCategory(id) {
    if (!confirm("Удалить категорию и все привязанные товары?")) return;
    sendWs({ type: "update_categories", token: adminToken, data: state.categories.filter(c => c.id !== id) });
    sendWs({ type: "update_products", token: adminToken, data: state.products.filter(p => p.categoryId !== id) });
}

function renderAdminProducts() {
    const list = document.getElementById("adm-prod-list");
    if (!state.products.length) {
        list.innerHTML = `<div class="text-xs text-[#b8aec8]">Товаров пока нет. Нажмите «+ Добавить товар».</div>`;
        return;
    }
    list.innerHTML = state.products.map(p => {
        const cat = state.categories.find(c => c.id === p.categoryId);
        const isCurrency = p.type === "currency";
        const priceLabel = isCurrency
            ? `${Number(p.pricePerUnit) || Number(p.price) || 1} ₽ / шт. (от ${Number(p.minAmount) || 1} шт.)`
            : `${p.price} ₽`;

        return `
            <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-bg border border-soft">
                <div class="flex items-center gap-3">
                    ${isCurrency ? `
                        <img src="${esc((p.icon && p.icon.trim()) ? p.icon.trim() : CURRENCY_FALLBACK)}" alt=""
                            class="w-10 h-10 rounded-xl object-cover border border-pinksoft/25 bg-card2 shrink-0"
                            onerror="this.onerror=null;this.src=CURRENCY_FALLBACK;">
                    ` : ""}
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-bold">${esc(p.name)}</span>
                            <span class="text-sm font-bold text-pinksoft">${priceLabel}</span>
                            ${isCurrency ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-purplesoft/15 border border-purplesoft/30 text-purplesoft font-bold">Валюта</span>` : ""}
                            ${p.badge ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-pinksoft/15 text-pinksoft font-bold">${esc(p.badge)}</span>` : ""}
                        </div>
                        <div class="text-xs text-[#b8aec8] mt-0.5">
                            Категория: ${esc(cat ? cat.name : "Без категории")} • Команд: ${(p.commands || []).length}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="openProductModal('${esc(p.id)}')"
                        class="px-3 py-1.5 rounded-lg bg-card2 border border-soft hover:border-pinksoft/40 text-xs font-semibold text-white transition">
                        Изменить
                    </button>
                    <button type="button" onclick="deleteProduct('${esc(p.id)}')"
                        class="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-300 transition">
                        Удалить
                    </button>
                </div>
            </div>`;
    }).join("");
}

function toggleProductTypeFields() {
    const isCurrency = document.getElementById("pm-type").value === "currency";
    document.getElementById("pm-regular-fields").classList.toggle("hidden", isCurrency);
    document.getElementById("pm-currency-fields").classList.toggle("hidden", !isCurrency);
    document.getElementById("pm-features-wrap").classList.toggle("hidden", isCurrency);
}

function openProductModal(id = null) {
    const sel = document.getElementById("pm-cat");
    sel.innerHTML = state.categories.length
        ? state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")
        : `<option value="">Без категории</option>`;

    const p = id ? state.products.find(x => x.id === id) : null;
    document.getElementById("pm-title").textContent = p ? "Редактировать товар" : "Добавить товар";
    document.getElementById("pm-id").value = p ? p.id : "";
    document.getElementById("pm-type").value = p ? (p.type || "regular") : "regular";
    document.getElementById("pm-icon").value = p ? (p.icon || "") : "";
    document.getElementById("pm-name").value = p ? (p.name || "") : "";
    document.getElementById("pm-cat").value = p ? (p.categoryId || "") : (state.categories[0]?.id || "");
    document.getElementById("pm-price").value = p ? (p.price || "") : "";
    document.getElementById("pm-old-price").value = p ? (p.oldPrice || "") : "";
    document.getElementById("pm-unit-price").value = p ? (p.pricePerUnit ?? p.price ?? 1) : "1";
    document.getElementById("pm-min-amount").value = p ? (p.minAmount ?? 1) : "1";
    document.getElementById("pm-badge").value = p ? (p.badge || "") : "";
    document.getElementById("pm-desc").value = p ? (p.description || "") : "";
    document.getElementById("pm-features").value = p ? (p.features || []).join("\n") : "";
    document.getElementById("pm-commands").value = p ? (p.commands || []).join("\n") : "";

    toggleProductTypeFields();
    document.getElementById("product-modal").classList.remove("hidden");
}

function closeProductModal() {
    document.getElementById("product-modal").classList.add("hidden");
}

function insertCmdPlaceholder(ph) {
    const el = document.getElementById("pm-commands");
    const start = el.selectionStart || el.value.length;
    const end = el.selectionEnd || el.value.length;
    el.value = el.value.slice(0, start) + ph + el.value.slice(end);
    el.focus();
    el.selectionStart = el.selectionEnd = start + ph.length;
}

function saveProductFromModal() {
    const name = document.getElementById("pm-name").value.trim();
    const type = document.getElementById("pm-type").value || "regular";
    if (!name) return showToast("Укажите название товара", true);

    const id = document.getElementById("pm-id").value || ("prod-" + Date.now());
    let prod;

    if (type === "currency") {
        const pricePerUnit = parseDecimal(document.getElementById("pm-unit-price").value);
        const minAmount = Math.round(Number(document.getElementById("pm-min-amount").value));
        if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) {
            return showToast("Укажите корректную цену за 1 шт (например, 0.2)", true);
        }
        if (!minAmount || minAmount < 1 || minAmount > MAX_CURRENCY_AMOUNT) {
            return showToast("Мин. количество должно быть от 1 до 100 000", true);
        }
        prod = {
            id,
            type: "currency",
            icon: document.getElementById("pm-icon").value.trim(),
            name,
            categoryId: document.getElementById("pm-cat").value,
            pricePerUnit: roundUnitPrice(pricePerUnit),
            minAmount,
            price: roundMoney(pricePerUnit * minAmount),
            oldPrice: null,
            badge: document.getElementById("pm-badge").value.trim(),
            description: document.getElementById("pm-desc").value.trim(),
            features: [],
            commands: document.getElementById("pm-commands").value.split("\n").map(s => s.trim()).filter(Boolean)
        };
    } else {
        const price = parseDecimal(document.getElementById("pm-price").value);
        if (!Number.isFinite(price) || price <= 0) return showToast("Укажите цену товара", true);
        prod = {
            id,
            type: "regular",
            icon: "",
            name,
            categoryId: document.getElementById("pm-cat").value,
            price: roundMoney(price),
            oldPrice: parseDecimal(document.getElementById("pm-old-price").value) || null,
            badge: document.getElementById("pm-badge").value.trim(),
            description: document.getElementById("pm-desc").value.trim(),
            features: document.getElementById("pm-features").value.split("\n").map(s => s.trim()).filter(Boolean),
            commands: document.getElementById("pm-commands").value.split("\n").map(s => s.trim()).filter(Boolean)
        };
    }

    const exists = state.products.some(p => p.id === id);
    const next = exists ? state.products.map(p => p.id === id ? prod : p) : [...state.products, prod];
    sendWs({ type: "update_products", token: adminToken, data: next });
    closeProductModal();
}

function deleteProduct(id) {
    if (!confirm("Удалить товар?")) return;
    sendWs({ type: "update_products", token: adminToken, data: state.products.filter(p => p.id !== id) });
}

// --- 3. Блоки команды ---
function renderAdminTeamBanners() {
    const wrap = document.getElementById("adm-team-list");
    const banners = state.teamBanners || [];
    if (!banners.length) {
        wrap.innerHTML = `<div class="text-xs text-[#b8aec8]">Блоков пока нет. Нажмите «+ Создать блок».</div>`;
        return;
    }
    wrap.innerHTML = banners.map((b, idx) => `
        <div class="p-5 rounded-2xl bg-bg border border-soft space-y-3.5">
            <div class="flex items-center justify-between gap-3">
                <span class="text-sm font-bold">Блок #${idx + 1}</span>
                <label class="flex items-center gap-2 text-xs text-[#b8aec8] cursor-pointer">
                    <input type="checkbox" id="tb-en-${esc(b.id)}" ${b.enabled !== false ? "checked" : ""} class="w-4 h-4 accent-[#f5b4dc] cursor-pointer">
                    Показывать на сайте
                </label>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                    <label class="block text-xs font-semibold text-[#b8aec8] mb-1">Заголовок</label>
                    <input id="tb-title-${esc(b.id)}" value="${esc(b.title)}"
                        class="w-full px-3.5 py-2 rounded-xl bg-card border border-soft focus:border-pinksoft focus:outline-none text-sm text-white">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-[#b8aec8] mb-1">Картинка (файл или URL)</label>
                    <input id="tb-img-${esc(b.id)}" value="${esc(b.image || "")}" placeholder="pig-team.webp"
                        class="w-full px-3.5 py-2 rounded-xl bg-card border border-soft focus:border-pinksoft focus:outline-none text-sm text-white">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-[#b8aec8] mb-1">Текст кнопки</label>
                    <input id="tb-btntxt-${esc(b.id)}" value="${esc(b.buttonText || "")}"
                        class="w-full px-3.5 py-2 rounded-xl bg-card border border-soft focus:border-pinksoft focus:outline-none text-sm text-white">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-[#b8aec8] mb-1">Ссылка кнопки</label>
                    <input id="tb-btnurl-${esc(b.id)}" value="${esc(b.buttonUrl || "")}"
                        class="w-full px-3.5 py-2 rounded-xl bg-card border border-soft focus:border-pinksoft focus:outline-none text-sm text-white">
                </div>
            </div>
            <div>
                <label class="block text-xs font-semibold text-[#b8aec8] mb-1">Описание</label>
                <textarea id="tb-desc-${esc(b.id)}" rows="2"
                    class="w-full px-3.5 py-2 rounded-xl bg-card border border-soft focus:border-pinksoft focus:outline-none text-sm text-white">${esc(b.description || "")}</textarea>
            </div>
            <div class="flex items-center gap-2.5 pt-1">
                <button type="button" onclick="saveTeamBanner('${esc(b.id)}')"
                    class="px-4 py-2 rounded-xl bg-pinksoft hover:bg-[#f8c6e5] text-[#140d1f] font-bold text-xs transition">
                    Сохранить блок
                </button>
                <button type="button" onclick="deleteTeamBanner('${esc(b.id)}')"
                    class="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-300 transition">
                    Удалить
                </button>
            </div>
        </div>
    `).join("");
}

function createTeamBanner() {
    const next = [
        ...(state.teamBanners || []),
        {
            id: "team-" + Date.now(),
            enabled: true,
            title: "Новый блок",
            description: "Описание нового блока на главной странице.",
            buttonText: "Подробнее",
            buttonUrl: "https://discord.gg/boomgrief",
            image: "pig-team.webp"
        }
    ];
    sendWs({ type: "update_team_banners", token: adminToken, data: next });
}

function saveTeamBanner(id) {
    const next = (state.teamBanners || []).map(b => b.id !== id ? b : {
        ...b,
        enabled: document.getElementById(`tb-en-${id}`).checked,
        title: document.getElementById(`tb-title-${id}`).value.trim(),
        image: document.getElementById(`tb-img-${id}`).value.trim(),
        buttonText: document.getElementById(`tb-btntxt-${id}`).value.trim(),
        buttonUrl: document.getElementById(`tb-btnurl-${id}`).value.trim(),
        description: document.getElementById(`tb-desc-${id}`).value.trim()
    });
    sendWs({ type: "update_team_banners", token: adminToken, data: next });
}

function deleteTeamBanner(id) {
    if (!confirm("Удалить этот блок?")) return;
    sendWs({ type: "update_team_banners", token: adminToken, data: (state.teamBanners || []).filter(b => b.id !== id) });
}

// --- 4. FAQ ---
function saveFaqMeta() {
    sendWs({
        type: "update_faq_section",
        token: adminToken,
        data: {
            ...state.faqSection,
            enabled: document.getElementById("adm-faq-enabled").checked,
            title: document.getElementById("adm-faq-title").value.trim(),
            subtitle: document.getElementById("adm-faq-sub").value.trim()
        }
    });
}

function renderAdminFaqItems() {
    const wrap = document.getElementById("adm-faq-items");
    const items = state.faqSection.items || [];
    if (!items.length) {
        wrap.innerHTML = `<div class="text-xs text-[#b8aec8]">Вопросов пока нет.</div>`;
        return;
    }
    wrap.innerHTML = items.map(f => `
        <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-bg border border-soft">
            <div class="max-w-xl">
                <div class="text-sm font-bold">${esc(f.question)}</div>
                <div class="text-xs text-[#b8aec8] mt-0.5 line-clamp-2">${esc(f.answer)}</div>
            </div>
            <div class="flex items-center gap-2">
                <button type="button" onclick="toggleFaqItem('${esc(f.id)}')"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        f.enabled !== false
                            ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                            : "bg-card2 border-soft text-[#b8aec8]"
                    }">
                    ${f.enabled !== false ? "Вкл" : "Выкл"}
                </button>
                <button type="button" onclick="editFaqItem('${esc(f.id)}')"
                    class="px-3 py-1.5 rounded-lg bg-card2 border border-soft hover:border-pinksoft/40 text-xs font-semibold text-white transition">
                    Изменить
                </button>
                <button type="button" onclick="deleteFaqItem('${esc(f.id)}')"
                    class="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-300 transition">
                    Удалить
                </button>
            </div>
        </div>
    `).join("");
}

function saveFaqItem() {
    const q = document.getElementById("adm-faq-q").value.trim();
    const a = document.getElementById("adm-faq-a").value.trim();
    if (!q || !a) return showToast("Заполните вопрос и ответ", true);

    const id = document.getElementById("adm-faq-id").value || ("faq-" + Date.now());
    const items = state.faqSection.items || [];
    const exists = items.some(x => x.id === id);
    const nextItems = exists
        ? items.map(x => x.id === id ? { ...x, question: q, answer: a } : x)
        : [...items, { id, question: q, answer: a, enabled: true }];

    sendWs({ type: "update_faq_section", token: adminToken, data: { ...state.faqSection, items: nextItems } });
    resetFaqForm();
}

function editFaqItem(id) {
    const f = (state.faqSection.items || []).find(x => x.id === id);
    if (!f) return;
    document.getElementById("adm-faq-form-title").textContent = "Изменить вопрос";
    document.getElementById("adm-faq-id").value = f.id;
    document.getElementById("adm-faq-q").value = f.question;
    document.getElementById("adm-faq-a").value = f.answer;
}

function resetFaqForm() {
    document.getElementById("adm-faq-form-title").textContent = "Добавить вопрос";
    document.getElementById("adm-faq-id").value = "";
    document.getElementById("adm-faq-q").value = "";
    document.getElementById("adm-faq-a").value = "";
}

function toggleFaqItem(id) {
    const nextItems = (state.faqSection.items || []).map(x => x.id === id ? { ...x, enabled: x.enabled === false } : x);
    sendWs({ type: "update_faq_section", token: adminToken, data: { ...state.faqSection, items: nextItems } });
}

function deleteFaqItem(id) {
    const nextItems = (state.faqSection.items || []).filter(x => x.id !== id);
    sendWs({ type: "update_faq_section", token: adminToken, data: { ...state.faqSection, items: nextItems } });
}

// --- 5. Промокоды ---
function renderAdminPromos() {
    const wrap = document.getElementById("adm-promo-list");
    const list = state.promocodes || [];
    if (!list.length) {
        wrap.innerHTML = `<div class="text-xs text-[#b8aec8]">Купонов пока нет.</div>`;
        return;
    }
    wrap.innerHTML = list.map(p => {
        const expired = isPromoExpired(p);
        return `
            <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-bg border border-soft">
                <div class="flex items-center gap-3">
                    <span title="${expired ? "Истёк или исчерпан" : "Активен"}"
                        class="w-2.5 h-2.5 rounded-full shrink-0 ${expired ? "bg-red-500 shadow-[0_0_8px_#ef4444]" : "bg-emerald-400"}"></span>
                    <div>
                        <div class="text-sm font-bold">
                            ${esc(p.code)} <span class="text-pinksoft ml-1">−${p.discount}%</span>
                        </div>
                        <div class="text-xs text-[#b8aec8]">
                            Использований: ${p.usedCount || 0} / ${p.maxUses > 0 ? p.maxUses : "∞"}
                            ${p.expiresAt ? ` • До ${esc(p.expiresAt)}` : " • Бессрочный"}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="editPromo('${esc(p.id)}')"
                        class="px-3 py-1.5 rounded-lg bg-card2 border border-soft hover:border-pinksoft/40 text-xs font-semibold text-white transition">
                        Изменить
                    </button>
                    <button type="button" onclick="deletePromo('${esc(p.id)}')"
                        class="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-300 transition">
                        Удалить
                    </button>
                </div>
            </div>`;
    }).join("");
}

function savePromo() {
    const code = document.getElementById("adm-promo-code").value.trim().toUpperCase();
    if (!code) return showToast("Введите код купона", true);
    const id = document.getElementById("adm-promo-id").value || ("promo-" + Date.now());
    const existing = (state.promocodes || []).find(p => p.id === id);
    const promo = {
        id,
        code,
        discount: Number(document.getElementById("adm-promo-disc").value) || 15,
        maxUses: Number(document.getElementById("adm-promo-max").value) || 0,
        usedCount: existing ? (existing.usedCount || 0) : 0,
        expiresAt: document.getElementById("adm-promo-exp").value || ""
    };
    const next = existing
        ? state.promocodes.map(p => p.id === id ? promo : p)
        : [...(state.promocodes || []), promo];
    sendWs({ type: "update_promocodes", token: adminToken, data: next });
    resetPromoForm();
}

function editPromo(id) {
    const p = (state.promocodes || []).find(x => x.id === id);
    if (!p) return;
    document.getElementById("adm-promo-form-title").textContent = "Изменить купон";
    document.getElementById("adm-promo-id").value = p.id;
    document.getElementById("adm-promo-code").value = p.code;
    document.getElementById("adm-promo-max").value = p.maxUses || 0;
    document.getElementById("adm-promo-disc").value = p.discount || 15;
    document.getElementById("adm-promo-disc-val").textContent = (p.discount || 15) + "%";
    document.getElementById("adm-promo-exp").value = p.expiresAt || "";
}

function resetPromoForm() {
    document.getElementById("adm-promo-form-title").textContent = "Создать купон";
    document.getElementById("adm-promo-id").value = "";
    document.getElementById("adm-promo-code").value = "";
    document.getElementById("adm-promo-max").value = "0";
    document.getElementById("adm-promo-disc").value = "15";
    document.getElementById("adm-promo-disc-val").textContent = "15%";
    document.getElementById("adm-promo-exp").value = "";
}

function deletePromo(id) {
    sendWs({ type: "update_promocodes", token: adminToken, data: (state.promocodes || []).filter(p => p.id !== id) });
}

// --- 6. Оплата ---
function renderAdminPayments() {
    const pay = state.payments || {};
    const on = pay.enabled !== false;
    document.getElementById("adm-pay-dot").className = `w-2.5 h-2.5 rounded-full ${on ? "bg-emerald-400" : "bg-red-500"}`;
    document.getElementById("adm-pay-status-text").textContent = on ? "Приём платежей включён" : "Приём платежей выключен";
    const btn = document.getElementById("adm-pay-toggle-btn");
    btn.textContent = on ? "Выключить" : "Включить";
    btn.className = on
        ? "px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-xs font-bold text-red-300 transition"
        : "px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-bold text-emerald-300 transition";

    document.getElementById("adm-chk-da").checked = pay.donationAlerts?.enabled !== false;
    document.getElementById("adm-chk-ym").checked = pay.yoomoney?.enabled !== false;
    document.getElementById("adm-da-url").value = pay.donationAlerts?.url || "";
    document.getElementById("adm-da-instr").value = pay.donationAlerts?.instruction || "";
}

function togglePaymentsGlobal() {
    sendWs({ type: "update_payments", token: adminToken, data: { ...state.payments, enabled: state.payments?.enabled === false } });
}

function togglePaymentMethod(methodKey, checked) {
    sendWs({
        type: "update_payments",
        token: adminToken,
        data: {
            ...state.payments,
            [methodKey]: { ...(state.payments?.[methodKey] || {}), enabled: checked }
        }
    });
}

function toggleDaSettings() {
    document.getElementById("adm-da-settings").classList.toggle("hidden");
}

function saveDaSettings() {
    sendWs({
        type: "update_payments",
        token: adminToken,
        data: {
            ...state.payments,
            donationAlerts: {
                ...(state.payments?.donationAlerts || {}),
                url: document.getElementById("adm-da-url").value.trim(),
                instruction: document.getElementById("adm-da-instr").value.trim()
            }
        }
    });
}

// --- 7. История ---
function populateHistoryProductFilter() {
    const sel = document.getElementById("hist-filter-product");
    const current = sel.value;
    const names = new Set();
    (state.products || []).forEach(p => { if (p.name) names.add(p.name); });
    (state.orders || []).forEach(o => { if (o.productName) names.add(o.productName); });

    sel.innerHTML = `<option value="">Все товары</option>` +
        Array.from(names).sort().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    if (current && names.has(current)) sel.value = current;
}

function resetHistoryFilters() {
    document.getElementById("hist-filter-nick").value = "";
    document.getElementById("hist-filter-product").value = "";
    document.getElementById("hist-filter-status").value = "";
    document.getElementById("hist-filter-date").value = "";
    document.getElementById("hist-filter-method").value = "";
    renderAdminOrders();
}

function renderOrderRowHtml(o, compact = false) {
    const statusMap = {
        pending: { text: "Ожидает", cls: "bg-amber-500/15 text-amber-300" },
        approved: { text: "Одобрено", cls: "bg-emerald-500/15 text-emerald-300" },
        rejected: { text: "Отклонено", cls: "bg-red-500/15 text-red-300" }
    };
    const st = statusMap[o.status] || statusMap.pending;
    const isDaPending = o.method === "donationalerts" && o.status === "pending";
    const methodLabel = o.method === "donationalerts" ? "DonationAlerts" : (o.method === "yoomoney" ? "YooMoney" : o.method);

    const hasCommands = Array.isArray(o.commands) && o.commands.length > 0;
    const deliveryBadge = o.status === "approved"
        ? (o.delivered
            ? `<span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">Выдано</span>`
            : `<span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purplesoft/15 border border-purplesoft/30 text-purplesoft">Ожидает сервер</span>`)
        : "";

    return `
        <div class="flex flex-wrap items-center justify-between gap-3 ${compact ? "p-3 rounded-xl bg-card border border-soft" : "p-4 rounded-xl bg-bg border border-soft"}">
            <div>
                <div class="flex items-center gap-2 flex-wrap">
                    ${compact ? "" : `<span class="text-sm font-bold">${esc(o.nickname)}</span>`}
                    <span class="text-sm font-bold text-pinksoft">${o.amount} ₽</span>
                    <span class="text-sm text-white">• ${esc(o.productName)}</span>
                    <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${st.cls}">${st.text}</span>
                    ${deliveryBadge}
                </div>
                <div class="text-xs text-[#b8aec8] mt-1">
                    Метод: ${esc(methodLabel)}
                    ${o.promocode ? ` • Купон: ${esc(o.promocode)}` : ""}
                    • ${esc(o.createdAt || "")}
                </div>
            </div>
            <div class="flex items-center gap-2">
                ${isDaPending ? `
                    <button type="button" onclick="setOrderStatus('${esc(o.id)}','approved')" title="Принять оплату и выдать товар"
                        class="w-8 h-8 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-sm transition">✓</button>
                    <button type="button" onclick="setOrderStatus('${esc(o.id)}','rejected')" title="Отклонить оплату"
                        class="w-8 h-8 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-300 font-bold text-sm transition">✕</button>
                ` : ""}
                ${(o.status === "approved" && !o.delivered && hasCommands) ? `
                    <button type="button" onclick="retryOrderDelivery('${esc(o.id)}')" title="Повторить выдачу на сервер"
                        class="w-8 h-8 rounded-lg bg-purplesoft/15 hover:bg-purplesoft/25 border border-purplesoft/40 text-purplesoft font-bold text-sm transition">↻</button>
                ` : ""}
                <button type="button" onclick="deleteOrder('${esc(o.id)}')" title="Удалить запись"
                    class="w-8 h-8 rounded-lg bg-card2 border border-soft hover:border-pinksoft/40 text-[#b8aec8] hover:text-white text-xs transition">🗑</button>
            </div>
        </div>`;
}

function renderAdminOrders() {
    const wrap = document.getElementById("adm-orders-list");
    const allOrders = state.orders || [];

    const fNick = document.getElementById("hist-filter-nick").value.trim().toLowerCase();
    const fProd = document.getElementById("hist-filter-product").value;
    const fStatus = document.getElementById("hist-filter-status").value;
    const fDate = document.getElementById("hist-filter-date").value;
    const fMethod = document.getElementById("hist-filter-method").value;

    const filtered = allOrders.filter(o => {
        if (fNick && !String(o.nickname || "").toLowerCase().includes(fNick)) return false;
        if (fProd && o.productName !== fProd) return false;
        if (fStatus && o.status !== fStatus) return false;
        if (fMethod && String(o.method || "").toLowerCase() !== fMethod) return false;
        if (fDate && extractIsoDate(o) !== fDate) return false;
        return true;
    });

    document.getElementById("hist-counter").textContent = `Показано: ${filtered.length} из ${allOrders.length}`;

    if (!filtered.length) {
        wrap.innerHTML = `<div class="text-xs text-[#b8aec8] py-4 text-center">Записей по заданным фильтрам нет.</div>`;
        return;
    }

    const pendingByNick = new Map();
    filtered.forEach(o => {
        if (o.status === "pending") {
            const key = String(o.nickname || "").trim().toLowerCase();
            if (!pendingByNick.has(key)) pendingByNick.set(key, []);
            pendingByNick.get(key).push(o);
        }
    });

    const renderedGroups = new Set();
    const htmlParts = [];

    filtered.forEach(o => {
        if (o.status === "pending") {
            const key = String(o.nickname || "").trim().toLowerCase();
            const group = pendingByNick.get(key) || [];
            if (group.length >= 2) {
                if (renderedGroups.has(key)) return;
                renderedGroups.add(key);

                const totalSum = roundMoney(group.reduce((acc, x) => acc + (Number(x.amount) || 0), 0));
                const isOpen = expandedOrderGroups.has(key);
                const daIds = group.filter(x => x.method === "donationalerts").map(x => x.id);
                const daIdsJson = esc(JSON.stringify(daIds));

                htmlParts.push(`
                    <div class="rounded-2xl bg-bg border border-amber-500/30 overflow-hidden">
                        <div class="flex flex-wrap items-center justify-between gap-3 p-4 cursor-pointer hover:bg-card2/40 transition"
                            onclick="toggleOrderGroup('${esc(key)}')">
                            <div class="flex items-center gap-3 flex-wrap">
                                <svg class="w-4 h-4 text-pinksoft transition-transform duration-200 ${isOpen ? "rotate-180" : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                    <path d="M6 9l6 6 6-6"/>
                                </svg>
                                <span class="text-sm font-bold">${esc(group[0].nickname)}</span>
                                <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                                    ${group.length} товара в ожидании
                                </span>
                                <span class="text-sm font-extrabold text-pinksoft">Итого: ${totalSum} ₽</span>
                            </div>
                            <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                                ${daIds.length ? `
                                    <button type="button" onclick='setOrdersStatusBatch(${daIdsJson},"approved")'
                                        class="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-bold transition">
                                        ✓ Принять все
                                    </button>
                                    <button type="button" onclick='setOrdersStatusBatch(${daIdsJson},"rejected")'
                                        class="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-300 text-xs font-bold transition">
                                        ✕ Отклонить все
                                    </button>
                                ` : ""}
                            </div>
                        </div>
                        <div class="${isOpen ? "" : "hidden"} px-4 pb-4 pt-1 space-y-2 border-t border-soft bg-bg/60">
                            ${group.map(item => renderOrderRowHtml(item, true)).join("")}
                        </div>
                    </div>
                `);
                return;
            }
        }
        htmlParts.push(renderOrderRowHtml(o, false));
    });

    wrap.innerHTML = htmlParts.join("");
}

function toggleOrderGroup(key) {
    if (expandedOrderGroups.has(key)) expandedOrderGroups.delete(key);
    else expandedOrderGroups.add(key);
    renderAdminOrders();
}

function setOrderStatus(id, status) {
    sendWs({ type: "update_order_status", token: adminToken, data: { id, status } });
}

function setOrdersStatusBatch(ids, status) {
    sendWs({ type: "update_order_status", token: adminToken, data: { ids, status } });
}

function retryOrderDelivery(id) {
    sendWs({ type: "retry_delivery", token: adminToken, data: { id } });
}

function deleteOrder(id) {
    if (!confirm("Удалить запись из истории?")) return;
    sendWs({ type: "delete_order", token: adminToken, data: { id } });
}

function clearAllHistory() {
    if (!(state.orders || []).length) return showToast("История уже пуста", true);
    if (!confirm("Очистить всю историю оплат? Это действие нельзя отменить.")) return;
    expandedOrderGroups.clear();
    sendWs({ type: "clear_orders", token: adminToken });
}

// --- 8. Система ---
function getApiBaseUrl() {
    return WS_URL
        .replace(/^wss:\/\//i, "https://")
        .replace(/^ws:\/\//i, "http://")
        .replace(/\/ws\/?$/i, "");
}

function renderAdminSystem() {
    const sys = state.system || {};
    const autoOn = Boolean(sys.autoOnline);
    const connected = Boolean(sys.pluginConnected);

    const statusBadge = document.getElementById("adm-plugin-status-badge");
    const chk = document.getElementById("adm-sys-auto-online");
    const badge = document.getElementById("adm-auto-online-badge");
    const desc = document.getElementById("adm-auto-online-desc");
    const secInput = document.getElementById("adm-sys-secret");

    if (statusBadge) {
        if (connected) {
            const onlineText = sys.pluginOnline !== null && sys.pluginOnline !== undefined
                ? ` • Онлайн: ${sys.pluginOnline}`
                : "";
            statusBadge.className = "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300";
            statusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Подключён${onlineText}`;
        } else {
            statusBadge.className = "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-300";
            statusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>Не подключён`;
        }
    }

    if (chk) chk.checked = autoOn;
    if (badge) {
        badge.textContent = autoOn ? "Через плагин" : "Из «Основное»";
        badge.className = autoOn
            ? "text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300"
            : "text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-card2 text-[#b8aec8]";
    }
    if (desc) {
        if (autoOn) {
            desc.textContent = connected
                ? `Включено — на сайте отображается реальный онлайн сервера (${sys.pluginOnline ?? 0}).`
                : "Включено — ожидание подключения плагина (пока используется число из «Основное»).";
        } else {
            desc.textContent = "Выключено — отображается число онлайна, указанное вручную во вкладке «Основное».";
        }
    }
    if (secInput && document.activeElement !== secInput) {
        secInput.value = sys.secret || "";
    }
}

async function downloadPlugin() {
    const url = `${getApiBaseUrl()}/api/plugin/download`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            let msg = "Файл BGAuto-1.0.0.jar не найден рядом с server.py";
            try {
                const err = await res.json();
                if (err.detail) msg = err.detail;
            } catch (_) {}
            showToast(msg, true);
            return;
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = "BGAuto-1.0.0.jar";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
        showToast("Загрузка BGAuto-1.0.0.jar началась");
    } catch (e) {
        showToast("Не удалось связаться с сервером для скачивания плагина", true);
    }
}

function toggleAutoOnline(checked) {
    sendWs({
        type: "update_system",
        token: adminToken,
        data: { autoOnline: Boolean(checked) }
    });
}

function generateSystemSecret() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let key = "bg_";
    for (let i = 0; i < bytes.length; i++) {
        key += alphabet[bytes[i] % alphabet.length];
    }
    const input = document.getElementById("adm-sys-secret");
    input.value = key;
    input.focus();
    showToast("Ключ сгенерирован. Нажмите «Сохранить»");
}

function saveSystemSecret() {
    const secret = document.getElementById("adm-sys-secret").value.trim();
    if (!secret) return showToast("Введите или сгенерируйте Secret-ключ", true);
    sendWs({
        type: "update_system",
        token: adminToken,
        data: { secret }
    });
}

// ================= СТАРТ =================
updateRoute();

connectWs();

