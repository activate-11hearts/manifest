/* ============ Manifest app ============ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ---------- navigation ---------- */

function showView(name) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  $$(".nav-link").forEach((b) => b.classList.toggle("active", b.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "studio") loadStudio();
}

document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-nav]");
  if (target) showView(target.dataset.nav);
});

/* ---------- payments ---------- */

let CONFIG = {
  currency: "usd",
  session_prices: {},
  stripe_enabled: false,
  paypal_enabled: false,
  stripe_publishable_key: "",
  paypal_client_id: "",
};
const DEMO_MODE = () => !CONFIG.stripe_enabled && !CONFIG.paypal_enabled;

function money(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: (CONFIG.currency || "usd").toUpperCase(), maximumFractionDigits: 0 }).format(n);
}

async function loadConfig() {
  try {
    CONFIG = await (await fetch("/api/config")).json();
  } catch {}
  // price tags on the session offering cards
  $$(".offer-price").forEach((el) => {
    const price = CONFIG.session_prices[el.dataset.offering];
    el.textContent = price ? money(price) : "";
  });
  if (CONFIG.paypal_enabled && !document.getElementById("paypal-sdk")) {
    const s = document.createElement("script");
    s.id = "paypal-sdk";
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONFIG.paypal_client_id)}&currency=${(CONFIG.currency || "usd").toUpperCase()}`;
    document.head.appendChild(s);
  }
}

let checkoutItem = null; // { item, amount }

function openCheckout(item, amount) {
  checkoutItem = { item, amount };
  $("#checkout-item").textContent = item;
  $("#checkout-amount").textContent = money(amount);
  $("#checkout-msg").textContent = "";
  $("#checkout-demo-note").hidden = !DEMO_MODE();
  $("#pay-stripe").hidden = !CONFIG.stripe_enabled;
  $("#pay-demo").hidden = !DEMO_MODE();
  $("#paypal-buttons").innerHTML = "";
  if (CONFIG.paypal_enabled && window.paypal) {
    window.paypal.Buttons({
      createOrder: (data, actions) =>
        actions.order.create({
          purchase_units: [{ description: item.slice(0, 120), amount: { value: String(amount) } }],
        }),
      onApprove: async (data, actions) => {
        const capture = await actions.order.capture();
        const payer = capture?.payer?.email_address || "";
        await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: "paypal", item, amount, payer, ref: capture?.id || data.orderID }),
        });
        closeCheckout();
        showPayBanner(`✦ Thank you — your payment for “${item}” was received.`);
      },
    }).render("#paypal-buttons");
  }
  $("#checkout").hidden = false;
}

function closeCheckout() {
  $("#checkout").hidden = true;
  checkoutItem = null;
}

$("#checkout").addEventListener("click", (e) => {
  if (e.target.id === "checkout" || e.target.closest(".checkout-close")) closeCheckout();
});

$("#pay-stripe").addEventListener("click", async () => {
  if (!checkoutItem) return;
  $("#checkout-msg").textContent = "Opening secure Stripe checkout…";
  try {
    const res = await fetch("/api/checkout/stripe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkoutItem),
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || "failed");
    window.location.href = data.url;
  } catch (err) {
    $("#checkout-msg").textContent = err.message || "Could not start checkout.";
  }
});

$("#pay-demo").addEventListener("click", async () => {
  if (!checkoutItem) return;
  await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "demo", ...checkoutItem }),
  });
  const item = checkoutItem.item;
  closeCheckout();
  showPayBanner(`✦ Demo payment recorded for “${item}”. Add real keys to accept live payments.`);
});

function showPayBanner(text) {
  const banner = $("#pay-banner");
  banner.textContent = text;
  banner.hidden = false;
  setTimeout(() => (banner.hidden = true), 8000);
}

// Handle the return from Stripe checkout.
async function handleStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("payment") === "cancelled") {
    showPayBanner("Your payment was cancelled — no charge was made.");
  }
  const sessionId = params.get("stripe_session");
  if (sessionId) {
    try {
      const res = await (await fetch(`/api/checkout/stripe/verify?session_id=${encodeURIComponent(sessionId)}`)).json();
      if (res.ok) showPayBanner("✦ Thank you — your payment was received.");
    } catch {}
  }
  if (params.get("stripe_session") || params.get("payment")) {
    history.replaceState(null, "", "/");
  }
}

/* ---------- gallery ---------- */

async function loadGallery() {
  const grid = $("#gallery-grid");
  const empty = $("#gallery-empty");
  try {
    const paintings = await (await fetch("/api/paintings")).json();
    empty.hidden = paintings.length > 0;
    grid.innerHTML = paintings
      .map(
        (p) => `
      <figure class="gallery-item" data-url="${p.url}" data-title="${escapeHtml(p.title)}">
        <img src="${p.url}" alt="${escapeHtml(p.title)}" loading="lazy">
        <figcaption>
          <span>${escapeHtml(p.title)}</span>
          ${p.price > 0
            ? `<button class="btn btn-primary btn-small buy-btn" data-buy="Painting: ${escapeHtml(p.title)}" data-price="${p.price}">Buy · ${money(p.price)}</button>`
            : `<a class="inquire" href="mailto:activate@11heartsfrequency.org?subject=${encodeURIComponent('Painting inquiry: ' + p.title)}">email for details</a>`}
        </figcaption>
      </figure>`
      )
      .join("");
  } catch {
    empty.hidden = false;
  }
}

// Buy buttons anywhere (gallery figcaptions, meditation cards)
document.addEventListener("click", (e) => {
  const buy = e.target.closest("[data-buy]");
  if (buy) {
    e.stopPropagation();
    openCheckout(buy.dataset.buy, Number(buy.dataset.price));
  }
});

$("#gallery-grid").addEventListener("click", (e) => {
  if (e.target.closest("[data-buy]")) return;
  const item = e.target.closest(".gallery-item");
  if (!item) return;
  $("#lightbox-img").src = item.dataset.url;
  $("#lightbox-title").textContent = item.dataset.title;
  $("#lightbox").hidden = false;
});

$("#lightbox").addEventListener("click", (e) => {
  if (e.target.id !== "lightbox-img") $("#lightbox").hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("#lightbox").hidden = true;
});

/* ---------- meditations ---------- */

async function loadMeditations() {
  const list = $("#meditation-list");
  const empty = $("#meditations-empty");
  try {
    const tracks = await (await fetch("/api/meditations")).json();
    empty.hidden = tracks.length > 0;
    list.innerHTML = tracks
      .map((t) =>
        t.price > 0
          ? `
      <div class="meditation-item">
        <div class="meditation-head">
          <h3>☾ ${escapeHtml(t.title)}</h3>
          <button class="btn btn-primary btn-small buy-btn" data-buy="Meditation: ${escapeHtml(t.title)}" data-price="${t.price}">Buy · ${money(t.price)}</button>
        </div>
        <p class="delivery-note">Delivered to your email with love after purchase.</p>
      </div>`
          : `
      <div class="meditation-item">
        <div class="meditation-head">
          <h3>☾ ${escapeHtml(t.title)}</h3>
        </div>
        <audio controls preload="none" src="${t.url}"></audio>
      </div>`
      )
      .join("");
  } catch {
    empty.hidden = false;
  }
}

// Pause other tracks when one starts playing.
document.addEventListener(
  "play",
  (e) => {
    if (e.target.tagName !== "AUDIO") return;
    $$("audio").forEach((a) => {
      if (a !== e.target) a.pause();
    });
  },
  true
);

/* ---------- booking form ---------- */

$("#booking-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const msg = $("#booking-msg");
  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error();
    form.reset();
    msg.textContent = "✦ Request received — you'll hear back soon.";
    // Offer payment for the chosen session right away.
    const price = CONFIG.session_prices[data.offering];
    if (price > 0) openCheckout(data.offering, price);
  } catch {
    msg.textContent = "Something went wrong — please try again.";
  }
  setTimeout(() => (msg.textContent = ""), 6000);
});

/* ---------- studio: bookings ---------- */

const STATUS_NEXT = { new: "confirmed", confirmed: "completed", completed: "new" };

// All studio requests carry the practitioner PIN (when one is set).
function studioFetch(url, opts = {}) {
  const pin = localStorage.getItem("studioPin");
  opts = { ...opts, headers: { ...(opts.headers || {}), ...(pin ? { "X-Studio-Pin": pin } : {}) } };
  return fetch(url, opts);
}

async function loadStudio() {
  const probe = await studioFetch("/api/bookings");
  const locked = probe.status === 401;
  $("#studio-lock").hidden = !locked;
  $("#studio-content").hidden = locked;
  if (locked) return;
  renderBookings(await probe.json());
  loadSessions();
  loadOrders();
}

$("#pin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = $("#pin-input").value.trim();
  if (!pin) return;
  localStorage.setItem("studioPin", pin);
  const probe = await studioFetch("/api/bookings");
  if (probe.status === 401) {
    localStorage.removeItem("studioPin");
    $("#pin-msg").textContent = "That PIN doesn't match — try again.";
    return;
  }
  $("#pin-msg").textContent = "";
  $("#pin-input").value = "";
  loadStudio();
});

async function loadOrders() {
  const el = $("#orders-list");
  const orders = await (await studioFetch("/api/orders")).json();
  if (!orders.length) {
    el.innerHTML = `<p class="muted">No payments yet. Completed Stripe, PayPal, and demo payments appear here.</p>`;
    return;
  }
  el.innerHTML = orders
    .map(
      (o) => `
    <div class="booking-item">
      <div class="booking-head">
        <span class="booking-name">${money(o.amount)} — ${escapeHtml(o.item)}</span>
        <span class="status-pill ${o.status === "demo" ? "status-new" : "status-confirmed"}">${o.method}${o.status === "demo" ? " · demo" : ""}</span>
      </div>
      <div class="booking-meta">${o.created}${o.payer ? " · " + escapeHtml(o.payer) : ""}</div>
    </div>`
    )
    .join("");
}

async function loadBookings() {
  renderBookings(await (await studioFetch("/api/bookings")).json());
}

function renderBookings(bookings) {
  const el = $("#bookings-list");
  if (!bookings.length) {
    el.innerHTML = `<p class="muted">No booking requests yet. They'll appear here when a client submits the form.</p>`;
    return;
  }
  el.innerHTML = bookings
    .map(
      (b) => `
    <div class="booking-item">
      <div class="booking-head">
        <span class="booking-name">${escapeHtml(b.name)}</span>
        <span class="status-pill status-${b.status}">${b.status}</span>
      </div>
      <div class="booking-meta">
        ${escapeHtml(b.offering)}${b.mode ? " · " + escapeHtml(b.mode) : ""} · prefers ${escapeHtml(b.preferred || "—")}<br>
        ${escapeHtml(b.email)}${b.phone ? " · " + escapeHtml(b.phone) : ""} · requested ${b.created}
      </div>
      ${b.notes ? `<div class="booking-notes">“${escapeHtml(b.notes)}”</div>` : ""}
      <div class="booking-actions">
        <button class="btn btn-ghost btn-small" data-advance="${b.id}" data-status="${b.status}">
          Mark ${STATUS_NEXT[b.status] || "new"}
        </button>
      </div>
    </div>`
    )
    .join("");
}

