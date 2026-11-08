"use strict";
// Royal Hairdresser - Smart Salon Manager (frontend, vanilla JS)

const T = {
  en: {
    subtitle: "Smart Salon Manager", date: "Date", book: "Book an appointment", name: "Customer name", phone: "Mobile number",
    phoneOpt: "Mobile number (optional)", services: "Services", stylist: "Stylist", when: "Date and time", bookBtn: "Book",
    walkin: "Walk-in queue", addQueue: "Add to queue", today: "Appointments and queue", regulars: "Regular customers",
    demo: "Sample services and prices. Edit seed.json to match the salon's price list.",
    sRevenue: "Revenue (BDT)", sDone: "Completed", sUpcoming: "Upcoming", sWaiting: "Waiting in queue",
    any: "Any stylist", total: "Total", min: "min", token: "Token", none: "Nothing scheduled for this day.",
    complete: "Complete", cancel: "Cancel", noShow: "No-show", remind: "WhatsApp reminder",
    booked: "Booked", waiting: "Waiting", completed: "Completed", cancelled: "Cancelled", "no-show": "No-show",
    thName: "Name", thPhone: "Phone", thVisits: "Visits", thSpent: "Spent", saved: "Saved.", error: "Could not save: ",
    loginTitle: "Owner login", login: "Owner login", logout: "Log out", username: "Username", password: "Password", loginBtn: "Log in",
    private: "Private system. Please log in as the owner or staff.", readonly: "Demo view with sample data (read-only). Log in as the owner to make changes.",
    loginFail: "Login failed: ", backup: "Download backup",
    loyalty: "Loyalty visit: this will be their milestone visit. Offer the owner's loyalty reward.",
    returning: "Returning customer, visits so far: ",
    msg: (n, t, d) => `Assalamu Alaikum ${n}, this is a reminder of your appointment at Royal Hairdresser on ${d} at ${t}. See you soon!`,
  },
  bn: {
    subtitle: "স্মার্ট সেলুন ম্যানেজার", date: "তারিখ", book: "অ্যাপয়েন্টমেন্ট বুক করুন", name: "গ্রাহকের নাম", phone: "মোবাইল নম্বর",
    phoneOpt: "মোবাইল নম্বর (ঐচ্ছিক)", services: "সেবা", stylist: "স্টাইলিস্ট", when: "তারিখ ও সময়", bookBtn: "বুক করুন",
    walkin: "ওয়াক-ইন সিরিয়াল", addQueue: "সিরিয়ালে যোগ করুন", today: "অ্যাপয়েন্টমেন্ট ও সিরিয়াল", regulars: "নিয়মিত গ্রাহক",
    demo: "নমুনা সেবা ও দাম। সেলুনের আসল দামের তালিকা অনুযায়ী seed.json বদলে নিন।",
    sRevenue: "আয় (টাকা)", sDone: "সম্পন্ন", sUpcoming: "আসন্ন", sWaiting: "সিরিয়ালে অপেক্ষমাণ",
    any: "যেকোনো স্টাইলিস্ট", total: "মোট", min: "মিনিট", token: "টোকেন", none: "এই দিনে কিছু নেই।",
    complete: "সম্পন্ন", cancel: "বাতিল", noShow: "আসেননি", remind: "হোয়াটসঅ্যাপ রিমাইন্ডার",
    booked: "বুকড", waiting: "অপেক্ষায়", completed: "সম্পন্ন", cancelled: "বাতিল", "no-show": "আসেননি",
    thName: "নাম", thPhone: "ফোন", thVisits: "ভিজিট", thSpent: "খরচ", saved: "সংরক্ষিত হয়েছে।", error: "সংরক্ষণ করা যায়নি: ",
    loginTitle: "মালিকের লগইন", login: "মালিকের লগইন", logout: "লগআউট", username: "ইউজারনেম", password: "পাসওয়ার্ড", loginBtn: "লগইন",
    private: "এটি ব্যক্তিগত সিস্টেম। মালিক বা স্টাফ হিসেবে লগইন করুন।", readonly: "নমুনা তথ্যসহ ডেমো দেখা (শুধু পড়া)। পরিবর্তনের জন্য মালিক হিসেবে লগইন করুন।",
    loginFail: "লগইন ব্যর্থ: ", backup: "ব্যাকআপ ডাউনলোড",
    loyalty: "লয়্যালটি ভিজিট: এটি তাদের মাইলফলক ভিজিট। মালিকের নির্ধারিত পুরস্কার দিন।",
    returning: "পুরনো গ্রাহক, এ পর্যন্ত ভিজিট: ",
    msg: (n, t, d) => `আসসালামু আলাইকুম ${n}, ${d} তারিখে ${t} টায় রয়্যাল হেয়ারড্রেসারে আপনার অ্যাপয়েন্টমেন্টের রিমাইন্ডার। দেখা হবে!`,
  },
};

