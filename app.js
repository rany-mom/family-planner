/* Family Planner – a small phone-friendly app on top of the
   "Family Planner 2027" Google Sheet. No build step, no libraries. */
(() => {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const DEMO = !CFG.API_URL || new URLSearchParams(location.search).has("demo");
  const PIN_KEY = "familyPlannerPin";
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  const state = {
    pin: null,
    data: null,
    tab: "home",
    year: 0,
    month: 0,        // 0-11
    selectedDay: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

  // ---------- dates & money ----------
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
  const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const inMonth = (s) => typeof s === "string" && s.startsWith(`${state.year}-${pad(state.month + 1)}-`);
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  const shortDate = (s) => { const d = parseIso(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
  const weekday = (s) => DOW[(parseIso(s).getDay() + 6) % 7];

  const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd0 = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
  const toUsd = (amount, currency) => {
    const a = Number(amount) || 0;
    return currency === "KHR" ? a / (state.data.khrPerUsd || 4000) : a;
  };
  const original = (amount, currency) => currency === "KHR"
    ? `${Math.round(Number(amount)).toLocaleString("en-US")} ៛`
    : usd(Number(amount) || 0);

  const catClass = (c) => {
    const s = String(c || "").toLowerCase();
    if (s.includes("birthday")) return "cat-birthday";
    if (/icf|church|pastor|worship/.test(s)) return "cat-church";
    if (/travel|trip|fly|flight/.test(s)) return "cat-travel";
    if (s.includes("family")) return "cat-family";
    if (s.includes("work")) return "cat-work";
    return "cat-other";
  };

  // ---------- API ----------
  async function api(action, data) {
    if (DEMO) return demoApi(action, data);
    const res = await fetch(CFG.API_URL, {
      method: "POST",
      // text/plain avoids a CORS pre-flight request, which Apps Script cannot answer.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ pin: state.pin, action, data }),
    });
    if (!res.ok) throw new Error("Network error " + res.status);
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "Something went wrong");
    return out;
  }

  async function loadAll() {
    $("#view").innerHTML = `<div class="loading">Loading…</div>`;
    const out = await api("getAll");
    state.data = out.data;
    render();
  }

  // ---------- login ----------
  function showLogin(message) {
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#loginError").hidden = !message;
    $("#loginError").textContent = message || "";
    $("#pinInput").value = "";
    $("#pinInput").focus();
  }

  async function tryStart(pin, remember) {
    state.pin = pin;
    try {
      const out = await api("getAll");
      state.data = out.data;
      if (remember) { try { localStorage.setItem(PIN_KEY, pin); } catch (_) {} }
      $("#login").hidden = true;
      $("#app").hidden = false;
      render();
    } catch (err) {
      try { localStorage.removeItem(PIN_KEY); } catch (_) {}
      showLogin(err.message === "Wrong PIN" ? "That PIN is not right. Try again." : err.message);
    }
  }

  // ---------- rendering ----------
  function render() {
    $("#monthLabel").textContent = `${MONTHS[state.month]} ${state.year}`;
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === state.tab));
    $("#fab").hidden = state.tab === "budget";
    const views = { home: viewHome, calendar: viewCalendar, spending: viewSpending, income: viewIncome, budget: viewBudget };
    $("#view").innerHTML = views[state.tab]();
    window.scrollTo(0, 0);
  }

  function monthTotals() {
    const d = state.data;
    const spent = d.spending.filter(s => inMonth(s.date)).reduce((t, s) => t + toUsd(s.amount, s.currency), 0);
    const income = d.income.filter(s => inMonth(s.date)).reduce((t, s) => t + toUsd(s.amount, s.currency), 0);
    const budget = d.budget.reduce((t, b) => t + b.monthly, 0);
    return { spent, income, budget, left: budget - spent };
  }

  function barHtml(used, total) {
    const pct = total > 0 ? Math.min(100, (used / total) * 100) : (used > 0 ? 100 : 0);
    const cls = total > 0 && used > total ? "over" : (total > 0 && used / total >= 0.8 ? "warn" : "");
    return `<div class="bar"><i class="${cls}" style="width:${pct.toFixed(1)}%"></i></div>`;
  }

  function viewHome() {
    const t = monthTotals();
    const today = todayIso();
    const until = new Date(); until.setDate(until.getDate() + 21);
    const untilIso = iso(until.getFullYear(), until.getMonth(), until.getDate());
    const upcoming = [
      ...state.data.holidays.map(h => ({ date: h.date, text: h.name, holiday: true })),
      ...state.data.plans.map(p => ({ date: p.date, text: p.plan, category: p.category, who: p.who })),
    ].filter(e => e.date >= today && e.date <= untilIso).sort((a, b) => a.date.localeCompare(b.date));
    const recent = state.data.spending.filter(s => inMonth(s.date))
      .sort((a, b) => b.date.localeCompare(a.date) || b.row - a.row).slice(0, 5);

    return `
      <div class="kpis">
        <div class="kpi"><div class="label">Budget</div><div class="value">${usd0(t.budget)}</div></div>
        <div class="kpi"><div class="label">Spent</div><div class="value">${usd0(t.spent)}</div></div>
        <div class="kpi"><div class="label">Left</div><div class="value ${t.left < 0 ? "neg" : ""}">${usd0(t.left)}</div></div>
      </div>
      <div class="card">
        <h2>${MONTHS[state.month]} budget used</h2>
        ${barHtml(t.spent, t.budget)}
        <div class="hint">${t.budget ? Math.round((t.spent / t.budget) * 100) : 0}% used · income received ${usd0(t.income)} of ${usd0(state.data.expectedIncome)} expected</div>
      </div>
      <div class="card">
        <h2>Coming up (next 3 weeks)</h2>
        ${upcoming.length ? upcoming.map(e => `
          <div class="row">
            <div class="datebox ${e.holiday ? "holiday" : ""}"><b>${parseIso(e.date).getDate()}</b><span>${weekday(e.date)}</span></div>
            <div class="main"><div class="name">${esc(e.text)}</div>
              <div class="sub">${e.holiday ? "Public holiday" : esc([e.category, e.who].filter(Boolean).join(" · "))}</div></div>
          </div>`).join("") : `<div class="empty">Nothing planned in the next 3 weeks.</div>`}
      </div>
      <div class="card">
        <h2>Latest spending</h2>
        ${recent.length ? recent.map(spendRow).join("") : `<div class="empty">No spending added this month yet.</div>`}
      </div>`;
  }

  function viewCalendar() {
    const y = state.year, m = state.month;
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7;         // Monday first
    const total = Math.ceil((lead + daysIn(y, m)) / 7) * 7;
    const holidays = new Map(state.data.holidays.map(h => [h.date, h.name]));
    const today = todayIso();
    let cells = DOW.map(d => `<div class="dow">${d}</div>`).join("");

    for (let i = 0; i < total; i++) {
      const date = new Date(y, m, 1 - lead + i);
      const s = iso(date.getFullYear(), date.getMonth(), date.getDate());
      const out = date.getMonth() !== m;
      const plans = state.data.plans.filter(p => p.date === s);
      const hol = holidays.get(s);
      const cls = ["day", out && "out", !out && (date.getDay() === 0 || date.getDay() === 6) && "weekend",
        !out && hol && "holiday", s === today && "today", s === state.selectedDay && "selected"].filter(Boolean).join(" ");
      const labels = out ? "" : [
        hol ? `<span class="lbl h">${esc(hol)}</span>` : "",
        ...plans.slice(0, 2).map(p => `<span class="lbl ${catClass(p.category)}">${esc(p.plan)}</span>`),
        plans.length > 2 ? `<span class="lbl">+${plans.length - 2} more</span>` : "",
      ].join("");
      cells += `<button class="${cls}" data-day="${s}" ${out ? "disabled" : ""}><span class="num">${date.getDate()}</span>${labels}</button>`;
    }
    return `
      <div class="card">
        <div class="cal">${cells}</div>
        <div class="legend">
          <span style="background:var(--red);color:#fff">Public holiday</span>
          <span class="cat-birthday">Birthday</span><span class="cat-church">ICF / Church</span>
          <span class="cat-travel">Travel</span><span class="cat-family">Family</span>
        </div>
      </div>
      <p class="hint" style="text-align:center">Tap a day to see or add plans.</p>`;
  }

  function spendRow(s) {
    return `
      <div class="row">
        <div class="datebox"><b>${parseIso(s.date).getDate()}</b><span>${weekday(s.date)}</span></div>
        <div class="main"><div class="name">${esc(s.item)}</div>
          <div class="sub">${esc([s.category, s.paidBy].filter(Boolean).join(" · "))}${s.note ? " · " + esc(s.note) : ""}</div></div>
        <div class="amt">${usd(toUsd(s.amount, s.currency))}${s.currency === "KHR" ? `<small>${original(s.amount, s.currency)}</small>` : ""}</div>
        <button class="del" data-del="Spending" data-row="${s.row}" aria-label="Delete">✕</button>
      </div>`;
  }

  function viewSpending() {
    const list = state.data.spending.filter(s => inMonth(s.date)).sort((a, b) => b.date.localeCompare(a.date) || b.row - a.row);
    const total = list.reduce((t, s) => t + toUsd(s.amount, s.currency), 0);
    return `
      <div class="card">
        <h2>Spending in ${MONTHS[state.month]}</h2>
        ${list.length ? list.map(spendRow).join("") + `<div class="total-line"><span>Total</span><span>${usd(total)}</span></div>`
          : `<div class="empty">No spending yet. Tap + to add one.</div>`}
      </div>`;
  }

  function viewIncome() {
    const list = state.data.income.filter(s => inMonth(s.date)).sort((a, b) => b.date.localeCompare(a.date));
    const total = list.reduce((t, s) => t + toUsd(s.amount, s.currency), 0);
    return `
      <div class="card">
        <h2>Income in ${MONTHS[state.month]}</h2>
        ${list.length ? list.map(s => `
          <div class="row">
            <div class="datebox"><b>${parseIso(s.date).getDate()}</b><span>${weekday(s.date)}</span></div>
            <div class="main"><div class="name">${esc(s.who)}</div><div class="sub">${esc(s.note || "")}</div></div>
            <div class="amt" style="color:var(--green)">${usd(toUsd(s.amount, s.currency))}${s.currency === "KHR" ? `<small>${original(s.amount, s.currency)}</small>` : ""}</div>
            <button class="del" data-del="Income" data-row="${s.row}" aria-label="Delete">✕</button>
          </div>`).join("") + `<div class="total-line"><span>Total</span><span>${usd(total)}</span></div>`
          : `<div class="empty">No income added yet. Tap + to add a salary.</div>`}
        <div class="hint">Expected each month: ${usd0(state.data.expectedIncome)}</div>
      </div>`;
  }

  function viewBudget() {
    const spentBy = {};
    state.data.spending.filter(s => inMonth(s.date)).forEach(s => {
      spentBy[s.category] = (spentBy[s.category] || 0) + toUsd(s.amount, s.currency);
    });
    const groups = [];
    state.data.budget.forEach(b => {
      let g = groups.find(x => x.name === b.group);
      if (!g) groups.push(g = { name: b.group, items: [] });
      g.items.push(b);
    });
    const known = new Set(state.data.budget.map(b => b.category));
    const other = Object.entries(spentBy).filter(([c]) => !known.has(c)).reduce((t, [, v]) => t + v, 0);

    return groups.map(g => `
      <div class="card">
        <h2>${esc(g.name)}</h2>
        ${g.items.map(b => {
          const spent = spentBy[b.category] || 0;
          return `<div style="margin:10px 0">
            <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px">
              <span>${esc(b.category)}</span>
              <span class="${spent > b.monthly ? "error" : "muted"}">${usd0(spent)} / ${usd0(b.monthly)}</span>
            </div>${barHtml(spent, b.monthly)}</div>`;
        }).join("")}
      </div>`).join("") +
      (other > 0 ? `<div class="card"><h2>Other (not in budget)</h2><div class="muted">${usd(other)}</div></div>` : "") +
      `<p class="hint" style="text-align:center">Change budget amounts in the Budget tab of your Google Sheet.</p>`;
  }

  // ---------- bottom sheet ----------
  function openSheet(html) {
    $("#sheet").innerHTML = `<div class="grab"></div>${html}`;
    $("#sheet").hidden = false;
    $("#sheetBackdrop").hidden = false;
  }
  function closeSheet() {
    $("#sheet").hidden = true;
    $("#sheetBackdrop").hidden = true;
  }

  function options(list, selected) {
    return list.map(v => `<option ${v === selected ? "selected" : ""}>${esc(v)}</option>`).join("");
  }
  function defaultDate() {
    const t = new Date();
    return (t.getFullYear() === state.year && t.getMonth() === state.month) ? todayIso() : iso(state.year, state.month, 1);
  }

  function formSpending() {
    const cats = state.data.budget.map(b => b.category);
    openSheet(`
      <h3>Add spending</h3>
      <form id="form" data-kind="addSpending">
        <div class="field"><label>What did you buy?</label><input name="item" required maxlength="120" placeholder="e.g. Market food"></div>
        <div class="two">
          <div class="field"><label>Amount</label><input name="amount" required inputmode="decimal" placeholder="0"></div>
          <div class="field"><label>Currency</label>
            <div class="seg" data-seg="currency"><button type="button" class="on" data-v="USD">USD $</button><button type="button" data-v="KHR">KHR ៛</button></div>
            <input type="hidden" name="currency" value="USD"></div>
        </div>
        <div class="field"><label>Category</label><select name="category">${options([...cats, "Other"], cats.includes("Food") ? "Food" : cats[0])}</select></div>
        <div class="two">
          <div class="field"><label>Date</label><input type="date" name="date" value="${defaultDate()}" required></div>
          <div class="field"><label>Paid by</label><select name="paidBy">${options(peopleAdults(), "")}</select></div>
        </div>
        <div class="field"><label>Note (optional)</label><input name="note" maxlength="200"></div>
        <div class="actions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn add">Save</button></div>
      </form>`);
  }

  function formIncome() {
    openSheet(`
      <h3>Add income</h3>
      <form id="form" data-kind="addIncome">
        <div class="field"><label>Who</label><select name="who">${options(peopleAdults(), "")}</select></div>
        <div class="two">
          <div class="field"><label>Amount</label><input name="amount" required inputmode="decimal" placeholder="0"></div>
          <div class="field"><label>Currency</label>
            <div class="seg" data-seg="currency"><button type="button" class="on" data-v="USD">USD $</button><button type="button" data-v="KHR">KHR ៛</button></div>
            <input type="hidden" name="currency" value="USD"></div>
        </div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${defaultDate()}" required></div>
        <div class="field"><label>Note (optional)</label><input name="note" maxlength="200" placeholder="e.g. 1st salary"></div>
        <div class="actions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn add">Save</button></div>
      </form>`);
  }

  function formPlan(date) {
    openSheet(`
      <h3>Add plan</h3>
      <form id="form" data-kind="addPlan">
        <div class="field"><label>Plan</label><input name="plan" required maxlength="120" placeholder="e.g. Family trip to Kampot"></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${date || defaultDate()}" required></div>
        <div class="two">
          <div class="field"><label>Category</label><select name="category">${options(state.data.planCategories, "Family")}</select></div>
          <div class="field"><label>Who</label><select name="who">${options(state.data.people, "Family")}</select></div>
        </div>
        <div class="field"><label>Notes (optional)</label><textarea name="notes" maxlength="400"></textarea></div>
        <div class="actions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn add">Save</button></div>
      </form>`);
  }

  function peopleAdults() {
    const p = state.data.people.filter(x => x !== "Anna" && x !== "Family");
    return p.length ? p : ["Rany", "Sombo"];
  }

  function dayDetails(date) {
    const hol = state.data.holidays.find(h => h.date === date);
    const plans = state.data.plans.filter(p => p.date === date);
    const d = parseIso(date);
    openSheet(`
      <h3>${weekday(date)} ${d.getDate()} ${MONTHS[d.getMonth()]}</h3>
      ${hol ? `<div class="row"><div class="datebox holiday"><b>${d.getDate()}</b><span>${weekday(date)}</span></div><div class="main"><div class="name">${esc(hol.name)}</div><div class="sub">Public holiday</div></div></div>` : ""}
      ${plans.map(p => `
        <div class="row">
          <span class="chip ${catClass(p.category)}">${esc(p.category || "Plan")}</span>
          <div class="main"><div class="name">${esc(p.plan)}</div><div class="sub">${esc([p.who, p.notes].filter(Boolean).join(" · "))}</div></div>
          <button class="del" data-del="Plans" data-row="${p.row}" aria-label="Delete">✕</button>
        </div>`).join("")}
      ${!hol && !plans.length ? `<div class="empty">Nothing on this day yet.</div>` : ""}
      <div class="actions"><button class="btn ghost" data-close>Close</button><button class="btn add" data-addplan="${date}">Add plan</button></div>`);
  }

  // ---------- actions ----------
  async function submitForm(form) {
    const kind = form.dataset.kind;
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.amount !== undefined) {
      const n = Number(String(data.amount).replace(/,/g, ""));
      if (!(n > 0)) { toast("Please enter an amount above 0."); return; }
      data.amount = n;
    }
    if (data.category === "Other") data.category = "";
    const btn = form.querySelector("button.add");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await api(kind, data);
      closeSheet();
      toast("Saved");
      await loadAll();
    } catch (err) {
      btn.disabled = false; btn.textContent = "Save";
      toast(err.message);
    }
  }

  async function deleteItem(sheet, row) {
    const list = { Spending: state.data.spending, Income: state.data.income, Plans: state.data.plans }[sheet];
    const item = list.find(x => x.row === row);
    if (!item) return;
    const text = sheet === "Spending" ? item.item : sheet === "Income" ? item.who : item.plan;
    if (!confirm(`Delete "${text}" from ${sheet}?`)) return;
    try {
      await api("deleteRow", { sheet, row, date: item.date, text });
      closeSheet();
      toast("Deleted");
      await loadAll();
    } catch (err) { toast(err.message); }
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- events ----------
  function bind() {
    $("#loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      tryStart($("#pinInput").value.trim(), $("#rememberPin").checked);
    });

    document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
      state.tab = b.dataset.tab; state.selectedDay = null; render();
    }));
    $("#prevMonth").addEventListener("click", () => shiftMonth(-1));
    $("#nextMonth").addEventListener("click", () => shiftMonth(1));
    $("#refreshBtn").addEventListener("click", () => loadAll().catch(err => toast(err.message)));
    $("#fab").addEventListener("click", () => {
      if (state.tab === "income") formIncome();
      else if (state.tab === "calendar") formPlan(state.selectedDay);
      else formSpending();
    });
    $("#sheetBackdrop").addEventListener("click", closeSheet);

    document.addEventListener("click", (e) => {
      const day = e.target.closest("[data-day]");
      if (day && !day.disabled) { state.selectedDay = day.dataset.day; render(); dayDetails(day.dataset.day); return; }
      const del = e.target.closest("[data-del]");
      if (del) { deleteItem(del.dataset.del, Number(del.dataset.row)); return; }
      if (e.target.closest("[data-close]")) { closeSheet(); return; }
      const addPlan = e.target.closest("[data-addplan]");
      if (addPlan) { formPlan(addPlan.dataset.addplan); return; }
      const segBtn = e.target.closest(".seg button");
      if (segBtn) {
        const seg = segBtn.parentElement;
        seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === segBtn));
        seg.parentElement.querySelector(`input[name="${seg.dataset.seg}"]`).value = segBtn.dataset.v;
      }
    });
    document.addEventListener("submit", (e) => {
      if (e.target.id === "form") { e.preventDefault(); submitForm(e.target); }
    });
  }

  function shiftMonth(delta) {
    const d = new Date(state.year, state.month + delta, 1);
    state.year = d.getFullYear(); state.month = d.getMonth(); state.selectedDay = null;
    render();
  }

  // ---------- demo data (used only when config.js has no API_URL) ----------
  const demo = {
    plans: [
      { row: 2, date: "2027-05-12", plan: "Anna's Birthday", category: "Birthday", who: "Anna", notes: "" },
      { row: 3, date: "2027-09-23", plan: "Sombo's Birthday", category: "Birthday", who: "Sombo", notes: "" },
      { row: 4, date: "2027-10-07", plan: "Rany's Birthday", category: "Birthday", who: "Rany", notes: "" },
    ],
    spending: [], income: [],
    budget: [
      ["Saving & Offering","Offering",60],["Saving & Offering","House Saving",300],["Saving & Offering","Anna's Saving",15],
      ["Saving & Offering","Emergency Saving",50],["Saving & Offering","Short-term Saving",30],["Monthly Spending","Food",100],
      ["Monthly Spending","Rany Coffee",18],["Monthly Spending","Sombo Green Tea",25],["Monthly Spending","House Supplies",10],
      ["Monthly Spending","Sombo Dental",38],["Monthly Spending","Rent & Electricity",200],["Anna","Milk",20],["Anna","Snacks",10],
      ["Anna","Diapers",24],["Gifts & Weddings","Gift for Mother",50],["Gifts & Weddings","Gift for Father",50],
      ["Travel & Holiday","Switzerland",100],["Travel & Holiday","Family Holiday",50],
    ].map(([group, category, monthly]) => ({ group, category, monthly })),
    expectedIncome: 1150,
    holidays: [["2027-01-01","International New Year"],["2027-01-07","Victory over Genocide Day"],["2027-03-08","International Women's Day"],
      ["2027-04-14","Khmer New Year (day 1)"],["2027-04-15","Khmer New Year (day 2)"],["2027-04-16","Khmer New Year (day 3)"],
      ["2027-05-01","International Labour Day"],["2027-05-14","King's Birthday"],["2027-05-20","Visak Bochea"],["2027-05-24","Royal Ploughing Ceremony"],
      ["2027-06-18","Queen Mother's Birthday"],["2027-09-24","Constitution Day"],["2027-09-29","Pchum Ben (day 1)"],["2027-09-30","Pchum Ben (day 2)"],
      ["2027-10-01","Pchum Ben (day 3)"],["2027-10-15","King Father Commemoration Day"],["2027-10-29","King's Coronation Day"],
      ["2027-11-09","Independence Day"],["2027-11-12","Water Festival (day 1)"],["2027-11-13","Water Festival (day 2)"],
      ["2027-11-14","Water Festival (day 3)"],["2027-12-29","Cambodia Peace Day"]].map(([date, name]) => ({ date, name })),
    khrPerUsd: 4000,
    planCategories: ["Family","ICF / Church","Birthday","Travel","Work","Other"],
    people: ["Rany","Sombo","Anna","Family"],
  };
  let demoRow = 100;
  function demoApi(action, data) {
    const copy = () => JSON.parse(JSON.stringify(demo));
    if (action === "getAll") return Promise.resolve({ ok: true, data: copy() });
    if (action === "addPlan") demo.plans.push({ row: ++demoRow, ...data });
    if (action === "addSpending") demo.spending.push({ row: ++demoRow, ...data });
    if (action === "addIncome") demo.income.push({ row: ++demoRow, ...data });
    if (action === "deleteRow") {
      const key = { Plans: "plans", Spending: "spending", Income: "income" }[data.sheet];
      demo[key] = demo[key].filter(x => x.row !== data.row);
    }
    return Promise.resolve({ ok: true });
  }

  // ---------- start ----------
  function start() {
    const now = new Date();
    // The planner is for 2027: before 2027 open January 2027, otherwise the current month.
    if (now.getFullYear() < 2027) { state.year = 2027; state.month = 0; }
    else { state.year = now.getFullYear(); state.month = now.getMonth(); }
    $("#familyName").textContent = `${CFG.FAMILY_NAME || "Family"} · Planner`;
    $("#demoBanner").hidden = !DEMO;
    bind();

    if (DEMO) { tryStart("demo", false); return; }
    let saved = null;
    try { saved = localStorage.getItem(PIN_KEY); } catch (_) {}
    if (saved) tryStart(saved, true); else showLogin();
  }

  start();
})();