$("#bookings-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-advance]");
  if (!btn) return;
  await studioFetch("/api/bookings/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: btn.dataset.advance, status: STATUS_NEXT[btn.dataset.status] || "new" }),
  });
  loadBookings();
});

/* ---------- studio: timer ---------- */

let timerSeconds = 0;
let timerHandle = null;

function renderTimer() {
  const m = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
  const s = String(timerSeconds % 60).padStart(2, "0");
  $("#timer-display").textContent = `${m}:${s}`;
}

$("#timer-start").addEventListener("click", () => {
  if (timerHandle) return;
  timerHandle = setInterval(() => {
    timerSeconds++;
    renderTimer();
  }, 1000);
});

$("#timer-pause").addEventListener("click", () => {
  clearInterval(timerHandle);
  timerHandle = null;
  // Offer the elapsed time to the log form.
  const minutes = Math.round(timerSeconds / 60);
  if (minutes > 0) $("#session-form").elements.minutes.value = minutes;
});

$("#timer-reset").addEventListener("click", () => {
  clearInterval(timerHandle);
  timerHandle = null;
  timerSeconds = 0;
  renderTimer();
});

/* ---------- studio: session journal ---------- */

$("#session-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const msg = $("#session-msg");
  try {
    const res = await studioFetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error();
    form.reset();
    form.elements.date.value = todayISO();
    msg.textContent = "✦ Saved to your journal.";
    loadSessions();
  } catch {
    msg.textContent = "Couldn't save — please try again.";
  }
  setTimeout(() => (msg.textContent = ""), 5000);
});