let lang = "en", state = null;
let me = { loggedIn: false, csrf: null, publicDemo: false };
const picked = { chips: new Set(), chips2: new Set() };
const $ = (s) => document.querySelector(s);
const t = (k) => T[lang][k];
const pad = (n) => String(n).padStart(2, "0");
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localStamp = (d = new Date()) => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmt = (n) => Number(n).toLocaleString(lang === "bn" ? "bn-BD" : "en-US");

function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
const svcName = (s) => (lang === "bn" ? s.bn : s.name);

// ---------- rendering ----------
function renderStats() {
  const s = state.summary;
  const items = [[fmt(s.revenue), t("sRevenue")], [s.completed, t("sDone")], [s.upcoming, t("sUpcoming")], [s.waiting, t("sWaiting")]];
  $("#stats").replaceChildren(...items.map(([n, label]) => {
    const d = el("div", { class: "stat" });
    d.append(el("b", {}, String(n)), el("span", {}, label));
    return d;
  }));
}

function renderChips(boxId) {
  $("#" + boxId).replaceChildren(...state.services.map((s) => {
    const b = el("button", { type: "button", class: "chip" + (picked[boxId].has(s.id) ? " on" : "") }, `${svcName(s)} · ${s.price}`);
    b.onclick = () => { picked[boxId].has(s.id) ? picked[boxId].delete(s.id) : picked[boxId].add(s.id); renderChips(boxId); renderTotal(); };
    return b;
  }));
}

function renderTotal() {
  const list = state.services.filter((s) => picked.chips.has(s.id));
  const price = list.reduce((n, s) => n + s.price, 0), mins = list.reduce((n, s) => n + s.minutes, 0);
  $("#total").textContent = list.length ? `${t("total")}: ${fmt(price)} BDT · ${mins} ${t("min")}` : "";
}

function renderStylists() {
  const sel = $("#stylist"), keep = sel.value;
  sel.replaceChildren(el("option", { value: "Any" }, t("any")), ...state.stylists.map((n) => el("option", { value: n }, n)));
  if (keep) sel.value = keep;
}

function renderList() {
  const box = $("#list");
  if (!state.appointments.length) { box.replaceChildren(el("p", { class: "muted" }, t("none"))); return; }
  box.replaceChildren(...state.appointments.map((a) => {
    const card = el("div", { class: "appt" + (["completed", "cancelled", "no-show"].includes(a.status) ? " done" : "") });
    const top = el("div", { class: "top" });
    top.append(el("span", { class: "time" }, a.type === "walkin" ? `${t("token")} #${a.token}` : `${a.start.slice(11)} - ${a.end.slice(11)}`),
               el("span", { class: "tag " + a.status }, t(a.status)));
    card.append(top, el("div", {}, `${a.customerName}${a.phone ? " · " + a.phone : ""}`),
                el("div", { class: "meta" }, `${a.serviceNames.join(", ")} · ${a.stylist === "Any" ? t("any") : a.stylist} · ${fmt(a.total)} BDT`));
    if (me.loggedIn && (a.status === "booked" || a.status === "waiting")) {
      const act = el("div", { class: "actions" });
      const done = el("button", { type: "button", class: "go" }, t("complete")); done.onclick = () => setStatus(a.id, "completed");
      const cancel = el("button", { type: "button" }, t("cancel")); cancel.onclick = () => setStatus(a.id, "cancelled");
      act.append(done, cancel);
      if (a.type === "booked") {
        const ns = el("button", { type: "button" }, t("noShow")); ns.onclick = () => setStatus(a.id, "no-show");
        const wa = el("a", { target: "_blank", rel: "noopener", href: `https://wa.me/88${a.phone}?text=${encodeURIComponent(T[lang].msg(a.customerName, a.start.slice(11), a.start.slice(0, 10)))}` }, t("remind"));
        act.append(ns, wa);
      }
      card.append(act);
    }
    return card;
  }));
}