async function loadSessions() {
  const el = $("#sessions-list");
  const sessions = await (await studioFetch("/api/sessions")).json();
  if (!sessions.length) {
    el.innerHTML = `<p class="muted">Your journal is empty. Log your first Trinfinity8 session above.</p>`;
    return;
  }
  el.innerHTML = sessions
    .map(
      (s) => `
    <div class="session-item">
      <div class="session-head">
        <span class="booking-name">${escapeHtml(s.client || "Session")}</span>
        <span class="session-meta">${s.date}${s.minutes ? " · " + s.minutes + " min" : ""}</span>
      </div>
      <div class="session-meta">
        ${s.program ? escapeHtml(s.program) : ""}
        ${s.feeling ? ` · <span class="feeling-stars">${"✦".repeat(s.feeling)}</span>` : ""}
      </div>
      ${s.notes ? `<div class="session-notes">${escapeHtml(s.notes)}</div>` : ""}
      <button class="delete-link" data-delete="${s.id}">remove</button>
    </div>`
    )
    .join("");
}

$("#sessions-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-delete]");
  if (!btn) return;
  await studioFetch("/api/sessions/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: btn.dataset.delete }),
  });
  loadSessions();
});

/* ---------- helpers & init ---------- */

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

$("#session-form").elements.date.value = todayISO();
renderTimer();
loadConfig().then(() => {
  loadGallery();
  loadMeditations();
  handleStripeReturn();
});