function renderCustomers() {
  const head = el("tr");
  ["thName", "thPhone", "thVisits", "thSpent"].forEach((k) => head.append(el("th", {}, t(k))));
  const rows = state.customers.map((c) => {
    const tr = el("tr");
    [c.name, c.phone, String(c.visits), fmt(c.totalSpent)].forEach((v) => tr.append(el("td", {}, v)));
    return tr;
  });
  $("#customers").replaceChildren(head, ...rows);
}

function applyLang() {
  document.body.dataset.lang = lang;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((n) => (n.textContent = t(n.dataset.i18n)));
  $("#lang").textContent = lang === "en" ? "বাংলা" : "English";
  renderAuth();
  if (state) renderAll();
}
function renderAll() { renderStats(); renderChips("chips"); renderChips("chips2"); renderTotal(); renderStylists(); renderList(); renderCustomers(); }

// ---------- API ----------
async function refresh() {
  const res = await fetch("/api/state?date=" + $("#date").value);
  if (!res.ok) { state = null; return; }
  state = await res.json();
  renderAll();
}
async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": me.csrf || "" }, body: JSON.stringify(body) });
  const data = await res.json();
  $("#msg").textContent = res.ok ? t("saved") : t("error") + data.error;
  if (res.status === 401 || res.status === 403) await loadMe();
  if (res.ok) await refresh();
  return res.ok;
}
const setStatus = (id, status) => post(`/api/appointments/${id}/status`, { status });

$("#lang").onclick = () => { lang = lang === "en" ? "bn" : "en"; applyLang(); };
$("#date").onchange = refresh;

$("#phone").onchange = async (e) => {
  const box = $("#loyalty");
  box.hidden = true;
  const res = await fetch("/api/customer?phone=" + encodeURIComponent(e.target.value));
  if (!res.ok) return;
  const d = await res.json();
  if (d.customer) { box.textContent = d.loyaltyDue ? t("loyalty") : t("returning") + d.customer.visits; box.hidden = false; }
};

$("#bookForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (await post("/api/appointments", { ...f, serviceIds: [...picked.chips] })) { picked.chips.clear(); e.target.reset(); $("#start").value = localStamp(); renderAll(); }
};
$("#walkForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (await post("/api/walkins", { ...f, serviceIds: [...picked.chips2], start: localStamp() })) { picked.chips2.clear(); e.target.reset(); renderAll(); }
};

$("#date").value = localDate();
$("#start").value = localStamp();
// ---------- owner login ----------
function renderAuth() {
  const visible = me.loggedIn || me.publicDemo;
  $("#authBtn").textContent = me.loggedIn ? t("logout") : t("login");
  $("#main").hidden = !visible;
  $("#private").hidden = visible;
  $("#readonly").hidden = !(me.publicDemo && !me.loggedIn);
  $("#bookForm").hidden = !me.loggedIn;
  $("#walkForm").hidden = !me.loggedIn;
  $("#backup").hidden = !me.loggedIn;
  if (state) renderList();
}
async function loadMe() {
  me = await (await fetch("/api/me")).json();
  renderAuth();
  await refresh();
}

$("#authBtn").onclick = async () => {
  if (me.loggedIn) { await fetch("/api/logout", { method: "POST" }); await loadMe(); return; }
  $("#loginCard").hidden = !$("#loginCard").hidden;
};
$("#loginCard").onsubmit = async (e) => {
  e.preventDefault();
  const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
  const data = await res.json();
  if (!res.ok) { $("#loginMsg").textContent = t("loginFail") + data.error; return; }
  e.target.reset(); $("#loginMsg").textContent = ""; $("#loginCard").hidden = true;
  await loadMe();
};
$("#backup").onclick = async () => {
  const res = await fetch("/api/export");
  if (!res.ok) { await loadMe(); return; }
  el("a", { href: URL.createObjectURL(await res.blob()), download: "salon-backup.json" }).click();
};

applyLang();
loadMe();
