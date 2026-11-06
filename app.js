import { db } from "./db.js";
import {
  accountBalance, accountFigures, accountName, budgetProgress, debtOutstanding as getDebtOutstanding, escapeHtml, expenseAmount, goalReserved, goalReservedByAccount,
  formatDate, id, money, monthKey, parseDate, tagName, today, transactionInPeriod, transactionMatchesTag, transactionTagIds
} from "./domain.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const root = $("#view-root");
const dialog = $("#app-dialog");
const toast = $("#toast");
const state = {
  view: "home",
  accounts: [],
  transactions: [],
  tags: [],
  budgets: [],
  goals: [],
  debts: [],
  debtEvents: [],
  selectedAccounts: [],
  activityPeriod: "month",
  activityFrom: `${monthKey()}-01`,
  activityTo: today(),
  activityAccount: "all",
  activityTag: "all",
  statsPeriod: "month",
  statsDay: today(),
  statsFrom: `${monthKey()}-01`,
  statsTo: today(),
  statsAccounts: [],
  statsTags: [],
  archivedVisible: false,
  forecastDate: today(),
  pendingConfirmation: null,
  tagReturn: null,
  dateCalendar: null
};

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timeout);
  notify.timeout = setTimeout(() => toast.classList.remove("show"), 2800);
}

function budgetTagLabel(budget) {
  const tagIds = budget.tagIds?.length ? budget.tagIds : (budget.tagId ? [budget.tagId] : []);
  return tagIds.length ? tagIds.map((tagId) => {
    const tag = state.tags.find((entry) => entry.id === tagId);
    const parent = tagParents(tag || {}).map((parentId) => tagName(parentId, state.tags))[0];
    return parent ? `${parent} › ${tag.name}` : tagName(tagId, state.tags);
  }).join(" + ") : "Todas las etiquetas";
}

function dateLabel(date) {
  return formatDate(date) || "Sin fecha";
}

function dateInput(name, value, options = {}) {
  const { id: inputId = "", required = false, min = "" } = options;
  const pickerId = inputId || `date-${name}`;
  const rawValue = String(value || "");
  const displayValue = formatDate(rawValue) || (parseDate(rawValue) ? rawValue : "");
  return `<div class="date-input-group"><input id="${escapeHtml(pickerId)}" name="${escapeHtml(name)}" class="date-input" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" pattern="\\d{2}/\\d{2}/\\d{4}" value="${escapeHtml(displayValue)}" ${required ? "required" : ""} ${min ? `data-min-date="${escapeHtml(formatDate(min))}"` : ""} aria-label="Fecha en formato día/mes/año"><button type="button" class="date-picker-button" data-action="open-date-picker" data-target="${escapeHtml(pickerId)}" aria-label="Abrir calendario">▦</button></div>`;
}

function dateCalendarMarkup(input, monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(firstDay);
  const selected = parseDate(input.value);
  const minimum = parseDate(input.dataset.minDate);
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    if (day < 1 || day > days) return `<span class="date-calendar-empty"></span>`;
    const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const classes = ["date-calendar-day", value === selected ? "selected" : "", value === today() ? "today" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${classes}" data-action="select-calendar-date" data-target="${escapeHtml(input.id)}" data-date="${value}" ${minimum && value < minimum ? "disabled" : ""}>${day}</button>`;
  }).join("");
  return `<div class="date-calendar-head"><button type="button" data-action="shift-calendar" data-target="${escapeHtml(input.id)}" data-offset="-1" aria-label="Mes anterior">‹</button><strong>${escapeHtml(monthName.charAt(0).toLocaleUpperCase("es") + monthName.slice(1))}</strong><button type="button" data-action="shift-calendar" data-target="${escapeHtml(input.id)}" data-offset="1" aria-label="Mes siguiente">›</button></div><div class="date-calendar-weekdays"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="date-calendar-grid">${cells}</div>`;
}

function positionDateCalendar(popup, anchor) {
  const bounds = anchor.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - 24);
  const height = popup.offsetHeight;
  const left = Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12));
  const below = bounds.bottom + 8;
  const top = below + height <= window.innerHeight - 12 || bounds.top < height + 20
    ? Math.min(below, window.innerHeight - height - 12)
    : bounds.top - height - 8;
  popup.style.left = `${left}px`;
  popup.style.top = `${Math.max(12, top)}px`;
}

function showDateCalendar(target, monthOffset = 0) {
  const input = document.getElementById(target.dataset.target);
  if (!input) return;
  const current = parseDate(input.value) || today();
  const storedMonth = state.dateCalendar?.target === input.id ? state.dateCalendar.monthDate : "";
  const [baseYear, baseMonth] = (storedMonth || current).split("-").map(Number);
  const monthDate = new Date(baseYear, baseMonth - 1 + monthOffset, 1);
  const popup = document.createElement("div");
  popup.className = "date-calendar-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Seleccionar fecha");
  popup.innerHTML = dateCalendarMarkup(input, monthDate);
  const parent = dialog.open ? dialog : document.body;
  const previousPopup = parent.querySelector(".date-calendar-popup");
  const previousPosition = state.dateCalendar?.target === input.id && previousPopup
    ? previousPopup.getBoundingClientRect()
    : null;
  previousPopup?.remove();
  parent.append(popup);
  state.dateCalendar = { target: input.id, monthDate: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-01` };
  if (previousPosition) {
    popup.style.left = `${previousPosition.left}px`;
    popup.style.top = `${previousPosition.top}px`;
  } else {
    positionDateCalendar(popup, target);
  }
}

function closeDateCalendar() {
  document.querySelectorAll(".date-calendar-popup").forEach((popup) => popup.remove());
  state.dateCalendar = null;
}

function selectedTagLineage(tagId, collected = new Set()) {
  if (!tagId || collected.has(tagId)) return [...collected];
  collected.add(tagId);
  const tag = state.tags.find((entry) => entry.id === tagId);
  tagParents(tag || {}).forEach((parentId) => selectedTagLineage(parentId, collected));
  return [...collected];
}

function createTagFromContext(target) {
  const form = target.closest("form[data-form]");
  if (!form) return;
  const formType = form.dataset.form;
  if (!["transaction", "buy-goal", "budget"].includes(formType)) return;
  const data = new FormData(form);
  const values = Object.fromEntries([...data.entries()].filter(([key]) => key !== "tagIds"));
  const selectedTags = data.getAll("tagIds").map(String);
  const parents = selectedTags.filter((tagId) => !state.tags.some((tag) =>
    selectedTags.includes(tag.id) && tagParents(tag).includes(tagId)));
  state.tagReturn = {
    context: formType,
    id: form.dataset.id,
    type: String(data.get("type") || ""),
    values,
    tagIds: selectedTags,
    parents
  };
  tagForm(null, target.dataset.kind || "expense", parents);
}

function parsedFormDate(data, name, optional = false) {
  const raw = String(data.get(name) || "").trim();
  if (!raw && optional) return "";
  const parsed = parseDate(raw);
  if (!parsed) throw new Error("Introduce una fecha válida en formato DD/MM/YYYY.");
  return parsed;
}

function updateDateFilter(target, key) {
  const parsed = parseDate(target.value);
  if (!parsed) {
    notify("Introduce una fecha válida en formato DD/MM/YYYY.");
    render();
    return;
  }
  const minimum = parseDate(target.dataset.minDate);
  if (minimum && parsed < minimum) {
    notify(`La fecha debe ser igual o posterior al ${formatDate(minimum)}.`);
    render();
    return;
  }
  state[key] = parsed;
  render();
}

function updateActivityDateFilter(target, key) {
  const parsed = parseDate(target.value);
  if (!parsed) {
    notify("Introduce una fecha válida en formato DD/MM/YYYY.");
    render();
    return;
  }
  state[key] = parsed;
  if (state.activityFrom > state.activityTo) {
    if (key === "activityFrom") state.activityTo = parsed;
    else state.activityFrom = parsed;
    notify("El otro límite del rango se ha ajustado para mantener el orden de fechas.");
  }
  render();
}

function tagRole(tag, role) {
  const hierarchy = tag.hierarchy || (tag.parentId ? "sub" : "flexible");
  return role === "main" ? hierarchy !== "sub" : hierarchy !== "main";
}

function tagParents(tag) {
  return [...new Set([...(tag.parentIds || []), tag.parentId].filter(Boolean))];
}

function tagHasAncestor(tagId, ancestorId, visited = new Set()) {
  if (tagId === ancestorId || visited.has(tagId)) return tagId === ancestorId;
  visited.add(tagId);
  const tag = state.tags.find((entry) => entry.id === tagId);
  return Boolean(tag && tagParents(tag).some((parentId) => tagHasAncestor(parentId, ancestorId, visited)));
}

function tagCascadePicker(kind, selected = [], allowCreate = true, { revealAll = false } = {}) {
  const tags = state.tags.filter((tag) => !tag.kind || tag.kind === kind);
  const mains = tags.filter((tag) => tagRole(tag, "main")).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const selectedMains = selected.filter((tagId) => mains.some((tag) => tag.id === tagId));
  const seen = new Set(selectedMains);
  const childLevels = [];
  let parents = revealAll ? mains.map((tag) => tag.id) : selectedMains;
  while (parents.length) {
    const children = tags.filter((tag) => tagRole(tag, "sub") && !seen.has(tag.id) && tagParents(tag).some((parentId) => parents.includes(parentId)))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (!children.length) break;
    children.forEach((tag) => seen.add(tag.id));
    childLevels.push({ parents, children });
    parents = revealAll ? children.map((tag) => tag.id) : children.filter((tag) => selected.includes(tag.id)).map((tag) => tag.id);
  }
  const option = (tag, role) => {
    const parentIds = tagParents(tag);
    const disabled = revealAll && role === "sub" && !parentIds.some((parentId) => selected.includes(parentId));
    return `<label class="tag-option"><input type="checkbox" name="tagIds" value="${escapeHtml(tag.id)}" data-tag-role="${role}" ${selected.includes(tag.id) ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${escapeHtml(tag.name)}</span></label>`;
  };
  return `<div class="tag-cascade">
    <strong>1. Etiqueta principal</strong>
    ${mains.length ? `<div class="tag-picker">${mains.map((tag) => option(tag, "main")).join("")}</div>` : `<span class="field-hint">Aún no hay etiquetas principales.</span>`}
    ${childLevels.map(({ parents: levelParents, children }, index) => `<strong>${index === 0 ? "2. Subetiqueta" : `${index + 2}. Subetiqueta`} <span class="muted">de ${escapeHtml(levelParents.map((parentId) => tagName(parentId, state.tags)).join(", "))}</span></strong><div class="tag-picker">${children.map((tag) => option(tag, "sub")).join("")}</div>`).join("") || `<strong>2. Subetiqueta <span class="muted">(opcional según la principal)</span></strong><span class="field-hint">Elige primero una etiqueta principal.</span>`}
    ${allowCreate ? `<button type="button" class="button button-secondary" data-action="create-tag-for-context" data-kind="${kind}">＋ Nueva etiqueta</button>` : ""}
  </div>`;
}

function tagParentPicker(kind, tag, selected = tag ? tagParents(tag) : []) {
  const parents = state.tags.filter((entry) => entry.id !== tag?.id && (!tag || !tagHasAncestor(entry.id, tag.id)) && (!entry.kind || entry.kind === kind))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return parents.map((parent) => `<label class="tag-option"><input type="checkbox" name="parentIds" value="${escapeHtml(parent.id)}" ${selected.includes(parent.id) ? "checked" : ""}><span>${escapeHtml([...tagParents(parent).map((parentId) => tagName(parentId, state.tags)), parent.name].join(" › "))}</span></label>`).join("");
}

function validateTagSelection(tagIds) {
  const selected = tagIds.map((tagId) => state.tags.find((tag) => tag.id === tagId)).filter(Boolean);
  const selectedIds = new Set(selected.map((tag) => tag.id));
  const mains = selected.filter((tag) => tagRole(tag, "main") && !tagParents(tag).some((parentId) => selectedIds.has(parentId)));
  const subs = selected.filter((tag) => tagRole(tag, "sub") &&
    (tag.hierarchy === "sub" || tagParents(tag).some((parentId) => selectedIds.has(parentId))));
  for (const parent of selected.filter((tag) => tag.requireSubcategory)) {
    if (!subs.some((sub) => tagParents(sub).includes(parent.id))) {
      throw new Error(`La etiqueta «${parent.name}» requiere una subetiqueta.`);
    }
  }
  for (const sub of subs) {
    if (!tagParents(sub).some((parentId) => selected.some((parent) => parent.id === parentId))) {
      throw new Error(`La subetiqueta «${sub.name}» no corresponde a una etiqueta seleccionada.`);
    }
  }
  return { selected, mains, subs };
}

function readTagSelection(data, kind, required = false) {
  const tagIds = data.getAll("tagIds").map(String);
  const selection = validateTagSelection(tagIds);
  if (selection.selected.some((tag) => tag.kind && tag.kind !== kind)) throw new Error("Las etiquetas de gastos e ingresos se guardan por separado.");
  if (required && !selection.mains.length) throw new Error("Elige una etiqueta principal.");
  return { tagIds, ...selection };
}

function moneyClass(value) {
  return Number(value) < 0 ? "negative" : "positive";
}

function accountOptions(selected = "", includeArchived = false) {
  return state.accounts.filter((account) => includeArchived || !account.archived)
    .map((account) => `<option value="${escapeHtml(account.id)}" ${account.id === selected ? "selected" : ""}>${escapeHtml(account.name)}</option>`).join("");
}

function tagOptions(selected = "", includeChildren = true, kind = null) {
  const tags = state.tags.filter((tag) => (includeChildren || !tag.parentId) && (!kind || !tag.kind || tag.kind === kind))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return tags.map((tag) => {
    const parents = tagParents(tag).map((parentId) => tagName(parentId, state.tags)).join(" / ");
    return `<option value="${escapeHtml(tag.id)}" ${tag.id === selected ? "selected" : ""}>${escapeHtml(parents ? `${parents} › ` : "")}${escapeHtml(tag.name)}</option>`;
  }).join("");
}

function getAccount(accountId) {
  return state.accounts.find((account) => account.id === accountId);
}

function setNav(view) {
  state.view = view;
  $$(".nav-link[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  render();
}

function showDialog(title, subtitle, content) {
  dialog.innerHTML = `
    <div class="dialog-head"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>
    <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Cerrar">×</button></div>
    <div class="dialog-body">${content}</div>`;
  if (!dialog.open) dialog.showModal();
}

function confirmInDialog(title, message, confirmLabel = "Confirmar", danger = true) {
  return new Promise((resolve) => {
    state.pendingConfirmation = resolve;
    showDialog(title, "", `<form data-form="confirmation"><p>${escapeHtml(message)}</p><div class="form-footer"><button type="button" class="button button-quiet" data-action="cancel-confirmation">Cancelar</button><button class="button ${danger ? "button-danger" : "button-primary"}">${escapeHtml(confirmLabel)}</button></div></form>`);
  });
}

function closeDialog() {
  if ($('form[data-form="tag"]', dialog) && state.tagReturn) state.tagReturn = null;
  if (dialog.open) dialog.close();
}

function pageHeading(kicker, title, description, actions = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${escapeHtml(kicker)}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
}

function emptyState(title, description, button = "") {
  return `<div class="empty-state"><div class="empty-symbol">◌</div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span>${button ? `<div style="margin-top:14px">${button}</div>` : ""}</div>`;
}

function getVisibleAccounts() {
  return state.accounts.filter((account) => !account.archived);
}

function getFiguresForSelection() {
  const selected = state.selectedAccounts.length
    ? getVisibleAccounts().filter((account) => state.selectedAccounts.includes(account.id))
    : getVisibleAccounts();
  return selected.reduce((total, account) => {
    const figures = accountFigures(account, state.accounts, state.transactions, state.goals, state.debts);
    total.balance += figures.balance;
    total.reserved += figures.reserved;
    total.debtHold += figures.debtHold;
    total.free += figures.free;
    return total;
  }, { balance: 0, reserved: 0, debtHold: 0, free: 0 });
}

function forecastForDate(date) {
  const selectedIds = state.selectedAccounts.length
    ? new Set(state.selectedAccounts)
    : new Set(getVisibleAccounts().map((account) => account.id));
  const current = getFiguresForSelection().balance;
  const movements = state.transactions.filter((tx) =>
    (tx.type === "income" || tx.type === "expense") &&
    tx.date <= date &&
    (selectedIds.has(tx.accountId)) &&
    (tx.date > today() || !tx.confirmed)
  );
  const scheduled = movements.reduce((sum, tx) => sum + (tx.type === "income" ? Number(tx.amount) : -Number(tx.amount)), 0);
  const collections = state.debts.filter((debt) =>
    debt.direction === "owed_to_me" && debt.date <= date &&
    (!debt.accountId || selectedIds.has(debt.accountId))
  ).reduce((sum, debt) => sum + debtOutstanding(debt), 0);
  return { total: current + scheduled, current, scheduled, collections, movements };
}

function transactionLabel(tx) {
  if (tx.type === "income") return "Ingreso";
  if (tx.type === "expense") return "Gasto";
  if (tx.type === "debt_collection") return "Devolución recibida";
  if (tx.type === "debt_payment") return "Devolución de deuda";
  if (tx.type === "transfer") return `Traspaso a ${accountName(tx.toAccountId, state.accounts, tx.toAccountName)}`;
  if (tx.type === "adjustment") return "Ajuste de saldo";
  return "Aporte a ahorro";
}

function transactionDescription(tx) {
  if (tx.type === "debt_collection" || tx.type === "debt_payment") return `${tx.person} · ${accountName(tx.accountId, state.accounts, tx.accountName)}`;
  if (tx.type === "transfer") return `${accountName(tx.accountId, state.accounts, tx.accountName)} → ${accountName(tx.toAccountId, state.accounts, tx.toAccountName)}`;
  if (tx.type === "adjustment") return tx.note || accountName(tx.accountId, state.accounts, tx.accountName);
  const tags = transactionTagIds(tx).map((tagId) => {
    const tag = state.tags.find((entry) => entry.id === tagId);
    return tag?.parentId ? `${tag.parentName || tagName(tag.parentId, state.tags)} › ${tag.name}` : tag?.name;
  }).filter(Boolean);
  const tag = tags.length ? tags.join(" + ") : "Sin etiqueta";
  if (tx.type === "saving") return `${tag === "Sin etiqueta" ? "Ahorro" : tag} · ${state.goals.find((goal) => goal.id === tx.goalId)?.name || "Objetivo"}`;
  return `${tag} · ${accountName(tx.accountId, state.accounts, tx.accountName)}${tx.note ? ` · ${tx.note}` : ""}`;
}

function txAmountDisplay(tx) {
  if (tx.type === "income") return { text: `+${money(tx.amount)}`, className: "positive" };
  if (tx.type === "expense") return { text: `−${money(expenseAmount(tx))}`, className: "negative" };
  if (tx.type === "debt_collection") return { text: `+${money(tx.amount)} devueltos`, className: "positive" };
  if (tx.type === "debt_payment") return { text: `−${money(tx.amount)} devueltos`, className: "negative" };
  if (tx.type === "saving") return { text: `${money(tx.amount)} reservados`, className: "" };
  if (tx.type === "adjustment") return { text: `${Number(tx.amount) > 0 ? "+" : ""}${money(tx.amount)}`, className: moneyClass(tx.amount) };
  return { text: `${money(tx.amount)} transferidos`, className: "" };
}

function transactionRow(tx, options = {}) {
  const amount = txAmountDisplay(tx);
  const pending = (tx.type === "income" || tx.type === "expense") && !tx.confirmed;
  const rescue = (tx.savingsDraws || (tx.savingsGoalId ? [{ goalId: tx.savingsGoalId, amount: tx.savingsUsed }] : [])).length > 0;
  const savingsLabel = tx.purchaseGoalId ? " · compra de objetivo" : rescue ? " · ahorro utilizado" : "";
  return `<div class="transaction-row">
    <div class="account-icon" style="background:${tx.type === "income" || tx.type === "debt_collection" ? "#e4f2e9" : tx.type === "expense" || tx.type === "debt_payment" ? "#fae9e4" : "#eef0f6"}">${tx.type === "income" || tx.type === "debt_collection" ? "↗" : tx.type === "expense" || tx.type === "debt_payment" ? "↘" : tx.type === "saving" ? "◉" : "↔"}</div>
    <div class="transaction-meta"><strong>${escapeHtml(tx.note || transactionLabel(tx))}</strong><small>${escapeHtml(transactionDescription(tx))} · ${escapeHtml(dateLabel(tx.date))}${tx.type === "expense" && tx.ownAmount !== undefined && tx.ownAmount < tx.amount ? ` · pagaste ${money(tx.amount)}, tu gasto ${money(tx.ownAmount)}` : ""}${savingsLabel}</small></div>
    <div class="transaction-amount ${amount.className}">${amount.text}${pending ? `<small class="pill future">Pendiente</small>` : ""}</div>
    ${options.actions === false ? "" : `<div class="transaction-actions">${options.actions || `${pending ? `<button class="button button-secondary" data-action="confirm-transaction" data-id="${escapeHtml(tx.id)}">${tx.type === "income" ? "Ya llegó" : "Ya se pagó"}</button>` : ""}${tx.type === "income" || tx.type === "expense" ? `<button class="button button-quiet" data-action="edit-transaction" data-id="${escapeHtml(tx.id)}">Editar</button><button class="button button-quiet" data-action="delete-transaction" data-id="${escapeHtml(tx.id)}">Eliminar</button>` : ""}`}</div>`}
  </div>`;
}

function activeOverspentBudgets() {
  const currentMonth = monthKey();
  return state.budgets.filter((budget) => !budget.hidden && budget.period === currentMonth && budgetProgress(budget, state.transactions) > budget.amount);
}

function unresolvedRescues() {
  return state.transactions.filter((tx) => tx.type === "expense" && tx.confirmed && !tx.alertDismissed &&
    !tx.purchaseGoalId && ((tx.savingsDraws || []).length || tx.savingsGoalId));
}

function monthOffset(offset) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 7);
}

function renderHome() {
  const accounts = getVisibleAccounts();
  const figures = getFiguresForSelection();
  const alertList = unresolvedRescues();
  const overspent = activeOverspentBudgets();
  const activeGoals = state.goals.filter((goal) => !goal.hidden && !goal.completedAt);
  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const forecast = forecastForDate(state.forecastDate);
  const forecastMovements = [...forecast.movements].sort((a, b) => a.date.localeCompare(b.date));
  const budgetItems = state.budgets.filter((budget) => !budget.hidden && budget.period === monthKey()).slice(0, 4);
  root.innerHTML = `
    ${pageHeading("Tu dinero, más claro", "Hola, ¿cómo va tu mes?", "Un vistazo sencillo a lo que tienes y a lo que estás construyendo.",
      `<button class="button button-secondary" data-action="new-account">＋ Cuenta</button><button class="button button-primary" data-action="new-expense">＋ Movimiento</button>`)}
    ${alertList.length ? alertList.map((tx) => `<div class="alert-banner"><span class="alert-bang">!</span><div><strong>Has usado dinero reservado</strong><br><span>Un gasto de ${money(tx.amount)} tomó dinero de un objetivo de ahorro.</span></div><button class="button button-danger" data-action="dismiss-rescue" data-id="${escapeHtml(tx.id)}">Entendido</button></div>`).join("") : ""}
    ${overspent.length ? `<div class="alert-banner"><span class="alert-bang">!</span><div><strong>${overspent.length === 1 ? "Un presupuesto se ha superado" : `${overspent.length} presupuestos se han superado`}</strong><br><span>Consulta los detalles en Presupuestos.</span></div><button class="text-link" data-view="budgets">Ver presupuestos →</button></div>` : ""}
    <section class="dashboard-grid">
      <article class="balance-card">
        <div class="balance-top"><span>Saldo total actual</span><button class="account-filter" data-action="select-accounts" type="button">${state.selectedAccounts.length ? `${state.selectedAccounts.length} cuenta${state.selectedAccounts.length === 1 ? "" : "s"}` : "Todas las cuentas"} ▾</button></div>
        <div class="balance-value">${money(figures.balance)}</div>
        <div class="balance-split"><span>Disponible <strong>${money(figures.free)}</strong></span><span>En ahorros <strong>${money(figures.reserved)}</strong></span><span>Retenido por deudas <strong>${money(figures.debtHold)}</strong></span></div>
      </article>
      <article class="panel account-summary">
        <div class="section-title"><h2>Tus cuentas</h2><button class="text-link" data-action="manage-accounts">Gestionar →</button></div>
        ${accounts.length ? accounts.slice(0, 4).map((account) => {
          const values = accountFigures(account, state.accounts, state.transactions, state.goals, state.debts);
          return `<div class="account-row"><div class="account-name"><span>${escapeHtml(account.name)}</span></div><div class="account-amount">${money(values.balance)}<small>${money(values.free)} disponible</small></div></div>`;
        }).join("") : emptyState("Empieza con una cuenta", "Añade tu monedero o cuenta bancaria para empezar.", `<button class="button button-primary" data-action="new-account">Crear mi primera cuenta</button>`)}
      </article>
    </section>
    <section class="panel" style="margin-top:19px">
      <div class="panel-heading"><div><h2>Movimientos previstos</h2><p>Importe neto de movimientos futuros o pendientes hasta ${escapeHtml(formatDate(state.forecastDate))}, sin incluir el saldo actual.</p></div></div>
      <div class="forecast-total">${money(forecast.scheduled)}</div>
      ${forecastMovements.length ? forecastMovements.slice(0,5).map((tx) => transactionRow(tx)).join("") : emptyState("Sin movimientos previstos", "No hay ingresos ni gastos futuros o pendientes hasta esta fecha.")}
    </section>
    <section class="two-panels">
      <article class="panel">
        <div class="panel-heading"><div><h2>Previsión de patrimonio</h2><p>Saldo actual y movimientos previstos; las deudas pendientes no se suman</p></div></div>
        <div class="field forecast-date"><label for="forecast-date">Estimar a fecha (DD/MM/YYYY)</label>${dateInput("forecastDate", state.forecastDate, { id: "forecast-date", required: true, min: today() })}</div>
        <div class="forecast-total">${money(forecast.total)}</div>
        <div class="forecast-breakdown"><span>Saldo actual <strong>${money(forecast.current)}</strong></span><span>Movimientos previstos <strong>${money(forecast.scheduled)}</strong></span><span>Te deben (no sumado) <strong>${money(forecast.collections)}</strong></span></div>
      </article>
      <article class="panel">
        <div class="panel-heading"><div><h2>Presupuestos del mes</h2><p>Tu progreso, sin sorpresas</p></div><button class="text-link" data-view="budgets">Ver todos →</button></div>
        ${budgetItems.length ? budgetItems.map((budget) => {
          const progress = budgetProgress(budget, state.transactions);
          const ratio = budget.amount > 0 ? progress / budget.amount : 0;
          return `<div class="budget-item"><div class="budget-line"><strong>${escapeHtml(budgetTagLabel(budget))}${budget.kind === "saving" ? " · ahorro" : ""}</strong><span>${money(progress)} / ${money(budget.amount)}</span></div><div class="progress-track"><div class="progress-fill ${ratio > 1 ? "over" : ratio >= .85 ? "warn" : ""}" style="width:${Math.min(100, ratio * 100)}%"></div></div></div>`;
        }).join("") : emptyState("Sin presupuestos todavía", "Crea uno para dar intención a tu dinero.", `<button class="button button-secondary" data-action="new-budget">Crear presupuesto</button>`)}
      </article>
    </section>
    <section class="two-panels">
      <article class="panel">
        <div class="panel-heading"><div><h2>Ahorros en marcha</h2><p>El dinero reservado sigue dentro de tu saldo</p></div><button class="text-link" data-view="savings">Ver objetivos →</button></div>
        ${activeGoals.length ? `<div class="goal-grid">${activeGoals.slice(0, 4).map((goal) => goalCard(goal)).join("")}</div>` : emptyState("Aún no tienes objetivos", "Crea un bote para separar dinero sin moverlo fuera de tu cuenta.", `<button class="button button-secondary" data-action="new-goal">＋ Crear objetivo</button>`)}
      </article>
      <article class="panel content-list">
        <div class="panel-heading"><div><h2>Últimos movimientos</h2><p>Lo más reciente de tus cuentas</p></div><button class="text-link" data-view="activity">Ver todos →</button></div>
        ${recent.length ? recent.map((tx) => transactionRow(tx)).join("") : emptyState("Todavía no hay movimientos", "Tus ingresos y gastos aparecerán aquí.")}
      </article>
    </section>`;
}

function goalCard(goal) {
  const current = Math.max(0, goalReserved(goal, state.transactions));
  const ratio = goal.target > 0 ? current / goal.target : 0;
  const overdue = goal.dueDate && goal.dueDate < today();
  return `<div class="goal-card"><strong>${escapeHtml(goal.name)} ${overdue ? `<span class="pill warning">Vencido</span>` : ""}</strong><small>${escapeHtml(goalSourceLabel(goal))} · ${money(current)} reservados${goal.dueDate ? ` · hasta ${escapeHtml(dateLabel(goal.dueDate))}` : ""}</small><div class="progress-track"><div class="progress-fill ${ratio >= 1 ? "warn" : ""}" style="width:${Math.min(100, ratio * 100)}%"></div></div><div class="goal-amounts"><span>${money(current)}</span><span>${money(goal.target)}</span></div></div>`;
}

function goalSourceLabel(goal) {
  const accountIds = [...new Set(state.transactions.filter((tx) => tx.type === "saving" && tx.goalId === goal.id && Number(tx.amount) > 0).map((tx) => tx.accountId || goal.accountId).filter(Boolean))];
  if (!accountIds.length && goal.accountId) accountIds.push(goal.accountId);
  const names = accountIds.map((accountId) => getAccount(accountId)?.name).filter(Boolean);
  return names.length ? names.join(", ") : "Sin aportaciones";
}

function renderActivity() {
  const period = state.activityPeriod;
  const transactions = [...state.transactions].filter((tx) =>
    (period === "range" ? tx.date >= state.activityFrom && tx.date <= state.activityTo : transactionInPeriod(tx, period)) &&
    (state.activityAccount === "all" || tx.accountId === state.activityAccount || tx.toAccountId === state.activityAccount) &&
    (state.activityTag === "all" || transactionMatchesTag(tx, state.activityTag)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const actions = `<button class="button button-secondary" data-action="transfer">↔ Traspasar</button><button class="button button-primary" data-action="new-expense">＋ Movimiento</button>`;
  root.innerHTML = `${pageHeading("Actividad", "Movimientos", "Ingresos, gastos, traspasos y aportaciones a tus objetivos.", actions)}
    <section class="panel">
      <div class="filter-row">
        <select class="filter-control" id="activity-period"><option value="month" ${period === "month" ? "selected" : ""}>Este mes</option><option value="year" ${period === "year" ? "selected" : ""}>Este año</option><option value="range" ${period === "range" ? "selected" : ""}>Rango personalizado</option><option value="all" ${period === "all" ? "selected" : ""}>Todo el historial</option></select>
        ${period === "range" ? `<label class="date-filter">Desde ${dateInput("activityFrom", state.activityFrom, { id: "activity-from" })}</label><label class="date-filter">Hasta ${dateInput("activityTo", state.activityTo, { id: "activity-to" })}</label>` : ""}
        <select class="filter-control" id="activity-account"><option value="all">Todas las cuentas</option>${accountOptions(state.activityAccount)}</select>
        <select class="filter-control" id="activity-tag"><option value="all">Todas las etiquetas</option>${tagOptions(state.activityTag)}</select>
      </div>
      <div class="content-list">${transactions.length ? transactions.map((tx) => {
        const actions = `${["income", "expense"].includes(tx.type) && !tx.confirmed
          ? `<button class="button button-secondary" data-action="confirm-transaction" data-id="${escapeHtml(tx.id)}">${tx.type === "income" ? "Confirmar llegada" : "Confirmar pago"}</button>` : ""}${["income", "expense"].includes(tx.type) ? `<button class="button button-quiet" data-action="edit-transaction" data-id="${escapeHtml(tx.id)}">Editar</button><button class="button button-quiet" data-action="delete-transaction" data-id="${escapeHtml(tx.id)}">Eliminar</button>` : ""}`;
        return transactionRow(tx, { actions });
      }).join("") : emptyState("No hay movimientos con estos filtros", "Prueba con otro periodo o registra tu primer movimiento.")}</div>
    </section>`;
}

function budgetStatus(budget) {
  const progress = budgetProgress(budget, state.transactions);
  if (progress > budget.amount) return "over";
  if (progress >= budget.amount) return "done";
  return "active";
}

function renderBudgets() {
  const currentMonth = monthKey();
  const budgets = state.budgets.filter((budget) => state.archivedVisible ? budget.hidden : !budget.hidden)
    .sort((a, b) => b.period.localeCompare(a.period));
  const current = budgets.filter((budget) => budget.period === currentMonth);
  const other = budgets.filter((budget) => budget.period !== currentMonth);
  root.innerHTML = `${pageHeading("Planifica con intención", "Presupuestos", "Controla gastos y asignaciones a tus objetivos de ahorro.", `<button class="button button-secondary" data-action="toggle-archived">${state.archivedVisible ? "Ver activos" : "Elementos ocultos"}</button><button class="button button-primary" data-action="new-budget">＋ Nuevo presupuesto</button>`)}
    ${activeOverspentBudgets().length && !state.archivedVisible ? `<div class="alert-banner"><span class="alert-bang">!</span><div><strong>Hay presupuestos superados</strong><br><span>Se conservan en el historial aunque los ocultes de la vista principal.</span></div></div>` : ""}
    <section class="panel">
      <div class="panel-heading"><div><h2>${state.archivedVisible ? "Elementos ocultos" : "Este mes"}</h2><p>${escapeHtml(new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(`${currentMonth}-01T12:00:00`)))}</p></div></div>
      ${current.length ? current.map((budget) => budgetCard(budget)).join("") : emptyState(state.archivedVisible ? "No hay elementos ocultos" : "Aún no has planificado este mes", "Asigna un límite a una etiqueta o una meta mensual de ahorro.", state.archivedVisible ? "" : `<button class="button button-secondary" data-action="new-budget">Crear presupuesto</button>`)}
    </section>
    ${other.length ? `<section class="panel" style="margin-top:16px"><div class="panel-heading"><div><h2>Otros periodos</h2><p>Historial de presupuestos anteriores y futuros</p></div></div>${other.map((budget) => budgetCard(budget)).join("")}</section>` : ""}`;
}

function budgetCard(budget) {
  const progress = budgetProgress(budget, state.transactions);
  const ratio = budget.amount > 0 ? progress / budget.amount : 0;
  const status = budgetStatus(budget);
  const flag = status === "over" ? `<span class="pill warning">! Superado</span>` : status === "done" ? `<span class="pill">Cumplido</span>` : `<span class="pill">${budget.kind === "saving" ? "Ahorro" : "Gasto"}</span>`;
  return `<div class="budget-item" style="padding:14px 0;border-top:1px solid #f0f2ef"><div class="budget-line"><strong>${escapeHtml(budgetTagLabel(budget))} · ${escapeHtml(budget.period)} ${flag}</strong><span>${money(progress)} / ${money(budget.amount)}</span></div><div class="progress-track"><div class="progress-fill ${status === "over" ? "over" : ratio >= .85 ? "warn" : ""}" style="width:${Math.min(100, ratio * 100)}%"></div></div><div class="budget-line" style="margin-top:9px;margin-bottom:0"><span>${budget.kind === "saving" ? `Aportaciones a ${escapeHtml(state.goals.find((goal) => goal.id === budget.goalId)?.name || "ahorro")}` : "Gastos confirmados"}</span><div class="inline-actions"><button class="text-link" data-action="edit-budget" data-id="${escapeHtml(budget.id)}">Editar</button><button class="text-link" data-action="delete-budget" data-id="${escapeHtml(budget.id)}">Eliminar</button><button class="text-link" data-action="${budget.hidden ? "unhide-budget" : "hide-budget"}" data-id="${escapeHtml(budget.id)}">${budget.hidden ? "Recuperar" : "Ocultar"}</button></div></div></div>`;
}

function renderSavings() {
  const active = state.goals.filter((goal) => !goal.hidden && !goal.completedAt);
  const archived = state.goals.filter((goal) => goal.hidden || goal.completedAt);
  const goals = state.archivedVisible ? archived : active;
  const completedReady = active.filter((goal) => goal.target > 0 && goalReserved(goal, state.transactions) >= goal.target);
  const readyNotice = completedReady.map((goal) => `<div class="alert-banner success-banner"><span class="alert-bang" style="background:#53956a">✓</span><div><strong>¡Meta alcanzada: ${escapeHtml(goal.name)}!</strong><br><span>Ya puedes registrar la compra y devolver el sobrante a tu saldo disponible.</span></div><button class="button button-secondary" data-action="buy-goal" data-id="${escapeHtml(goal.id)}">Comprado</button></div>`).join("");
  root.innerHTML = `${pageHeading("Tus planes, paso a paso", "Ahorros", "Separa dinero virtualmente: sigue en tus cuentas, pero no se mezcla con tu saldo libre.", `<button class="button button-secondary" data-action="toggle-archived">${state.archivedVisible ? "Ver activos" : "Elementos ocultos"}</button><button class="button button-primary" data-action="new-goal">＋ Nuevo objetivo</button>`)}
    ${!state.archivedVisible ? readyNotice : ""}
    ${state.transactions.some((tx) => tx.type === "expense" && !tx.purchaseGoalId && ((tx.savingsDraws || []).length || tx.savingsGoalId)) ? `<div class="alert-banner"><span class="alert-bang">!</span><div><strong>Historial de ahorros utilizados</strong><br><span>Los gastos ajenos a compras de objetivos que necesitaron dinero reservado se conservan para auditoría.</span></div><button class="button button-danger" data-view="stats">Ver auditoría</button></div>` : ""}
    <section class="panel">
      <div class="panel-heading"><div><h2>${state.archivedVisible ? "Elementos ocultos" : "Tus objetivos"}</h2><p>Reservado actualmente: ${money(goals.filter((goal) => !goal.completedAt).reduce((sum, goal) => sum + goalReserved(goal, state.transactions), 0))}</p></div></div>
      ${goals.length ? `<div class="goal-grid">${goals.map((goal) => goalManagementCard(goal)).join("")}</div>` : emptyState(state.archivedVisible ? "No hay objetivos ocultos" : "Empieza con un objetivo", "Ponle nombre a algo que quieras conseguir y asígnale dinero cuando quieras.", state.archivedVisible ? "" : `<button class="button button-primary" data-action="new-goal">Crear objetivo</button>`)}
    </section>`;
}

function goalManagementCard(goal) {
  const reserved = Math.max(0, goalReserved(goal, state.transactions));
  const completed = Boolean(goal.completedAt);
  const overdue = !completed && goal.dueDate && goal.dueDate < today();
  const ratio = goal.target ? reserved / goal.target : 0;
  return `<article class="goal-card" style="padding:18px">
    <strong>${escapeHtml(goal.name)} ${completed ? `<span class="pill">Comprado</span>` : ""}</strong>
    <small>${escapeHtml(goalSourceLabel(goal))} · Objetivo ${money(goal.target)}${goal.dueDate ? ` · ${escapeHtml(dateLabel(goal.dueDate))}` : ""} ${overdue ? `<span class="pill warning">Vencido</span>` : ""}</small>
    ${!completed ? `<div class="progress-track"><div class="progress-fill ${ratio >= 1 ? "warn" : ""}" style="width:${Math.min(100, ratio * 100)}%"></div></div><div class="goal-amounts"><span>${money(reserved)} reservados</span><span>${Math.round(ratio * 100)}%</span></div>
      <div class="heading-actions" style="margin-top:15px"><button class="button button-secondary" data-action="contribute" data-id="${escapeHtml(goal.id)}">＋ Apartar</button><button class="button button-quiet" data-action="withdraw-saving" data-id="${escapeHtml(goal.id)}">Retirar</button>${ratio >= 1 ? `<button class="button button-primary" data-action="buy-goal" data-id="${escapeHtml(goal.id)}">Comprado</button>` : ""}<button class="button button-quiet" data-action="edit-goal" data-id="${escapeHtml(goal.id)}">Editar</button><button class="button button-quiet" data-action="delete-goal" data-id="${escapeHtml(goal.id)}">Eliminar</button><button class="button button-quiet" data-action="hide-goal" data-id="${escapeHtml(goal.id)}">Ocultar</button></div>` 
      : `<div class="insight-card"><strong>Compra completada</strong><p>El sobrante de la meta se liberó automáticamente. La operación permanece en tu historial.</p></div><div class="heading-actions" style="margin-top:12px"><button class="button button-quiet" data-action="edit-goal" data-id="${escapeHtml(goal.id)}">Editar</button><button class="button button-quiet" data-action="delete-goal" data-id="${escapeHtml(goal.id)}">Eliminar</button><button class="button button-secondary" data-action="hide-goal" data-id="${escapeHtml(goal.id)}">Ocultar objetivo</button></div>`}
  </article>`;
}

function debtOutstanding(debt) {
  return getDebtOutstanding(debt);
}

function debtGroups(direction, includeClosed = false) {
  const grouped = new Map();
  for (const debt of state.debts.filter((entry) => entry.direction === direction && (includeClosed || debtOutstanding(entry) > .005))) {
    const key = debt.personKey || debt.person.trim().toLocaleLowerCase("es");
    if (!grouped.has(key)) grouped.set(key, { person: debt.person, total: 0, debts: [] });
    const group = grouped.get(key);
    group.total += debtOutstanding(debt);
    group.debts.push(debt);
  }
  return [...grouped.values()].sort((a, b) => a.person.localeCompare(b.person, "es"));
}

function debtGroupCard(group, direction) {
  return `<article class="debt-person-card">
    <div class="debt-person-head"><div class="account-name"><span class="account-icon" style="background:${direction === "owed_to_me" ? "#e4f2e9" : "#f7e2e4"}">${direction === "owed_to_me" ? "↙" : "↗"}</span><span><strong>${escapeHtml(group.person)}</strong><small>${group.debts.length} ${group.debts.length === 1 ? "apunte" : "apuntes"}</small></span></div><strong class="${direction === "owed_to_me" ? "green-text" : "red-text"}">${money(group.total)}</strong></div>
    <div class="debt-items">${group.debts.map((debt) => {
      const outstanding = debtOutstanding(debt);
      const closed = outstanding <= .005;
      const events = state.debtEvents.filter((event) => event.debtId === debt.id);
      const sourceTransaction = debt.source === "expense" ? state.transactions.find((tx) => tx.id === debt.transactionId) : null;
      const eventRows = events.map((event) => {
        const tx = event.transactionId ? state.transactions.find((entry) => entry.id === event.transactionId) : null;
        const label = event.kind === "payment" ? "Abono" : event.kind === "offset-paid" ? "Compensación aplicada" : event.kind === "forgiveness" ? "Perdón" : event.kind === "offset" ? "Compensación" : event.kind === "adjusted" ? "Ajuste" : "Creada";
        const editablePayment = tx?.debtId === debt.id && ["payment", "offset-paid", "forgiveness"].includes(event.kind);
        return `<div class="debt-event-row"><small>${label} ${money(event.amount)} · ${escapeHtml(dateLabel(event.date))}</small>${editablePayment ? `<div class="inline-actions"><button class="text-link" data-action="edit-debt-payment" data-id="${escapeHtml(tx.id)}">Editar</button><button class="text-link" data-action="delete-transaction" data-id="${escapeHtml(tx.id)}">Eliminar</button></div>` : ""}</div>`;
      }).join("");
      const debtActions = closed
        ? `<span class="pill">Liquidada</span>`
        : `<span class="pill">${money(outstanding)} pendiente</span><button class="button button-secondary" data-action="pay-debt" data-id="${escapeHtml(debt.id)}">Registrar abono</button><button class="button button-quiet" data-action="forgive-debt" data-id="${escapeHtml(debt.id)}">Perdonar</button>`;
      return `<div class="debt-item"><div class="debt-item-main"><strong>${escapeHtml(debt.description || (debt.source === "expense" ? "Cuenta compartida" : "Deuda registrada"))}</strong><small>${escapeHtml(dateLabel(debt.date || debt.createdAt.slice(0, 10)))} · ${money(debt.amount)}${Number(debt.paidAmount || 0) ? ` · abonado ${money(debt.paidAmount)}` : ""}${Number(debt.forgivenAmount || 0) ? ` · perdonado ${money(debt.forgivenAmount)}` : ""}${Number(debt.offsetAmount || 0) ? ` · compensado ${money(debt.offsetAmount)}` : ""}</small>${eventRows ? `<div class="debt-event-summary">${eventRows}</div>` : ""}</div>
      <div class="debt-item-actions">${debtActions}<button class="button button-quiet" data-action="${sourceTransaction ? "edit-source-debt" : "edit-debt"}" data-id="${escapeHtml(debt.id)}">${sourceTransaction ? "Editar gasto" : "Editar"}</button><button class="button button-danger" data-action="delete-debt" data-id="${escapeHtml(debt.id)}">Eliminar</button></div></div>`;
    }).join("")}</div>
  </article>`;
}

function addDebtWithOffsets(debt, events, debts = state.debts) {
  const opposite = debt.direction === "owed_to_me" ? "i_owe" : "owed_to_me";
  let remaining = debtOutstanding(debt);
  const matches = debts.filter((entry) => entry.id !== debt.id && entry.direction === opposite && entry.personKey === debt.personKey);
  for (const other of matches) {
    const offset = Math.min(remaining, debtOutstanding(other));
    if (offset <= .005) continue;
    debt.offsetAmount = Number(debt.offsetAmount || 0) + offset;
    other.offsetAmount = Number(other.offsetAmount || 0) + offset;
    const createdAt = new Date().toISOString();
    events.push({ id: id(), debtId: debt.id, linkedDebtId: other.id, kind: "offset", amount: offset, date: today(), createdAt });
    events.push({ id: id(), debtId: other.id, linkedDebtId: debt.id, kind: "offset", amount: offset, date: today(), createdAt });
    remaining -= offset;
  }
  return debt;
}

function renderDebts() {
  const incomingGroups = debtGroups("owed_to_me");
  const outgoingGroups = debtGroups("i_owe");
  const incomingTotal = incomingGroups.reduce((sum, group) => sum + group.total, 0);
  const outgoingTotal = outgoingGroups.reduce((sum, group) => sum + group.total, 0);
  const history = state.debts.filter((debt) => debtOutstanding(debt) <= .005);
  root.innerHTML = `${pageHeading("Cuentas claras entre personas", "Me deben / Debo", "Reúne las cuentas compartidas, registra abonos parciales y conserva el historial.", `<button class="button button-secondary" data-action="new-debt" data-direction="i_owe">＋ Registrar deuda</button>`)}
    <section class="debt-summary-grid">
      <article class="debt-summary-card"><span>Te deben</span><strong class="green-text">${money(incomingTotal)}</strong><small>${incomingGroups.length} ${incomingGroups.length === 1 ? "persona" : "personas"}</small></article>
      <article class="debt-summary-card"><span>Debes</span><strong class="red-text">${money(outgoingTotal)}</strong><small>${outgoingGroups.length} ${outgoingGroups.length === 1 ? "persona" : "personas"}</small></article>
    </section>
    <section class="panel debt-section"><div class="panel-heading"><div><h2>Me deben</h2><p>Anticipos y gastos compartidos, agrupados por persona.</p></div><button class="button button-secondary" data-action="new-debt" data-direction="owed_to_me">＋ Añadir</button></div>
      ${incomingGroups.length ? `<div class="debt-groups">${incomingGroups.map((group) => debtGroupCard(group, "owed_to_me")).join("")}</div>` : emptyState("Nadie te debe dinero", "Al dividir una cuenta, los anticipos se añaden aquí automáticamente.")}</section>
    <section class="panel debt-section"><div class="panel-heading"><div><h2>Debo</h2><p>Lo que otras personas han adelantado por ti.</p></div><button class="button button-secondary" data-action="new-debt" data-direction="i_owe">＋ Añadir</button></div>
      ${outgoingGroups.length ? `<div class="debt-groups">${outgoingGroups.map((group) => debtGroupCard(group, "i_owe")).join("")}</div>` : emptyState("No tienes deudas pendientes", "Añade una deuda cuando alguien pague por ti.")}</section>
    ${history.length ? `<section class="panel debt-section"><div class="panel-heading"><div><h2>Historial liquidado</h2><p>Abonos y condonaciones conservados para consulta.</p></div></div><div class="debt-groups">${debtGroups("owed_to_me", true).filter((group) => group.debts.some((debt) => debtOutstanding(debt) <= .005)).map((group) => debtGroupCard({ ...group, debts: group.debts.filter((debt) => debtOutstanding(debt) <= .005) }, "owed_to_me")).join("")}${debtGroups("i_owe", true).filter((group) => group.debts.some((debt) => debtOutstanding(debt) <= .005)).map((group) => debtGroupCard({ ...group, debts: group.debts.filter((debt) => debtOutstanding(debt) <= .005) }, "i_owe")).join("")}</div></section>` : ""}`;
}

function renderStats() {
  const inRange = (tx) => {
    if (state.statsPeriod === "today") return tx.date === today();
    if (state.statsPeriod === "day") return tx.date === state.statsDay;
    if (state.statsPeriod === "range") return tx.date >= state.statsFrom && tx.date <= state.statsTo;
    return transactionInPeriod(tx, state.statsPeriod);
  };
  let txs = state.transactions.filter((tx) => tx.confirmed && tx.date <= today() && inRange(tx) &&
    (!state.statsAccounts.length || state.statsAccounts.includes(tx.accountId) || state.statsAccounts.includes(tx.toAccountId)) &&
    (!state.statsTags.length || state.statsTags.some((tagId) => transactionMatchesTag(tx, tagId))));
  const projectionEvents = state.transactions.filter((tx) =>
    (tx.type === "income" || tx.type === "expense") && (tx.date >= today() || !tx.confirmed) && inRange({ date: tx.date < today() ? today() : tx.date }) &&
    (!state.statsAccounts.length || state.statsAccounts.includes(tx.accountId)) &&
    (!state.statsTags.length || state.statsTags.some((tagId) => transactionMatchesTag(tx, tagId)))
  ).map((tx) => ({ date: tx.date < today() ? today() : tx.date, income: tx.type === "income" ? Number(tx.amount) : 0, expense: tx.type === "expense" ? expenseAmount(tx) : 0, cashExpense: tx.type === "expense" ? Number(tx.amount) : 0 }));
  if (!state.statsTags.length) {
    for (const debt of state.debts.filter((entry) => entry.direction === "owed_to_me" && (!state.statsAccounts.length || !entry.accountId || state.statsAccounts.includes(entry.accountId)))) {
      const date = debt.date >= today() ? debt.date : today();
      if (inRange({ date })) projectionEvents.push({ date, income: debtOutstanding(debt), expense: 0, cashExpense: 0 });
    }
  }
  const currentProjectionBalance = getVisibleAccounts()
    .filter((account) => !state.statsAccounts.length || state.statsAccounts.includes(account.id))
    .reduce((sum, account) => sum + accountBalance(account, state.transactions), 0);
  const projectionByDate = new Map();
  for (const event of projectionEvents) {
    const totals = projectionByDate.get(event.date) || { income: 0, expense: 0, cashExpense: 0 };
    totals.income += event.income;
    totals.expense += event.expense;
    totals.cashExpense += event.cashExpense;
    projectionByDate.set(event.date, totals);
  }
  const projectionDates = [...projectionByDate.keys()].sort();
  let runningBalance = currentProjectionBalance;
  const projectionBars = projectionDates.map((date) => {
    const totals = projectionByDate.get(date);
    runningBalance += totals.income - totals.cashExpense;
    return { date, ...totals, balance: runningBalance };
  });
  const projectionScale = Math.max(1, ...projectionBars.flatMap((entry) => [entry.income, entry.expense, Math.abs(entry.balance)]));
  const projectionChart = projectionBars.length ? projectionBars.map((entry) => {
    const label = formatDate(entry.date);
    return `<div class="projection-group" aria-label="${escapeHtml(label)}: ingresos ${money(entry.income)}, gastos ${money(entry.expense)}, balance proyectado ${money(entry.balance)}"><div class="projection-bars"><span class="projection-bar income" style="height:${Math.max(3, entry.income / projectionScale * 100)}%" title="Ingresos ${money(entry.income)}"></span><span class="projection-bar expense" style="height:${Math.max(3, entry.expense / projectionScale * 100)}%" title="Gastos ${money(entry.expense)}"></span><span class="projection-bar balance" style="height:${Math.max(3, Math.abs(entry.balance) / projectionScale * 100)}%" title="Balance ${money(entry.balance)}"></span></div><small>${escapeHtml(label)}</small><b>${money(entry.balance)}</b></div>`;
  }).join("") : emptyState("Sin previsiones para este periodo", "Los movimientos previstos y las deudas pendientes aparecerán aquí.");
  const income = txs.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount), 0);
  const expense = txs.filter((tx) => tx.type === "expense" || tx.type === "debt_payment").reduce((sum, tx) => sum + expenseAmount(tx), 0);
  const projectedIncome = projectionEvents.reduce((sum, event) => sum + event.income, 0);
  const projectedExpense = projectionEvents.reduce((sum, event) => sum + event.expense, 0);
  const projectedBalance = projectionBars.at(-1)?.balance ?? currentProjectionBalance;
  const saving = txs.filter((tx) => tx.type === "saving").reduce((sum, tx) => sum + Number(tx.amount), 0);
  const byTag = new Map();
  for (const tx of txs.filter((entry) => entry.type === "expense" || entry.type === "debt_payment")) {
    const tagIds = transactionTagIds(tx);
    for (const tagId of tagIds.length ? tagIds : [null]) {
      const tag = state.tags.find((entry) => entry.id === tagId);
      const name = tag?.parentId ? `${tag.parentName || tagName(tag.parentId, state.tags)} › ${tag.name}` : tag?.name || "Sin etiqueta";
      byTag.set(name, (byTag.get(name) || 0) + expenseAmount(tx));
    }
  }
  const topTags = [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxTag = Math.max(1, ...topTags.map(([, value]) => value));
  const overCount = state.budgets.filter((budget) => budgetProgress(budget, state.transactions) > budget.amount).length;
  const rescueCount = state.transactions.filter((tx) => tx.type === "expense" && ((tx.savingsDraws || []).length || tx.savingsGoalId)).length;
  const boughtGoals = state.goals.filter((goal) => goal.completedAt).length;
  const collectedDebts = state.transactions.filter((tx) => tx.type === "debt_collection").reduce((sum, tx) => sum + Number(tx.amount), 0);
  const forgivenDebts = state.debtEvents.filter((event) => event.kind === "forgiveness" || (event.kind === "adjusted" && event.reversesKind === "forgiveness")).reduce((sum, event) => sum + Number(event.amount), 0);
  const insight = buildInsight(txs);
  const dateControls = state.statsPeriod === "day"
    ? dateInput("statsDay", state.statsDay, { id: "stats-day", required: true })
    : state.statsPeriod === "range"
      ? `<label class="date-filter">Desde ${dateInput("statsFrom", state.statsFrom, { id: "stats-from", required: true })}</label><label class="date-filter">Hasta ${dateInput("statsTo", state.statsTo, { id: "stats-to", required: true })}</label>`
      : "";
  root.innerHTML = `${pageHeading("Entiende tus hábitos", "Estadísticas", "Una lectura clara de tus ingresos, gastos, etiquetas y decisiones.", `<button class="button button-secondary" data-action="export-data">↓ Exportar copia</button>`)}
    <section class="panel">
      <div class="filter-row"><select class="filter-control" id="stats-period"><option value="today" ${state.statsPeriod === "today" ? "selected" : ""}>Hoy</option><option value="month" ${state.statsPeriod === "month" ? "selected" : ""}>Este mes</option><option value="year" ${state.statsPeriod === "year" ? "selected" : ""}>Este año</option><option value="day" ${state.statsPeriod === "day" ? "selected" : ""}>Un día</option><option value="range" ${state.statsPeriod === "range" ? "selected" : ""}>Rango personalizado</option><option value="all" ${state.statsPeriod === "all" ? "selected" : ""}>Todo el historial</option></select>${dateControls}
      <button class="filter-control" type="button" data-action="stats-accounts">${state.statsAccounts.length ? `${state.statsAccounts.length} cuenta${state.statsAccounts.length === 1 ? "" : "s"}` : "Todas las cuentas"}</button>
      <button class="filter-control" type="button" data-action="stats-tags">${state.statsTags.length ? `${state.statsTags.length} etiqueta${state.statsTags.length === 1 ? "" : "s"}` : "Todas las etiquetas"}</button></div>
      <div class="panel-heading"><div><h2>Flujo y balance proyectado</h2><p>Movimientos reales y previstos, incluidos cobros pendientes</p></div></div>
      <div class="projection-chart">${projectionChart}</div>
      <div class="chart-legend projection-legend"><span>Ingresos y cobros</span><span>Gastos</span><span>Balance proyectado</span></div>
      <div class="goal-grid">
        <div class="goal-card"><small>Ingresos confirmados</small><strong class="green-text" style="font-size:20px;margin-top:8px">${money(income)}</strong></div>
        <div class="goal-card"><small>Gastos confirmados</small><strong class="red-text" style="font-size:20px;margin-top:8px">${money(expense)}</strong></div>
        <div class="goal-card"><small>Aportado a ahorros</small><strong style="font-size:20px;margin-top:8px">${money(saving)}</strong></div>
        <div class="goal-card"><small>Balance del periodo</small><strong class="${moneyClass(income - expense)}" style="font-size:20px;margin-top:8px">${money(income - expense)}</strong></div>
        <div class="goal-card"><small>Ingresos y cobros previstos</small><strong class="green-text" style="font-size:20px;margin-top:8px">${money(projectedIncome)}</strong></div>
        <div class="goal-card"><small>Gastos previstos</small><strong class="red-text" style="font-size:20px;margin-top:8px">${money(projectedExpense)}</strong></div>
        <div class="goal-card"><small>Saldo al final de la previsión</small><strong class="${moneyClass(projectedBalance)}" style="font-size:20px;margin-top:8px">${money(projectedBalance)}</strong></div>
      </div>
    </section>
    <section class="two-panels">
      <article class="panel"><div class="panel-heading"><div><h2>Gastos por etiqueta</h2><p>Las etiquetas principales y subetiquetas se filtran por igual</p></div></div>
        ${topTags.length ? topTags.map(([name, value]) => `<div class="budget-item"><div class="budget-line"><strong>${escapeHtml(name)}</strong><span>${money(value)}</span></div><div class="progress-track"><div class="progress-fill" style="width:${value / maxTag * 100}%"></div></div></div>`).join("") : emptyState("Aún sin datos", "Tus gastos aparecerán al registrar movimientos.")}</article>
      <article class="panel"><div class="panel-heading"><div><h2>Inteligencia financiera</h2><p>Ideas automáticas a partir de tus datos locales</p></div><span>✦</span></div>${insight}</article>
    </section>
    <section class="panel" style="margin-top:19px"><div class="panel-heading"><div><h2>Auditoría del historial</h2><p>Los registros ocultos siguen incluidos en tus métricas.</p></div></div>
      <div class="goal-grid"><div class="goal-card"><small>Presupuestos superados</small><strong style="font-size:20px;margin-top:8px">${overCount}</strong></div><div class="goal-card"><small>Gastos que usaron ahorros</small><strong style="font-size:20px;margin-top:8px">${rescueCount}</strong></div><div class="goal-card"><small>Objetivos completados</small><strong style="font-size:20px;margin-top:8px">${boughtGoals}</strong></div><div class="goal-card"><small>Devoluciones recibidas</small><strong style="font-size:20px;margin-top:8px">${money(collectedDebts)}</strong></div><div class="goal-card"><small>Deudas perdonadas</small><strong style="font-size:20px;margin-top:8px">${money(forgivenDebts)}</strong></div><div class="goal-card"><small>Movimientos conservados</small><strong style="font-size:20px;margin-top:8px">${state.transactions.length}</strong></div></div>
      ${rescueCount ? `<div class="insight-card"><strong>Detalle de dinero tomado de ahorros</strong>${state.transactions.filter((tx) => tx.type === "expense" && ((tx.savingsDraws || []).length || tx.savingsGoalId)).map((tx) => `<p>${escapeHtml(dateLabel(tx.date))} · gasto ${money(tx.amount)} · ${(tx.savingsDraws || [{ goalId: tx.savingsGoalId, amount: tx.savingsUsed }]).map((draw) => `${escapeHtml(state.goals.find((goal) => goal.id === draw.goalId)?.name || "Objetivo")}: ${money(draw.amount)}`).join(", ")}</p>`).join("")}</div>` : ""}
    </section>`;
}

function buildInsight(txs) {
  const currentMonth = monthKey();
  const previous = monthOffset(-1);
  const currentExpenses = txs.filter((tx) => (tx.type === "expense" || tx.type === "debt_payment") && tx.date.slice(0, 7) === currentMonth);
  if (!currentExpenses.length) return `<div class="insight-card"><strong>Todo empieza con observar</strong><p>Cuando registres algunos gastos, aparecerán aquí patrones de consumo y sugerencias prácticas. No se envían datos a ningún servidor.</p></div>`;
  const totals = new Map();
  currentExpenses.forEach((tx) => {
    const ids = transactionTagIds(tx);
    for (const tagId of ids.length ? ids : [null]) {
      const tag = state.tags.find((entry) => entry.id === tagId);
      const name = tag?.parentId ? `${tag.parentName || tagName(tag.parentId, state.tags)} › ${tag.name}` : tag?.name || "Sin etiqueta";
      totals.set(name, (totals.get(name) || 0) + expenseAmount(tx));
    }
  });
  const [biggest, amount] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  const prevTotal = state.transactions.filter((tx) => tx.confirmed && (tx.type === "expense" || tx.type === "debt_payment") && tx.date.slice(0, 7) === previous &&
    (!state.statsAccounts.length || state.statsAccounts.includes(tx.accountId) || state.statsAccounts.includes(tx.toAccountId)) &&
    (!state.statsTags.length || state.statsTags.some((tagId) => transactionMatchesTag(tx, tagId)))).reduce((sum, tx) => sum + expenseAmount(tx), 0);
  const currentTotal = currentExpenses.reduce((sum, tx) => sum + expenseAmount(tx), 0);
  const change = prevTotal ? Math.round((currentTotal - prevTotal) / prevTotal * 100) : null;
  const message = change === null
    ? `Tu mayor etiqueta de gasto este mes es «${biggest}», con ${money(amount)}. Tenerla a la vista puede ayudarte a decidir si refleja tus prioridades.`
    : `Tu gasto registrado va ${Math.abs(change)}% ${change > 0 ? "por encima" : "por debajo"} del mes pasado. «${biggest}» concentra ${money(amount)}; revisa si hay margen para ajustar.`;
  const spentBudgets = state.budgets.filter((budget) => budget.period === currentMonth && !budget.hidden && budgetStatus(budget) === "over");
  return `<div class="insight-card"><strong>Una pista para reflexionar</strong><p>${escapeHtml(message)}</p></div>${spentBudgets.length ? `<div class="insight-card"><strong>Tu atención puede estar aquí</strong><p>${spentBudgets.length} presupuesto(s) ya superan su límite. Ajustar el plan es tan válido como mantenerlo.</p></div>` : `<div class="insight-card"><strong>Buen seguimiento</strong><p>Registrar los movimientos con constancia hace que estas comparaciones sean más útiles.</p></div>`}`;
}

function renderSettings() {
  const tags = state.tags.filter((tag) => tagRole(tag, "main"));
  const accounts = state.accounts.filter((account) => !account.archived);
  root.innerHTML = `${pageHeading("Privacidad y control", "Ajustes y copias", "Gestiona tus cuentas y etiquetas, y conserva siempre una copia portable de tus datos.", `<button class="button button-primary" data-action="export-data">↓ Exportar datos</button>`)}
    <section class="panel settings-section"><div class="panel-heading"><div><h2>Cuentas</h2><p>Elimina una cuenta dando de baja o redistribuyendo su saldo.</p></div><button class="button button-secondary" data-action="new-account">＋ Añadir cuenta</button></div>
      ${accounts.length ? accounts.map((account) => {
        const figures = accountFigures(account, accounts, state.transactions, state.goals, state.debts);
        return `<div class="account-row" style="${account.archived ? "opacity:.55" : ""}"><div class="account-name"><span>${escapeHtml(account.name)}${account.archived ? `<small>Eliminada</small>` : ""}</span></div><div class="transaction-actions"><span class="account-amount">${money(figures.balance)}</span><button class="button button-quiet" data-action="edit-account" data-id="${escapeHtml(account.id)}">Editar</button>${account.archived ? `<button class="button button-secondary" data-action="restore-account" data-id="${escapeHtml(account.id)}">Restaurar</button>` : `<button class="button button-quiet" data-action="archive-account" data-id="${escapeHtml(account.id)}">Eliminar</button>`}</div></div>`;
      }).join("") : emptyState("Sin cuentas", "Añade una para comenzar.")}</section>
    <section class="panel settings-section"><div class="panel-heading"><div><h2>Etiquetas</h2><p>Se crean sobre la marcha y se pueden reutilizar en cualquier movimiento o presupuesto.</p></div><button class="button button-secondary" data-action="new-tag">＋ Nueva etiqueta</button></div>
      ${["expense", "income"].map((kind) => {
        const group = tags.filter((tag) => !tag.kind || tag.kind === kind);
        const label = (tag, role) => `<span class="tag-chip"><strong>${escapeHtml(tag.name)}</strong><small>${role}</small>${tag.requireSubcategory ? " · requiere subetiqueta" : ""}<button data-action="edit-tag" data-id="${escapeHtml(tag.id)}" aria-label="Editar etiqueta">✎</button><button data-action="delete-tag" data-id="${escapeHtml(tag.id)}" aria-label="Eliminar etiqueta">×</button></span>`;
        const renderTagTree = (tag, depth = 0, path = new Set()) => {
          if (path.has(tag.id)) return "";
          const nextPath = new Set(path).add(tag.id);
          const children = state.tags.filter((child) => tagParents(child).includes(tag.id) && (!child.kind || child.kind === kind));
          const role = depth ? tag.hierarchy === "flexible" ? "Subetiqueta · también principal" : "Subetiqueta" : tag.hierarchy === "flexible" ? "Principal o subetiqueta" : "Principal";
          return `<div style="margin:0 0 7px ${depth ? 18 : 0}px">${label(tag, role)}${children.map((child) => renderTagTree(child, depth + 1, nextPath)).join("")}</div>`;
        };
        return `<div class="tag-section"><h3>${kind === "expense" ? "Gastos" : "Ingresos"}</h3>${group.length ? group.map((tag) => renderTagTree(tag)).join("") : emptyState("Aún sin etiquetas", `Crea etiquetas independientes para ${kind === "expense" ? "gastos" : "ingresos"}.`)}</div>`;
      }).join("")}</section>
    <section class="panel settings-section"><h2>Copia y recuperación</h2><p>La base de datos vive en IndexedDB de este navegador. Exporta una copia JSON periódicamente y guárdala en un lugar seguro. Al importar se reemplazarán los datos locales actuales.</p>
      <div class="heading-actions"><button class="button button-primary" data-action="export-data">Descargar copia JSON</button><label class="button button-secondary file-button">Importar copia<input type="file" id="import-file" accept="application/json,.json"></label></div>
      <div class="insight-card"><strong>Privacidad local</strong><p>No hay backend ni sincronización en la nube. Si borras los datos del navegador o pierdes el dispositivo, la copia exportada será necesaria para recuperar la información.</p></div></section>`;
}

function render() {
  if (!root) return;
  if (state.view === "home") renderHome();
  else if (state.view === "activity") renderActivity();
  else if (state.view === "budgets") renderBudgets();
  else if (state.view === "savings") renderSavings();
  else if (state.view === "debts") renderDebts();
  else if (state.view === "stats") renderStats();
  else renderSettings();
}

async function refresh() {
  [state.accounts, state.transactions, state.tags, state.budgets, state.goals, state.debts, state.debtEvents] = await Promise.all([
    db.getAll("accounts"), db.getAll("transactions"), db.getAll("tags"), db.getAll("budgets"), db.getAll("goals"), db.getAll("debts"), db.getAll("debtEvents")
  ]);
  const legacyTags = state.tags.filter((tag) => !tag.kind);
  if (legacyTags.length) {
    const incomeUse = new Set();
    const expenseUse = new Set();
    for (const tx of state.transactions) {
      const target = tx.type === "income" ? incomeUse : expenseUse;
      transactionTagIds(tx).forEach((tagId) => target.add(tagId));
    }
    const clonedIds = new Map();
    for (const tag of legacyTags) {
      if (incomeUse.has(tag.id) && expenseUse.has(tag.id)) {
        tag.kind = "expense";
        clonedIds.set(tag.id, id());
      }
      else tag.kind = incomeUse.has(tag.id) ? "income" : "expense";
    }
    const legacyById = new Map(legacyTags.map((tag) => [tag.id, tag]));
    const cloneTag = (tagId) => {
      if (clonedIds.has(tagId)) return;
      const tag = legacyById.get(tagId);
      if (!tag || tag.kind === "income") return;
      clonedIds.set(tagId, id());
      if (tag.parentId) cloneTag(tag.parentId);
    };
    for (const tag of legacyTags.filter((entry) => clonedIds.has(entry.id))) {
      if (tag.parentId) cloneTag(tag.parentId);
    }
    const clones = legacyTags.filter((tag) => clonedIds.has(tag.id)).map((tag) => ({
      ...tag,
      id: clonedIds.get(tag.id),
      kind: "income",
      parentId: clonedIds.get(tag.parentId) || (state.tags.find((parent) => parent.id === tag.parentId)?.kind === "income" ? tag.parentId : null)
    }));
    clones.forEach((tag) => { tag.parentName = clones.find((parent) => parent.id === tag.parentId)?.name || ""; });
    const incomeTransactions = state.transactions.filter((tx) => tx.type === "income" && transactionTagIds(tx).some((tagId) => clonedIds.has(tagId))).map((tx) => {
      const remap = (tagId) => clonedIds.get(tagId) || tagId;
      return { ...tx, tagIds: (tx.tagIds || []).map(remap), tagId: remap(tx.tagId), subtagId: remap(tx.subtagId) };
    });
    await db.putMany({ tags: [...legacyTags, ...clones], transactions: incomeTransactions });
    state.tags.push(...clones);
    for (const updated of incomeTransactions) {
      const index = state.transactions.findIndex((tx) => tx.id === updated.id);
      if (index >= 0) state.transactions[index] = updated;
    }
  }
  const normalizedTags = [];
  state.tags = state.tags.map((tag) => {
    const parentIds = [...new Set([...(tag.parentIds || []), tag.parentId].filter(Boolean))];
    const normalized = {
      ...tag,
      hierarchy: tag.hierarchy || (parentIds.length ? "sub" : "flexible"),
      parentIds,
      parentId: parentIds[0] || null,
      parentName: parentIds.length ? state.tags.find((parent) => parent.id === parentIds[0])?.name || "" : ""
    };
    if (JSON.stringify(normalized) !== JSON.stringify(tag)) normalizedTags.push(normalized);
    return normalized;
  });
  if (normalizedTags.length) await db.putMany({ tags: normalizedTags });
  render();
}

function accountForm(account) {
  const editing = Boolean(account);
  showDialog(editing ? "Editar cuenta" : "Nueva cuenta", "Tu saldo inicial se usa como punto de partida del historial.", `
    <form data-form="account" data-id="${editing ? escapeHtml(account.id) : ""}">
      <div class="form-grid">
        <div class="field full"><label for="account-name">Nombre</label><input id="account-name" name="name" required maxlength="45" placeholder="Ej. Mi banco" value="${escapeHtml(account?.name || "")}"></div>
        ${editing ? "" : `<div class="field full"><label for="opening-balance">Saldo actual inicial (€)</label><input id="opening-balance" name="openingBalance" type="number" step="0.01" value="0" required><span class="field-hint">Puedes empezar en 0 y hacer un ajuste manual más adelante.</span></div>`}
      </div><div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary" type="submit">${editing ? "Guardar cambios" : "Crear cuenta"}</button></div>
    </form>`);
}

function refreshTagCascadePicker(container, kind) {
  const selected = $$('input[name="tagIds"]:checked', container).map((input) => input.value);
  const revealAll = container.id === "purchase-tag-picker";
  const allowCreate = ["transaction-tag-picker", "purchase-tag-picker", "budget-tag-picker"].includes(container.id);
  container.innerHTML = tagCascadePicker(kind, selected, allowCreate, { revealAll });
}

function transactionForm(defaultType = "expense", existing = null) {
  const editing = Boolean(existing);
  if (!getVisibleAccounts().length) {
    showDialog("Primero crea una cuenta", "Necesitas al menos una cuenta para registrar un movimiento.", `<div class="empty-state"><strong>Sin cuentas disponibles</strong><span>Añade un monedero o cuenta bancaria y vuelve aquí.</span><div style="margin-top:14px"><button class="button button-primary" data-action="new-account">Crear cuenta</button></div></div>`);
    return;
  }
  const selectedTags = [...new Set([...(existing ? transactionTagIds(existing) : []), ...(state.transactionDraft?.tagIds || [])])];
  const draft = state.transactionDraft || {};
  const shares = existing?.shares?.length ? existing.shares.map((share) => expenseShareRow(share.person, share.amount)).join("") : expenseShareRow();
  showDialog(editing ? "Editar movimiento" : "Nuevo movimiento", "Elige una o varias etiquetas de la sección correspondiente.", `
    <form data-form="transaction" data-id="${editing ? escapeHtml(existing.id) : ""}">
      <div class="form-grid">
        <div class="field"><label for="tx-type">Tipo</label><select id="tx-type" name="type"><option value="expense" ${defaultType === "expense" ? "selected" : ""}>Gasto</option><option value="income" ${defaultType === "income" ? "selected" : ""}>Ingreso</option></select></div>
        <div class="field"><label for="tx-amount">Importe (€)</label><input id="tx-amount" name="amount" required type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" value="${escapeHtml(draft.amount || (existing ? Number(existing.amount).toFixed(2) : ""))}"></div>
        <div class="field"><label for="tx-account">Cuenta</label><select id="tx-account" name="accountId" required>${accountOptions(draft.accountId || existing?.accountId || getVisibleAccounts()[0]?.id)}</select></div>
        <div class="field"><label for="tx-date">Fecha (DD/MM/YYYY)</label>${dateInput("date", draft.date || existing?.date || today(), { id: "tx-date", required: true })}</div>
        <div class="field full"><label>Etiquetas de ${defaultType === "income" ? "ingresos" : "gastos"}</label><div id="transaction-tag-picker">${tagCascadePicker(defaultType, selectedTags)}</div></div>
        <div class="field full"><label for="tx-note">Nota (opcional)</label><input id="tx-note" name="note" maxlength="100" placeholder="Un detalle para recordar" value="${escapeHtml(draft.note || existing?.note || "")}"></div>
        <div class="field full" id="expense-sharing" ${defaultType === "income" ? "hidden" : ""}>
          <label class="checkbox-field"><input type="checkbox" name="splitEnabled" id="split-enabled" ${existing?.shares?.length ? "checked" : ""}><span>Dividir esta cuenta: otras personas me deben su parte</span></label>
          <div id="split-fields" ${existing?.shares?.length ? "" : "hidden"}>
            <div class="field" style="margin-top:12px"><label for="own-share">Mi parte (€)</label><input id="own-share" name="ownAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Automática: total menos las otras partes" value="${existing?.ownAmount === undefined ? "" : Number(existing.ownAmount).toFixed(2)}"><span class="field-hint">Si lo dejas vacío, tu parte se calcula como el resto.</span></div>
            <div id="expense-share-list" class="expense-share-list">${shares}</div>
            <button type="button" class="button button-secondary" data-action="add-expense-share">＋ Añadir persona</button>
          </div>
        </div>
        <label class="checkbox-field field full" id="pending-income-wrap" ${defaultType === "income" ? "" : "hidden"}><input type="checkbox" name="pending" id="pending-income" ${draft.pending || (existing?.confirmed === false) ? "checked" : ""}><span id="pending-transaction-label">${defaultType === "income" ? "Ingreso" : "Gasto"} previsto: no sumarlo al saldo hasta confirmar que ocurrió</span></label>
      </div><div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary" type="submit">Guardar movimiento</button></div>
    </form>`);
  const pendingWrap = $("#pending-income-wrap", dialog);
  if (pendingWrap) pendingWrap.hidden = false;
  const splitToggle = $("#split-enabled", dialog);
  if (splitToggle && draft.splitEnabled) {
    splitToggle.checked = true;
    $("#split-fields", dialog).hidden = false;
  }
  const pendingBox = $("#pending-income", dialog);
  if (pendingBox && (draft.pending || existing?.confirmed === false || (existing?.date || draft.date || "") > today())) {
    pendingBox.checked = true;
    if (defaultType === "expense") $("#expense-sharing", dialog).hidden = true;
  }
  if (state.transactionDraft) {
    const form = $('form[data-form="transaction"]', dialog);
    for (const [name, value] of Object.entries(state.transactionDraft)) {
      if (["tagIds", "amount", "accountId", "date", "note", "pending"].includes(name)) continue;
      const field = form.elements.namedItem(name);
      if (field && field.type === "checkbox") field.checked = Boolean(value);
      else if (field) field.value = value;
    }
    state.transactionDraft = null;
  }
}

function expenseShareRow(person = "", amount = "") {
  return `<div class="share-row"><div class="field"><label>Persona</label><input name="sharePerson" maxlength="60" placeholder="Ej. Andrea" value="${escapeHtml(person)}"></div><div class="field"><label>Su parte (€)</label><input name="shareAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" value="${escapeHtml(amount)}"></div><button type="button" class="button button-quiet" data-action="remove-expense-share" aria-label="Quitar persona">×</button></div>`;
}

function transferForm() {
  if (getVisibleAccounts().length < 2) {
    notify("Necesitas al menos dos cuentas para hacer un traspaso.");
    return;
  }
  const accounts = getVisibleAccounts();
  showDialog("Traspasar dinero", "El movimiento se registra en el historial, sin alterar el patrimonio total.", `
    <form data-form="transfer"><div class="form-grid">
      <div class="field"><label>Desde</label><select name="accountId">${accountOptions(accounts[0].id)}</select></div>
      <div class="field"><label>Hacia</label><select name="toAccountId">${accounts.map((a, i) => `<option value="${escapeHtml(a.id)}" ${i === 1 ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Importe (€)</label><input name="amount" type="number" min="0.01" step="0.01" required></div>
      <div class="field"><label>Fecha (DD/MM/YYYY)</label>${dateInput("date", today(), { required: true })}</div>
      <div class="field full"><label>Nota (opcional)</label><input name="note" maxlength="100"></div>
    </div><div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">Traspasar</button></div></form>`);
}

function accountFilterDialog(targetView) {
  const selected = targetView === "stats" ? state.statsAccounts : state.selectedAccounts;
  showDialog("Filtrar por cuentas", "Selecciona una o varias cuentas. Si no marcas ninguna, se incluirán todas.", `
    <form data-form="account-filter" data-target="${targetView}">
      <label class="checkbox-field" style="padding:10px 0;border-bottom:1px solid var(--line)"><input type="checkbox" name="all" ${selected.length ? "" : "checked"}><strong>Todas las cuentas</strong></label>
      <div class="check-list">${getVisibleAccounts().map((account) => `<label class="checkbox-field" style="padding:10px 0;border-bottom:1px solid var(--line)"><input type="checkbox" name="accountId" value="${escapeHtml(account.id)}" ${selected.includes(account.id) ? "checked" : ""}>${escapeHtml(account.name)}</label>`).join("")}</div>
      <div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">Aplicar filtro</button></div>
    </form>`);
}

function tagFilterDialog() {
  showDialog("Filtrar por etiquetas", "Se incluyen los movimientos que coincidan con cualquiera de las etiquetas seleccionadas.", `
    <form data-form="tag-filter">
      <label class="checkbox-field" style="padding:10px 0;border-bottom:1px solid var(--line)"><input type="checkbox" name="all" ${state.statsTags.length ? "" : "checked"}><strong>Todas las etiquetas</strong></label>
      <div class="check-list">${[...state.tags].sort((a, b) => a.name.localeCompare(b.name, "es")).map((tag) => `<label class="checkbox-field" style="padding:10px 0;border-bottom:1px solid var(--line)"><input type="checkbox" name="tagId" value="${escapeHtml(tag.id)}" ${state.statsTags.includes(tag.id) ? "checked" : ""}>${escapeHtml(tag.name)}</label>`).join("")}</div>
      <div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">Aplicar filtro</button></div>
    </form>`);
}

function debtForm(direction = "i_owe", existing = null) {
  const accounts = getVisibleAccounts();
  const selectedAccount = existing?.accountId || accounts[0]?.id || "";
  showDialog(existing ? "Editar deuda" : direction === "owed_to_me" ? "Registrar que me deben" : "Registrar una deuda", "La anotación no mueve dinero; registra un pago cuando se liquide.", `
    <form data-form="debt" data-id="${escapeHtml(existing?.id || "")}" data-direction="${direction}">
      <div class="form-grid">
        <div class="field"><label>Quién debe</label><select name="direction"><option value="i_owe" ${direction === "i_owe" ? "selected" : ""}>Debo yo a esa persona</option><option value="owed_to_me" ${direction === "owed_to_me" ? "selected" : ""}>Esa persona me debe</option></select></div>
        <div class="field"><label>Persona</label><input name="person" maxlength="60" required placeholder="Ej. Andrea" value="${escapeHtml(existing?.person || "")}"></div>
        <div class="field"><label>Importe (€)</label><input name="amount" type="number" min="0.01" step="0.01" required value="${existing ? Number(existing.amount).toFixed(2) : ""}"></div>
        <div class="field"><label>Fecha (DD/MM/YYYY)</label>${dateInput("date", existing?.date || today(), { required: true })}</div>
        <div class="field"><label>Cuenta de retención (si te deben)</label><select name="accountId"><option value="">Selecciona una cuenta</option>${accounts.map((account) => `<option value="${escapeHtml(account.id)}" ${account.id === selectedAccount ? "selected" : ""}>${escapeHtml(account.name)}</option>`).join("")}</select></div>
        <div class="field full"><label>Concepto</label><input name="description" maxlength="100" placeholder="Ej. Cena, entradas, viaje" required value="${escapeHtml(existing?.description || "")}"></div>
      </div>
      <div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">${existing ? "Guardar cambios" : "Guardar deuda"}</button></div>
    </form>`);
}

function debtCollectionForm(tx) {
  const debt = state.debts.find((entry) => entry.id === tx.debtId);
  const event = state.debtEvents.find((entry) => entry.transactionId === tx.id && entry.kind === "payment");
  if (!debt || !event || debt.direction !== "owed_to_me") {
    notify("No se encuentra el abono de deuda que quieres editar.");
    return;
  }
  const accounts = getVisibleAccounts();
  const otherPaid = Number(debt.paidAmount || 0) - Number(event.amount);
  const maximum = Number(debt.amount) - Number(debt.forgivenAmount || 0) - Number(debt.offsetAmount || 0) - otherPaid;
  const extraAmount = tx.settlementGroupId
    ? state.transactions.filter((entry) => entry.settlementGroupId === tx.settlementGroupId && entry.type === "income" && entry.id !== tx.id).reduce((sum, entry) => sum + Number(entry.amount), 0)
    : 0;
  showDialog("Editar abono recibido", `Actualiza el importe, la cuenta o la fecha del abono de ${debt.person}.`, `
    <form data-form="debt-collection" data-id="${escapeHtml(tx.id)}">
      <div class="form-grid">
        <div class="field"><label>Importe recibido (€)</label><input name="amount" type="number" min="0.01" step="0.01" value="${(Number(tx.amount) + extraAmount).toFixed(2)}" required></div>
        <div class="field"><label>Ingresar en la cuenta</label><select name="accountId" required>${accountOptions(tx.accountId)}</select></div>
        <div class="field"><label>Fecha (DD/MM/YYYY)</label>${dateInput("date", tx.date, { required: true })}</div>
        <div class="field full"><label>Nota (opcional)</label><input name="note" maxlength="100" value="${escapeHtml(tx.note || "")}"></div>
      </div>
      <div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">Guardar cambios</button></div>
    </form>`);
}

function debtPaymentForm(debt) {
  const incoming = debt.direction === "owed_to_me";
  const accounts = getVisibleAccounts();
  if (!accounts.length) {
    notify("Crea una cuenta antes de registrar una devolución.");
    accountForm();
    return;
  }
  const outstanding = debtOutstanding(debt);
  const offsetRemaining = incoming ? 0 : Math.max(0, Number(debt.offsetAmount || 0) - Number(debt.offsetPaidAmount || 0));
  const grossDue = outstanding + offsetRemaining;
  const description = incoming
    ? `${debt.person} · quedan ${money(outstanding)} pendientes. Puedes registrar un abono parcial.`
    : `${debt.person} · quedan ${money(outstanding)} pendientes${offsetRemaining ? `, incluidos ${money(offsetRemaining)} compensados. El importe completo es ${money(grossDue)}; solo saldrá de la cuenta el neto.` : ""}`;
  showDialog(incoming ? "Registrar dinero recibido" : "Registrar devolución", description, `
    <form data-form="debt-payment" data-id="${escapeHtml(debt.id)}" data-kind="${incoming ? "income" : "expense"}">
      <div class="form-grid">
        <div class="field"><label>${incoming ? "Abono recibido (€)" : "Importe total de la deuda (€)"}</label><input name="amount" type="number" min="0.01" ${incoming ? "" : `max="${grossDue.toFixed(2)}"`} step="0.01" value="${(incoming ? outstanding : grossDue).toFixed(2)}" required></div>
        <div class="field"><label>${incoming ? "Ingresar en la cuenta" : "Pagar desde la cuenta"}</label><select name="accountId" required>${accountOptions(accounts[0].id)}</select></div>
        <div class="field"><label>Fecha (DD/MM/YYYY)</label>${dateInput("date", today(), { required: true })}</div>
        <div class="field full"><label>Nota (opcional)</label><input name="note" maxlength="100" placeholder="Ej. Me devolvió en efectivo"></div>
        ${!incoming ? `<div class="field full"><label>Etiquetas del gasto</label><div id="debt-tag-picker">${tagCascadePicker("expense", [], false)}</div></div>` : `<div class="field full"><label>Etiquetas del excedente (si recibes de más)</label><div id="debt-tag-picker">${tagCascadePicker("income", [], false)}</div></div>`}
      </div>
      <p class="field-hint">${incoming ? "El importe de la deuda no cuenta como ingreso. Si recibes más, el excedente se registra como ingreso con la etiqueta indicada." : "La devolución se registra como gasto con su etiqueta."}</p>
      <div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">Guardar abono</button></div>
    </form>`);
}

function forgiveDebtForm(debt) {
  const outstanding = debtOutstanding(debt);
  const accounts = getVisibleAccounts();
  if (!accounts.length) {
    notify("Crea una cuenta antes de registrar la condonación como gasto.");
    accountForm();
    return;
  }
  showDialog(debt.direction === "owed_to_me" ? "Perdonar lo que te deben" : "Registrar que te perdonan", `${debt.person} · saldo pendiente ${money(outstanding)}. Esta acción queda anotada en el historial.`, `
    <form data-form="debt-forgiveness" data-id="${escapeHtml(debt.id)}">
      <div class="insight-card"><strong>Condonar ${money(outstanding)}</strong><p>${debt.direction === "owed_to_me" ? "El saldo pendiente dejará de aparecer como dinero que vas a recibir." : "El saldo pendiente dejará de aparecer como una deuda que tienes que pagar."}</p></div>
      <div class="form-grid" style="margin-top:14px"><div class="field"><label>Cuenta del gasto</label><select name="accountId">${accountOptions(debt.accountId || accounts[0].id)}</select></div><div class="field full"><label>Etiquetas del gasto</label><div id="debt-tag-picker">${tagCascadePicker("expense", [], false)}</div></div></div>
      <div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-danger">Confirmar perdón</button></div>
    </form>`);
}

function adjustmentForm(account) {
  const current = accountBalance(account, state.transactions);
  showDialog("Ajustar saldo", "Se registrará la diferencia como un movimiento de ajuste, manteniendo el historial.", `
    <form data-form="adjustment" data-id="${escapeHtml(account.id)}"><div class="form-grid">
      <div class="field full"><label>Cuenta</label><input value="${escapeHtml(account.name)}" disabled></div>
      <div class="field"><label>Saldo calculado</label><input value="${money(current)}" disabled></div>
      <div class="field"><label>Saldo real ahora (€)</label><input name="target" type="number" step="0.01" required value="${current.toFixed(2)}"></div>
      <div class="field full"><label>Motivo (opcional)</label><input name="note" maxlength="100" placeholder="Ej. Corrección de saldo"></div>
    </div><div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">Guardar ajuste</button></div></form>`);
}

function manageAccountsDialog() {
  const accounts = state.accounts.filter((account) => !account.archived);
  showDialog("Gestionar cuentas", "Al eliminar una cuenta deja de aparecer aquí; el historial conserva las operaciones asociadas.", `
    <div class="heading-actions" style="margin-bottom:12px"><button class="button button-primary" data-action="new-account">＋ Añadir cuenta</button></div>
    ${accounts.length ? accounts.map((account) => {
      const figures = accountFigures(account, state.accounts, state.transactions, state.goals, state.debts);
      return `<div class="account-row"><div class="account-name"><span>${escapeHtml(account.name)}</span></div><div class="transaction-actions"><span class="account-amount">${money(figures.balance)}</span><button class="button button-quiet" data-action="adjust-account" data-id="${escapeHtml(account.id)}">Ajustar</button><button class="button button-quiet" data-action="edit-account" data-id="${escapeHtml(account.id)}">Editar</button><button class="button button-quiet" data-action="archive-account" data-id="${escapeHtml(account.id)}">Eliminar</button></div></div>`;
    }).join("") : emptyState("No hay cuentas", "Añade la primera.")}`);
}

function accountTransferRow(accountId, amount = "") {
  const options = getVisibleAccounts().filter((account) => account.id !== accountId);
  return `<div class="share-row account-transfer-row"><div class="field"><label>Cuenta destino</label><select name="destinationId">${options.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join("")}</select></div><div class="field"><label>Importe (€)</label><input name="transferAmount" type="number" min="0.01" step="0.01" value="${amount}" required></div><button type="button" class="button button-quiet" data-action="remove-account-transfer" aria-label="Quitar destino">×</button></div>`;
}

function deleteAccountForm(account) {
  const balance = accountBalance(account, state.transactions);
  const reserved = accountFigures(account, state.accounts, state.transactions, state.goals, state.debts).reserved;
  const destinations = getVisibleAccounts().filter((entry) => entry.id !== account.id);
  showDialog(`Eliminar «${account.name}»`, `Saldo actual ${money(balance)}. La cuenta desaparecerá definitivamente; las operaciones históricas se conservarán.`, `
    <form data-form="account-delete" data-id="${escapeHtml(account.id)}" data-balance="${balance.toFixed(2)}" data-reserved="${reserved.toFixed(2)}">
      <div class="field"><label class="checkbox-field"><input type="radio" name="mode" value="writeoff" checked><span>Dar de baja el saldo restante</span></label></div>
      ${destinations.length && balance > .005 ? `<div class="field" style="margin-top:15px"><label class="checkbox-field"><input type="radio" name="mode" value="transfer"><span>Repartir y traspasar el saldo</span></label></div><div id="account-transfer-list" class="expense-share-list" hidden>${accountTransferRow(account.id, balance.toFixed(2))}</div><button type="button" class="button button-secondary" data-action="add-account-transfer" hidden>＋ Añadir destino</button><p class="field-hint">Para mantener los ahorros reservados, la primera cuenta destino debe recibir al menos ${money(reserved)}.</p>` : ""}
      <div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-danger">Eliminar cuenta</button></div>
    </form>`);
}

function tagForm(tag, kind = tag?.kind || "expense", initialParents = []) {
  const defaultHierarchy = initialParents.length ? "sub" : "flexible";
  showDialog(tag ? "Editar etiqueta" : "Nueva etiqueta", "Las etiquetas de gastos e ingresos se guardan por separado.", `
    <form data-form="tag" data-id="${tag ? escapeHtml(tag.id) : ""}"><div class="form-grid">
      <div class="field full"><label for="tag-name">Nombre</label><input id="tag-name" name="name" required maxlength="45" value="${escapeHtml(tag?.name || "")}" placeholder="Ej. Bizum, Hogar, Regalo"></div>
      <div class="field"><label>Sección</label><select name="kind"><option value="expense" ${kind === "expense" ? "selected" : ""}>Gastos</option><option value="income" ${kind === "income" ? "selected" : ""}>Ingresos</option></select></div>
      <div class="field"><label>Jerarquía</label><select name="hierarchy" id="tag-hierarchy"><option value="flexible" ${(tag?.hierarchy || (tag?.parentId ? "sub" : defaultHierarchy)) === "flexible" ? "selected" : ""}>Libre / ambas</option><option value="main" ${tag?.hierarchy === "main" ? "selected" : ""}>Siempre principal</option><option value="sub" ${(tag?.hierarchy || (tag?.parentId ? "sub" : defaultHierarchy)) === "sub" ? "selected" : ""}>Siempre subetiqueta</option></select></div>
      <div class="field full" id="tag-parent-field" ${tag?.hierarchy === "main" ? "hidden" : ""}><label>Etiquetas padre vinculadas ${tag?.hierarchy === "sub" ? "(elige una o varias)" : "(opcional)"}</label><div class="tag-picker" data-tag-parent-options>${tagParentPicker(kind, tag, initialParents)}</div></div>
      <label class="checkbox-field field full"><input name="requireSubcategory" type="checkbox" ${tag?.requireSubcategory ? "checked" : ""}><span>Exigir una subetiqueta al registrar un movimiento</span></label>
    </div><div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">Guardar etiqueta</button></div></form>`);
}

function goalForm(goal = null) {
  showDialog(goal ? "Editar objetivo de ahorro" : "Nuevo objetivo de ahorro", "El dinero reservado no sale de la cuenta ni modifica el patrimonio total.", `
    <form data-form="goal" data-id="${escapeHtml(goal?.id || "")}"><div class="form-grid">
      <div class="field full"><label>Nombre del objetivo</label><input name="name" required maxlength="45" placeholder="Ej. Viaje de verano" value="${escapeHtml(goal?.name || "")}"></div>
      <div class="field"><label>Meta (€)</label><input name="target" type="number" min="0.01" step="0.01" required placeholder="500" value="${goal ? Number(goal.target).toFixed(2) : ""}"></div>
      <div class="field"><label>Fecha objetivo (opcional, DD/MM/YYYY)</label>${dateInput("dueDate", goal?.dueDate || "")}</div>
    </div><div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">${goal ? "Guardar cambios" : "Crear objetivo"}</button></div></form>`);
}

function contributeForm(goal, direction = "in") {
  const reserved = Math.max(0, goalReserved(goal, state.transactions));
  const accounts = getVisibleAccounts();
  const defaultAccount = getAccount(goal.accountId)?.id || accounts[0]?.id || "";
  const maxAmount = direction === "in"
    ? Math.max(0, ...accounts.map((account) => accountFigures(account, state.accounts, state.transactions, state.goals, state.debts).free))
    : reserved;
  showDialog(direction === "in" ? "Apartar dinero" : "Retirar de ahorro", `Importe reservado actual: ${money(reserved)}. El saldo total no cambia.`, `
    <form data-form="contribute" data-direction="${direction}" data-id="${escapeHtml(goal.id)}"><div class="form-grid">
      <div class="field full"><label>Objetivo</label><input value="${escapeHtml(goal.name)} · ${money(reserved)} reservados" disabled></div>
      <div class="field"><label>Cuenta ${direction === "in" ? "de origen" : "del ahorro"}</label><select name="accountId" required>${accountOptions(defaultAccount)}</select></div>
      <div class="field"><label>Importe (€)</label><input name="amount" type="number" min="0.01" step="0.01" max="${maxAmount.toFixed(2)}" required></div>
      <div class="field"><label>Fecha (DD/MM/YYYY)</label>${dateInput("date", today(), { required: true })}</div>
      ${direction === "in" ? `<div class="field full"><label>Etiquetas para el presupuesto (opcional)</label><div id="saving-tag-picker">${tagCascadePicker("expense", [], false)}</div></div>` : ""}
    </div><div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">${direction === "in" ? "Apartar dinero" : "Retirar dinero"}</button></div></form>`);
}

function buyGoalForm(goal, draft = {}) {
  const reserved = Math.max(0, goalReserved(goal, state.transactions));
  showDialog("Registrar compra", `La compra se asociará a «${goal.name}». Devolveremos el sobrante de ${money(reserved)} al saldo libre.`, `
    <form data-form="buy-goal" data-id="${escapeHtml(goal.id)}"><div class="form-grid">
      <div class="field"><label>Cuenta desde la que comprar</label><select name="accountId" required>${accountOptions(draft.accountId || getVisibleAccounts()[0]?.id)}</select></div>
      <div class="field"><label>Precio real (€)</label><input name="amount" type="number" min="0.01" step="0.01" max="${Math.max(0, ...getVisibleAccounts().map((account) => accountBalance(account, state.transactions))).toFixed(2)}" required value="${escapeHtml(draft.amount || Math.min(Number(goal.target), reserved).toFixed(2))}"></div>
      <div class="field"><label>Fecha (DD/MM/YYYY)</label>${dateInput("date", draft.date || today(), { required: true })}</div>
      <div class="field full"><label>Etiquetas (opcional)</label><div id="purchase-tag-picker">${tagCascadePicker("expense", draft.tagIds || [], true, { revealAll: true })}</div></div>
      <div class="field"><label>Nota</label><input name="note" maxlength="100" value="${escapeHtml(draft.note ?? goal.name)}"></div>
    </div><div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">Confirmar compra</button></div></form>`);
}

function budgetForm(budget = null, draft = {}) {
  const month = monthKey();
  const tagIds = draft.tagIds || budget?.tagIds || (budget?.tagId ? [budget.tagId] : []);
  showDialog(budget ? "Editar presupuesto" : "Nuevo presupuesto", "Puedes presupuestar gastos o una aportación mensual a un objetivo de ahorro.", `
    <form data-form="budget" data-id="${escapeHtml(budget?.id || "")}"><div class="form-grid">
      <div class="field"><label>Tipo de presupuesto</label><select name="kind" id="budget-kind"><option value="expense" ${(draft.kind || budget?.kind || "expense") !== "saving" ? "selected" : ""}>Límite de gasto</option><option value="saving" ${(draft.kind || budget?.kind) === "saving" ? "selected" : ""}>Aportación a ahorro</option></select></div>
      <div class="field"><label>Importe del periodo (€)</label><input name="amount" type="number" min="0.01" step="0.01" required value="${escapeHtml(draft.amount || (budget ? Number(budget.amount).toFixed(2) : ""))}"></div>
      <div class="field full"><label>Etiquetas incluidas (opcional)</label><div id="budget-tag-picker">${tagCascadePicker("expense", tagIds, true)}</div></div>
      <div class="field"><label>Mes</label><input name="period" type="month" value="${escapeHtml(draft.period || budget?.period || month)}" ${budget ? "" : `min="${month}"`} required></div>
      <div class="field full" id="budget-goal-field" ${(draft.kind || budget?.kind) === "saving" ? "" : "hidden"}><label>Objetivo de ahorro</label><select name="goalId">${state.goals.filter((goal) => !goal.hidden && !goal.completedAt || goal.id === budget?.goalId).map((goal) => `<option value="${escapeHtml(goal.id)}" ${(draft.goalId || budget?.goalId) === goal.id ? "selected" : ""}>${escapeHtml(goal.name)}</option>`).join("")}</select><span class="field-hint">Las aportaciones solo cuentan cuando tienen la misma etiqueta y objetivo.</span></div>
    </div><div class="form-footer"><button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary">${budget ? "Guardar cambios" : "Crear presupuesto"}</button></div></form>`);
  if (!state.goals.some((goal) => !goal.hidden && !goal.completedAt) && (draft.kind || budget?.kind) !== "saving") {
    const savingOption = $("#budget-kind option[value='saving']", dialog);
    if (savingOption) savingOption.disabled = true;
  }
}

function archivedToggle() {
  state.archivedVisible = !state.archivedVisible;
  render();
}

async function saveExpenseWithRescue(tx, shortage) {
  if (shortage <= 0) return persistTransaction(tx);
  const candidates = state.goals.filter((goal) => !goal.completedAt)
    .map((goal) => ({ goal, available: Math.max(0, goalReservedByAccount(goal, tx.accountId, state.transactions)) }))
    .filter((entry) => entry.available > 0);
  const total = candidates.reduce((sum, entry) => sum + entry.available, 0);
  if (total < shortage) {
    notify(`No hay suficiente dinero en los ahorros de esta cuenta. Te faltan ${money(shortage - total)}.`);
    return;
  }
  rescueStep(tx, candidates, shortage, []);
}

async function saveSplitExpense(tx) {
  await persistTransaction(tx);
}

function rescueStep(tx, candidates, remaining, draws) {
  if (remaining <= .005) {
    tx.savingsDraws = draws;
    persistTransaction(tx);
    return;
  }
  const options = candidates.filter((entry) => entry.available > .005);
  if (!options.length) {
    notify("No se pudo completar el uso de ahorros.");
    return;
  }
  showDialog("Usar dinero reservado", `Este gasto supera el saldo libre por ${money(remaining)}. ¿De qué objetivo quieres tomarlo?`, `
    <form data-form="rescue-step">
      <input type="hidden" name="remaining" value="${remaining}">
      <input type="hidden" name="transaction" value="${escapeHtml(JSON.stringify(tx))}">
      <input type="hidden" name="draws" value="${escapeHtml(JSON.stringify(draws))}">
      <input type="hidden" name="available" value="${escapeHtml(JSON.stringify(candidates.map((entry) => ({ goalId: entry.goal.id, available: entry.available }))))}">
      <div class="field"><label>Objetivo de ahorro</label><select name="goalId">${options.map((entry) => `<option value="${escapeHtml(entry.goal.id)}">${escapeHtml(entry.goal.name)} · ${money(entry.available)} disponibles</option>`).join("")}</select></div>
      <div class="field" style="margin-top:13px"><label>Importe a tomar (€)</label><input name="amount" type="number" step="0.01" min="0.01" max="${remaining.toFixed(2)}" value="${Math.min(remaining, options[0].available).toFixed(2)}" required></div>
      <div class="form-footer"><button type="button" class="button button-quiet" data-action="cancel-rescue">Cancelar gasto</button><button class="button button-primary">Continuar</button></div>
    </form>`);
}

async function persistTransaction(tx) {
  tx.accountName = getAccount(tx.accountId)?.name || tx.accountName || "";
  tx.toAccountName = getAccount(tx.toAccountId)?.name || tx.toAccountName || "";
  const previous = state.transactions.find((entry) => entry.id === tx.id);
  if (previous) return persistEditedTransaction(tx, previous);
  tx.id ||= id();
  tx.createdAt ||= new Date().toISOString();
  const debts = tx.type === "expense" && tx.confirmed ? (tx.shares || []).map((share) => ({
    id: id(), direction: "owed_to_me", person: share.person, personKey: share.personKey,
    amount: share.amount, paidAmount: 0, forgivenAmount: 0, description: tx.note || tagName(tx.tagId, state.tags),
    source: "expense", transactionId: tx.id, accountId: tx.accountId, date: tx.date,
    createdAt: new Date().toISOString()
  })) : [];
  const debtEvents = [];
  for (const debt of debts) {
    debtEvents.push({ id: id(), debtId: debt.id, kind: "created", amount: debt.amount, date: debt.date, transactionId: tx.id, createdAt: new Date().toISOString() });
    addDebtWithOffsets(debt, debtEvents);
  }
  const touched = new Set(debtEvents.map((event) => event.debtId));
  const updatedDebts = state.debts.filter((debt) => touched.has(debt.id));
  await db.putMany({ transactions: [tx], debts: [...debts, ...updatedDebts], debtEvents });
  closeDialog();
  await refresh();
  notify(debts.length ? `Movimiento guardado; ${debts.length} anticipo(s) añadido(s) a «Me deben».` : "Movimiento guardado.");
}

async function persistEditedTransaction(tx, previous) {
  if (previous.debtId) {
    if (tx.type !== previous.type || tx.type !== "expense") throw new Error("Un pago o perdón de deuda debe seguir siendo un gasto.");
    const debt = state.debts.find((entry) => entry.id === previous.debtId);
    const event = state.debtEvents.find((entry) => entry.transactionId === previous.id && (entry.kind === "payment" || entry.kind === "offset-paid" || entry.kind === "forgiveness"));
    if (debt && event) {
      if (event.kind === "payment" || event.kind === "offset-paid") {
        const previousCash = event.kind === "payment" ? Number(event.amount) : 0;
        const previousOffset = Number(event.offsetAmount || (event.kind === "offset-paid" ? event.amount : 0));
        if (previousOffset > 0) {
          const otherPaid = Number(debt.paidAmount || 0) - previousCash;
          const otherOffsets = Number(debt.offsetPaidAmount || 0) - previousOffset;
          const maximum = debtOutstanding(debt) + previousCash + previousOffset;
          if (Number(tx.amount) > maximum + .005) throw new Error(`El importe no puede superar los ${money(maximum)} pendientes.`);
          const offset = Math.min(Number(tx.amount), Math.max(0, Number(debt.offsetAmount || 0) - otherOffsets));
          const cash = Number(tx.amount) - offset;
          debt.paidAmount = otherPaid + cash;
          debt.offsetPaidAmount = otherOffsets + offset;
          event.kind = cash > .005 ? "payment" : "offset-paid";
          event.amount = cash > .005 ? cash : offset;
          event.offsetAmount = offset;
          const offsetTransaction = state.transactions.find((entry) => entry.offsetForTransactionId === previous.id);
          const deletes = { debts: [], debtEvents: [], transactions: [] };
          const updates = { transactions: [tx], debts: [debt], debtEvents: [event] };
          if (offsetTransaction && offset > .005) updates.transactions.push({ ...offsetTransaction, amount: offset, accountId: tx.accountId, accountName: tx.accountName, date: tx.date });
          else if (offsetTransaction) deletes.transactions.push(offsetTransaction.id);
          tx.createdAt = previous.createdAt;
          await db.putAndDelete(updates, deletes);
          closeDialog(); await refresh(); notify("Pago y compensación de deuda actualizados.");
          return;
        }
      }
      if (event.kind === "payment") {
        const otherPaid = Number(debt.paidAmount || 0) - Number(event.amount);
        const maximum = Number(debt.amount) - Number(debt.forgivenAmount || 0) - Number(debt.offsetAmount || 0) - otherPaid;
        if (tx.amount > maximum + .005) throw new Error(`El importe no puede superar los ${money(maximum)} disponibles de esa deuda.`);
        debt.paidAmount = otherPaid + Number(tx.amount);
      } else {
        const otherForgiven = Number(debt.forgivenAmount || 0) - Number(event.amount);
        const maximum = Number(debt.amount) - Number(debt.paidAmount || 0) - Number(debt.offsetAmount || 0) - otherForgiven;
        if (tx.amount > maximum + .005) throw new Error(`El importe no puede superar los ${money(maximum)} pendientes.`);
        debt.forgivenAmount = otherForgiven + Number(tx.amount);
      }
      event.amount = Number(tx.amount);
      event.date = tx.date;
      event.accountId = tx.accountId;
      if (debt.direction === "owed_to_me") debt.accountId = tx.accountId;
      tx.createdAt = previous.createdAt;
      await db.putMany({ transactions: [tx], debts: [debt], debtEvents: [event] });
      closeDialog(); await refresh(); notify("Gasto de deuda actualizado.");
      return;
    }
  }
  const linkedDebts = state.debts.filter((debt) => debt.source === "expense" && debt.transactionId === previous.id);
  const remainingShares = new Map((tx.type === "expense" && tx.confirmed ? tx.shares || [] : []).map((share) => [share.personKey, share]));
  const events = [];
  const debtsToSave = [];
  for (const debt of linkedDebts) {
    const share = remainingShares.get(debt.personKey);
    remainingShares.delete(debt.personKey);
    if (share) {
      const alreadySettled = Number(debt.paidAmount || 0) + Number(debt.forgivenAmount || 0) + Number(debt.offsetAmount || 0);
      if (share.amount + .005 < alreadySettled) throw new Error(`No puedes reducir la parte de ${debt.person} por debajo de lo ya pagado o compensado.`);
      const change = share.amount - Number(debt.amount);
      debt.amount = share.amount;
      debt.person = share.person;
      debt.personKey = share.personKey;
      debt.accountId = tx.accountId;
      if (Math.abs(change) > .005) events.push({ id: id(), debtId: debt.id, kind: "adjusted", amount: change, date: today(), createdAt: new Date().toISOString() });
      if (change > .005) addDebtWithOffsets(debt, events);
    } else {
      const openAmount = debtOutstanding(debt);
      debt.forgivenAmount = Number(debt.forgivenAmount || 0) + openAmount;
      if (openAmount > .005) events.push({ id: id(), debtId: debt.id, kind: "adjusted", amount: -openAmount, date: today(), createdAt: new Date().toISOString() });
    }
    debtsToSave.push(debt);
  }
  for (const share of remainingShares.values()) {
    const debt = {
      id: id(), direction: "owed_to_me", person: share.person, personKey: share.personKey,
      amount: share.amount, paidAmount: 0, forgivenAmount: 0, offsetAmount: 0,
      description: tx.note || tagName(tx.tagId, state.tags), source: "expense",
      transactionId: tx.id, accountId: tx.accountId, date: tx.date, createdAt: new Date().toISOString()
    };
    events.push({ id: id(), debtId: debt.id, kind: "created", amount: debt.amount, date: debt.date, transactionId: tx.id, createdAt: new Date().toISOString() });
    addDebtWithOffsets(debt, events);
    debtsToSave.push(debt);
  }
  const touched = new Set(events.map((event) => event.debtId));
  debtsToSave.push(...state.debts.filter((debt) => touched.has(debt.id) && !debtsToSave.some((saved) => saved.id === debt.id)));
  tx.createdAt = previous.createdAt;
  await db.putMany({ transactions: [tx], debts: debtsToSave, debtEvents: events });
  closeDialog();
  await refresh();
  notify("Movimiento actualizado y saldo recalculado.");
}

async function removeTransaction(tx) {
  const removeIds = new Set([tx.id]);
  if (tx.settlementGroupId) {
    state.transactions.filter((entry) => entry.settlementGroupId === tx.settlementGroupId).forEach((entry) => removeIds.add(entry.id));
  }
  const sourceDebts = state.debts.filter((debt) => debt.source === "expense" && debt.transactionId === tx.id);
  const removedDebtIds = new Set(sourceDebts.map((debt) => debt.id));
  for (const debt of sourceDebts) {
    state.transactions.filter((entry) => entry.debtId === debt.id).forEach((entry) => removeIds.add(entry.id));
  }
  for (const linked of state.transactions.filter((entry) => removeIds.has(entry.id) && entry.settlementGroupId)) {
    state.transactions.filter((entry) => entry.settlementGroupId === linked.settlementGroupId).forEach((entry) => removeIds.add(entry.id));
  }
  const targetTxs = state.transactions.filter((entry) => removeIds.has(entry.id));
  const paymentDebtChanges = new Map();
  for (const linked of targetTxs) {
    if (!linked.debtId || removedDebtIds.has(linked.debtId)) continue;
    const debt = state.debts.find((entry) => entry.id === linked.debtId);
    const events = state.debtEvents.filter((entry) => entry.transactionId === linked.id);
    if (!debt || !events.length) continue;
    for (const event of events) {
      if (event.kind === "payment") {
        debt.paidAmount = Math.max(0, Number(debt.paidAmount || 0) - Number(event.amount));
        debt.offsetPaidAmount = Math.max(0, Number(debt.offsetPaidAmount || 0) - Number(event.offsetAmount || 0));
      }
      if (event.kind === "offset-paid") debt.offsetPaidAmount = Math.max(0, Number(debt.offsetPaidAmount || 0) - Number(event.offsetAmount || event.amount));
      if (event.kind === "forgiveness") debt.forgivenAmount = Math.max(0, Number(debt.forgivenAmount || 0) - Number(event.amount));
    }
    paymentDebtChanges.set(debt.id, debt);
  }
  const externalDebtChanges = new Map();
  for (const event of state.debtEvents) {
    if (event.linkedDebtId && removedDebtIds.has(event.linkedDebtId) && !removedDebtIds.has(event.debtId)) {
      const debt = state.debts.find((entry) => entry.id === event.debtId);
      if (debt) {
        debt.offsetAmount = Math.max(0, Number(debt.offsetAmount || 0) - Number(event.amount));
        externalDebtChanges.set(debt.id, debt);
      }
    }
  }
  const removedEvents = state.debtEvents.filter((event) =>
    removedDebtIds.has(event.debtId) || removedDebtIds.has(event.linkedDebtId) || removeIds.has(event.transactionId)
  );
  const completedGoal = tx.purchaseGoalId ? state.goals.find((goal) => goal.id === tx.purchaseGoalId) : null;
  if (completedGoal) completedGoal.completedAt = null;
  await db.putAndDelete(
    { debts: [...new Map([...externalDebtChanges, ...paymentDebtChanges]).values()], goals: completedGoal ? [completedGoal] : [] },
    {
      transactions: [...removeIds],
      debts: [...removedDebtIds],
      debtEvents: removedEvents.map((event) => event.id)
    }
  );
  await refresh();
}

async function removeDebt(debt) {
  const offsetEvents = state.debtEvents.filter((event) => event.kind === "offset" &&
    (event.debtId === debt.id || event.linkedDebtId === debt.id));
  const linkedDebtIds = new Set(offsetEvents.map((event) => event.debtId === debt.id ? event.linkedDebtId : event.debtId).filter(Boolean));
  if ([...linkedDebtIds].some((linkedId) => Number(state.debts.find((entry) => entry.id === linkedId)?.offsetPaidAmount || 0) > .005)) {
    throw new Error("No se puede eliminar esta deuda porque una deuda compensada ya tiene abonos aplicados. Elimina o ajusta primero esos abonos.");
  }

  const paymentTransactionIds = state.transactions.filter((tx) => tx.debtId === debt.id).map((tx) => tx.id);
  for (const transactionId of paymentTransactionIds) {
    const tx = state.transactions.find((entry) => entry.id === transactionId);
    if (tx) await removeTransaction(tx);
  }

  const currentDebt = state.debts.find((entry) => entry.id === debt.id);
  if (!currentDebt) return;
  const debtEvents = state.debtEvents.filter((event) => event.debtId === currentDebt.id || event.linkedDebtId === currentDebt.id);
  const externalDebts = new Map();
  for (const event of debtEvents.filter((entry) => entry.kind === "offset" && entry.debtId === currentDebt.id && entry.linkedDebtId)) {
    const counterpart = state.debts.find((entry) => entry.id === event.linkedDebtId);
    if (counterpart) {
      const updated = externalDebts.get(counterpart.id) || { ...counterpart };
      updated.offsetAmount = Math.max(0, Number(updated.offsetAmount || 0) - Number(event.amount));
      externalDebts.set(updated.id, updated);
    }
  }

  const records = { debts: [...externalDebts.values()] };
  if (currentDebt.source === "expense") {
    const source = state.transactions.find((tx) => tx.id === currentDebt.transactionId);
    if (source) {
      const shares = source.shares || [];
      const removedShares = shares.filter((share) => share.personKey === currentDebt.personKey);
      if (removedShares.length) {
        source.shares = shares.filter((share) => share.personKey !== currentDebt.personKey);
        source.ownAmount = Number(source.ownAmount ?? source.amount) + removedShares.reduce((sum, share) => sum + Number(share.amount), 0);
        records.transactions = [source];
      }
    }
  }
  await db.putAndDelete(records, {
    debts: [currentDebt.id],
    debtEvents: debtEvents.map((event) => event.id)
  });
  await refresh();
}

function showImportError(message) {
  notify(message);
}

async function submitForm(form) {
  const data = new FormData(form);
  const get = (key) => data.get(key);
  const num = (key) => Number(get(key));
  const formType = form.dataset.form;
  try {
    if (formType === "confirmation") {
      const resolve = state.pendingConfirmation;
      state.pendingConfirmation = null;
      closeDialog();
      resolve?.(true);
    } else if (formType === "account") {
      const old = state.accounts.find((entry) => entry.id === form.dataset.id);
      const account = {
        ...(old || {}), id: old?.id || id(), name: String(get("name")).trim(),
        openingBalance: old?.openingBalance ?? num("openingBalance"),
        createdAt: old?.createdAt || new Date().toISOString(), archived: old?.archived || false
      };
      await db.put("accounts", account);
      closeDialog(); await refresh(); notify(old ? "Cuenta actualizada." : "Cuenta creada.");
    } else if (formType === "account-delete") {
      const account = getAccount(form.dataset.id);
      if (!account || account.archived) throw new Error("La cuenta ya no está disponible.");
      const balance = Number(form.dataset.balance);
      const reserved = Number(form.dataset.reserved);
      const mode = String(get("mode"));
      const goalsToSave = [];
      const txToSave = [];
      const debtToSave = [];
      const historicalNames = new Map(state.transactions
        .filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id)
        .map((tx) => [tx.id, {
          accountName: tx.accountName || (tx.accountId === account.id ? account.name : getAccount(tx.accountId)?.name || ""),
          toAccountName: tx.toAccountName || (tx.toAccountId === account.id ? account.name : getAccount(tx.toAccountId)?.name || "")
        }]));
      if (mode === "transfer") {
        const destinations = data.getAll("destinationId").map(String);
        const amounts = data.getAll("transferAmount").map((value) => Number(value));
        if (!destinations.length || destinations.length !== amounts.length || destinations.some((value) => !value)) throw new Error("Añade al menos una cuenta de destino.");
        if (amounts.some((value) => !(value > 0)) || Math.abs(amounts.reduce((sum, value) => sum + value, 0) - balance) > .005) {
          throw new Error(`Los importes deben sumar exactamente ${money(balance)}.`);
        }
        if (amounts[0] + .005 < reserved) throw new Error(`La primera cuenta destino debe recibir al menos ${money(reserved)} para mantener los ahorros reservados.`);
        for (let index = 0; index < destinations.length; index += 1) {
          if (destinations[index] === account.id || !getAccount(destinations[index]) || getAccount(destinations[index]).archived) throw new Error("Selecciona cuentas destino activas y distintas del origen.");
          txToSave.push({ id: id(), type: "transfer", amount: amounts[index], accountId: account.id, toAccountId: destinations[index], date: today(), note: `Saldo traspasado al eliminar ${account.name}`, confirmed: true, createdAt: new Date().toISOString() });
        }
        const destinationId = destinations[0];
        const transferredGoalIds = new Set([
          ...state.goals.filter((entry) => entry.accountId === account.id).map((entry) => entry.id),
          ...state.transactions.filter((entry) => entry.type === "saving" && entry.accountId === account.id).map((entry) => entry.goalId)
        ]);
        for (const goal of state.goals.filter((entry) => entry.accountId === account.id)) {
          goal.accountId = destinationId;
          goalsToSave.push(goal);
        }
        for (const tx of state.transactions.filter((entry) => entry.type === "saving" && entry.accountId === account.id)) {
          tx.accountId = destinationId;
          txToSave.push(tx);
        }
        for (const tx of state.transactions.filter((entry) => ["income", "expense"].includes(entry.type) && !entry.confirmed && entry.accountId === account.id)) {
          tx.accountId = destinationId;
          txToSave.push(tx);
        }
        for (const tx of state.transactions.filter((entry) => entry.type === "expense" && entry.accountId === account.id && entry.savingsDraws?.length)) {
          let changed = false;
          tx.savingsDraws = tx.savingsDraws.map((draw) => {
            if (transferredGoalIds.has(draw.goalId) && !draw.accountId) {
              changed = true;
              return { ...draw, accountId: destinationId };
            }
            return draw;
          });
          if (changed) txToSave.push(tx);
        }
        for (const debt of state.debts.filter((entry) => entry.direction === "owed_to_me" && entry.accountId === account.id)) {
          debt.accountId = destinationId;
          debtToSave.push(debt);
        }
      } else {
        const goalBalances = state.goals.map((goal) => ({
          goal,
          amount: goalReservedByAccount(goal, account.id, state.transactions)
        })).filter((entry) => entry.amount > .005);
        for (const { goal, amount } of goalBalances) {
          txToSave.push({ id: id(), type: "saving", amount: -amount, goalId: goal.id, accountId: account.id, date: today(), confirmed: true, note: "Ahorro liberado al dar de baja la cuenta", createdAt: new Date().toISOString() });
        }
        if (Math.abs(balance) > .005) txToSave.push({ id: id(), type: "adjustment", amount: -balance, accountId: account.id, date: today(), note: "Saldo dado de baja al eliminar la cuenta", confirmed: true, createdAt: new Date().toISOString() });
        const fallback = getVisibleAccounts().find((entry) => entry.id !== account.id);
        const pendingTransactions = state.transactions.filter((entry) => ["income", "expense"].includes(entry.type) && !entry.confirmed && entry.accountId === account.id);
        if (pendingTransactions.length && !fallback) throw new Error("Antes de eliminar la única cuenta, confirma o elimina sus movimientos previstos para no perderlos.");
        if (fallback) {
          for (const tx of pendingTransactions) {
            tx.accountId = fallback.id;
            txToSave.push(tx);
          }
          for (const goal of state.goals.filter((entry) => entry.accountId === account.id)) {
            goal.accountId = fallback.id;
            goalsToSave.push(goal);
          }
          for (const debt of state.debts.filter((entry) => entry.direction === "owed_to_me" && entry.accountId === account.id)) {
            debt.accountId = fallback.id;
            debtToSave.push(debt);
          }
        } else {
          for (const goal of state.goals.filter((entry) => entry.accountId === account.id)) {
            goal.accountId = "";
            goalsToSave.push(goal);
          }
          for (const debt of state.debts.filter((entry) => entry.direction === "owed_to_me" && entry.accountId === account.id)) {
            debt.accountId = "";
            debtToSave.push(debt);
          }
        }
      }
      const relatedTransactions = state.transactions.filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id);
      const transactionUpdates = new Map();
      for (const tx of relatedTransactions) {
        const names = historicalNames.get(tx.id) || {
          accountName: tx.accountName || (tx.accountId === account.id ? account.name : getAccount(tx.accountId)?.name || ""),
          toAccountName: tx.toAccountName || (tx.toAccountId === account.id ? account.name : getAccount(tx.toAccountId)?.name || "")
        };
        transactionUpdates.set(tx.id, { ...tx, ...names });
      }
      for (const tx of txToSave) transactionUpdates.set(tx.id, {
        ...tx,
        accountName: historicalNames.get(tx.id)?.accountName || (tx.accountId === account.id ? account.name : getAccount(tx.accountId)?.name || ""),
        toAccountName: historicalNames.get(tx.id)?.toAccountName || (tx.toAccountId === account.id ? account.name : getAccount(tx.toAccountId)?.name || "")
      });
      await db.putAndDelete({ goals: goalsToSave, transactions: [...transactionUpdates.values()], debts: debtToSave }, { accounts: [account.id] });
      state.selectedAccounts = state.selectedAccounts.filter((selectedId) => selectedId !== account.id);
      state.statsAccounts = state.statsAccounts.filter((selectedId) => selectedId !== account.id);
      closeDialog(); await refresh(); notify(mode === "transfer" ? "Cuenta eliminada definitivamente y saldo traspasado." : "Cuenta eliminada definitivamente; el saldo fue dado de baja.");
    } else if (formType === "transaction") {
      const type = String(get("type"));
      const date = parsedFormDate(data, "date");
      const pending = Boolean($("#pending-income", form)?.checked) || date > today();
      const accountId = String(get("accountId"));
      const account = getAccount(accountId);
      if (!account || account.archived) throw new Error("Selecciona una cuenta activa.");
      const amount = num("amount");
      if (!(amount > 0)) throw new Error("El importe debe ser mayor que cero.");
      const shareAmounts = [];
      let ownAmount = amount;
      if (type === "expense" && $("#split-enabled", form)?.checked) {
        const people = data.getAll("sharePerson").map((person) => String(person || "").trim());
        const portions = data.getAll("shareAmount").map((value) => String(value || "").trim());
        let allocated = 0;
        const sharesByPerson = new Map();
        for (let index = 0; index < Math.max(people.length, portions.length); index += 1) {
          const person = people[index] || "";
          const portion = portions[index] || "";
          if (!person && !portion) continue;
          if (!person || !portion) throw new Error("Completa el nombre y el importe de cada persona.");
          const shareAmount = Number(portion);
          if (!(shareAmount > 0)) throw new Error(`El importe de ${person} debe ser mayor que cero.`);
          const personKey = person.replace(/\s+/g, " ").toLocaleLowerCase("es");
          const existing = sharesByPerson.get(personKey);
          if (existing) existing.amount += shareAmount;
          else sharesByPerson.set(personKey, { person, personKey, amount: shareAmount });
          allocated += shareAmount;
        }
        if (!sharesByPerson.size) throw new Error("Añade al menos una persona a la división de la cuenta.");
        const ownInput = String(get("ownAmount") || "").trim();
        ownAmount = ownInput ? Number(ownInput) : amount - allocated;
        if (!Number.isFinite(ownAmount) || ownAmount < -0.005) throw new Error("Las partes de las demás personas superan el total de la cuenta.");
        ownAmount = Math.max(0, ownAmount);
        if (Math.abs(ownAmount + allocated - amount) > .005) throw new Error(`Las partes suman ${money(ownAmount + allocated)} y la cuenta es de ${money(amount)}.`);
        shareAmounts.push(...sharesByPerson.values());
      }
      const tagIds = data.getAll("tagIds").map(String);
      const { selected: selectedTags, mains: mainTags, subs: subTags } = validateTagSelection(tagIds);
      if (selectedTags.some((tag) => tag.kind && tag.kind !== type)) throw new Error("Las etiquetas de gastos e ingresos no se pueden mezclar.");
      const primaryTag = mainTags[0] || selectedTags[0];
      const subTag = subTags[0] || null;
      const previous = state.transactions.find((entry) => entry.id === form.dataset.id);
      const tx = {
        ...(previous || {}), id: previous?.id || id(), type, amount, accountId, date, confirmed: !pending,
        tagId: primaryTag?.id || null, subtagId: subTag?.id || null, tagIds,
        note: String(get("note") || "").trim(), createdAt: previous?.createdAt || new Date().toISOString()
      };
      const remainingTransactions = previous ? state.transactions.filter((entry) => entry.id !== previous.id) : state.transactions;
      const linkedDebtIds = new Set(state.debts.filter((debt) => debt.transactionId === previous?.id).map((debt) => debt.id));
      const remainingDebts = previous ? state.debts.filter((debt) => !linkedDebtIds.has(debt.id)) : state.debts;
      if (previous?.savingsDraws?.length && (type !== "expense" || amount !== Number(previous.amount) || accountId !== previous.accountId)) {
        throw new Error("Este gasto ya utilizó dinero de ahorros. Para conservar ese registro, no cambies el importe ni la cuenta.");
      }
      if (type === "expense") {
        tx.ownAmount = ownAmount;
        tx.shares = shareAmounts;
        const figures = accountFigures(account, state.accounts, remainingTransactions, state.goals, remainingDebts);
        if (!pending && amount > figures.balance + .005) throw new Error(`El gasto supera el saldo total de la cuenta (${money(figures.balance)}).`);
        const shortage = pending ? 0 : amount - figures.free;
        if (shortage > .005) {
          closeDialog();
          await saveExpenseWithRescue(tx, shortage);
          return;
        }
      } else if (type === "income" && !pending && accountBalance(account, remainingTransactions) + amount < -.005) {
        throw new Error("El cambio dejaría la cuenta con saldo negativo.");
      }
      if (type === "income") {
        delete tx.ownAmount;
        delete tx.shares;
      }
      if (previous) await persistEditedTransaction(tx, previous);
      else if (type === "expense" && shareAmounts.length) await saveSplitExpense(tx);
      else await persistTransaction(tx);
    } else if (formType === "transfer") {
      const amount = num("amount");
      const accountId = String(get("accountId"));
      const toAccountId = String(get("toAccountId"));
      if (!(amount > 0)) throw new Error("El importe debe ser mayor que cero.");
      const date = parsedFormDate(data, "date");
      if (date > today()) throw new Error("Un traspaso real no puede registrarse en una fecha futura.");
      if (accountId === toAccountId) throw new Error("Elige dos cuentas diferentes.");
      const account = getAccount(accountId);
      if (!account || accountFigures(account, state.accounts, state.transactions, state.goals, state.debts).free < amount) throw new Error("La cuenta de origen no tiene saldo libre suficiente. El traspaso no puede retirar dinero reservado.");
      await persistTransaction({ id: id(), type: "transfer", amount, accountId, toAccountId, date, note: String(get("note") || "").trim(), confirmed: true, createdAt: new Date().toISOString() });
    } else if (formType === "adjustment") {
      const account = getAccount(form.dataset.id);
      if (!account) throw new Error("No se encuentra la cuenta que quieres ajustar.");
      const diff = num("target") - accountBalance(account, state.transactions);
      if (Math.abs(diff) < .005) { closeDialog(); notify("El saldo ya coincide."); return; }
      await persistTransaction({ id: id(), type: "adjustment", amount: diff, accountId: account.id, date: today(), note: String(get("note") || "Ajuste de saldo").trim(), confirmed: true, createdAt: new Date().toISOString() });
    } else if (formType === "tag") {
      const old = state.tags.find((entry) => entry.id === form.dataset.id);
      const name = String(get("name")).trim();
      const kind = String(get("kind"));
      const hierarchy = String(get("hierarchy"));
      const parentIds = hierarchy === "main" ? [] : [...new Set(data.getAll("parentIds").map(String))];
      if (hierarchy === "sub" && !parentIds.length) throw new Error("Elige al menos una etiqueta principal para esta subetiqueta.");
      if (parentIds.some((parentId) => !state.tags.some((entry) => entry.id === parentId && (!entry.kind || entry.kind === kind)))) throw new Error("Una etiqueta padre no existe o pertenece a otra sección.");
      if (parentIds.some((parentId) => parentId === old?.id || tagHasAncestor(parentId, old?.id))) throw new Error("La jerarquía no puede contener una referencia circular.");
      if (state.tags.some((entry) => entry.id !== old?.id && entry.name.trim().toLocaleLowerCase("es") === name.toLocaleLowerCase("es") &&
        (entry.kind || "expense") === kind)) throw new Error("Ya existe una etiqueta con ese nombre en esta sección.");
      const childrenBefore = old ? state.tags.filter((entry) => tagParents(entry).includes(old.id)) : [];
      if (old && old.kind && old.kind !== kind) {
        const hasChildren = childrenBefore.length > 0;
        const incompatibleUse = state.transactions.some((tx) => transactionTagIds(tx).includes(old.id) && tx.type !== kind);
        const usedByBudget = state.budgets.some((budget) => (budget.tagIds || (budget.tagId ? [budget.tagId] : [])).includes(old.id));
        if (hasChildren || incompatibleUse || (kind === "income" && usedByBudget)) {
          throw new Error("No se puede cambiar de sección porque la etiqueta ya tiene subetiquetas o está usada en movimientos o presupuestos incompatibles.");
        }
      }
      const tag = {
        ...(old || {}), id: old?.id || id(), name, kind, hierarchy,
        requireSubcategory: Boolean(data.get("requireSubcategory")),
        parentIds, parentId: parentIds[0] || null,
        parentName: state.tags.find((entry) => entry.id === parentIds[0])?.name || "",
        createdAt: old?.createdAt || new Date().toISOString()
      };
      const children = old ? childrenBefore.map((child) => ({
        ...child,
        parentName: child.parentId === old.id ? name : child.parentName
      })) : [];
      await db.putMany({ tags: [tag, ...children] });
      const returnTo = state.tagReturn;
      state.tagReturn = null;
      closeDialog(); await refresh();
      if (returnTo) {
        const draft = { ...returnTo.values, tagIds: [...new Set([...returnTo.tagIds, ...selectedTagLineage(tag.id)])] };
        if (returnTo.context === "transaction") {
          state.transactionDraft = { ...draft, type: returnTo.type };
          transactionForm(returnTo.type, state.transactions.find((entry) => entry.id === returnTo.id) || null);
        } else if (returnTo.context === "buy-goal") {
          const goal = state.goals.find((entry) => entry.id === returnTo.id);
          if (goal) buyGoalForm(goal, draft);
        } else if (returnTo.context === "budget") {
          const budget = state.budgets.find((entry) => entry.id === returnTo.id) || null;
          budgetForm(budget, draft);
        }
      } else notify("Etiqueta guardada.");
    } else if (formType === "goal") {
      const target = num("target");
      if (!String(get("name") || "").trim() || !(target > 0)) throw new Error("Indica un nombre y una meta mayor que cero.");
      const old = state.goals.find((entry) => entry.id === form.dataset.id);
      const goal = { ...(old || {}), id: old?.id || id(), name: String(get("name")).trim(), target, dueDate: parsedFormDate(data, "dueDate", true), createdAt: old?.createdAt || new Date().toISOString(), hidden: old?.hidden || false };
      await db.put("goals", goal); closeDialog(); await refresh(); notify(old ? "Objetivo actualizado." : "Objetivo creado.");
    } else if (formType === "contribute") {
      const goal = state.goals.find((entry) => entry.id === form.dataset.id);
      if (!goal) throw new Error("No se encuentra el objetivo.");
      const amount = num("amount");
      if (!(amount > 0)) throw new Error("El importe debe ser mayor que cero.");
      const date = parsedFormDate(data, "date");
      if (date > today()) throw new Error("Una aportación real no puede registrarse en una fecha futura.");
      const account = getAccount(String(get("accountId")));
      if (!account || account.archived) throw new Error("Selecciona una cuenta activa.");
      const direction = form.dataset.direction || "in";
      if (direction === "in" && amount > accountFigures(account, state.accounts, state.transactions, state.goals, state.debts).free + .005) throw new Error("No hay suficiente saldo libre en esa cuenta.");
      const reservedInAccount = goalReservedByAccount(goal, account.id, state.transactions);
      if (direction === "out" && amount > reservedInAccount + .005) throw new Error(`Solo hay ${money(reservedInAccount)} reservados para este objetivo en esa cuenta.`);
      const { tagIds, mains, subs } = direction === "in" ? readTagSelection(data, "expense") : { tagIds: [], mains: [], subs: [] };
      const tag = mains[0] || null;
      const subtag = subs[0] || null;
      await persistTransaction({ id: id(), type: "saving", amount: direction === "in" ? amount : -amount, goalId: goal.id, accountId: account.id, tagId: tag?.id || null, subtagId: subtag?.id || null, tagIds, date, confirmed: true, note: direction === "in" ? "Aportación a ahorro" : "Retirada de ahorro", createdAt: new Date().toISOString() });
    } else if (formType === "buy-goal") {
      const goal = state.goals.find((entry) => entry.id === form.dataset.id);
      if (!goal) throw new Error("No se encuentra el objetivo.");
      const amount = num("amount");
      if (!(amount > 0)) throw new Error("El precio debe ser mayor que cero.");
      const date = parsedFormDate(data, "date");
      if (date > today()) throw new Error("Una compra real no puede registrarse en una fecha futura.");
      const account = getAccount(String(get("accountId")));
      if (!account || amount > accountBalance(account, state.transactions) + .005) throw new Error("El precio supera el saldo actual de la cuenta.");
      const reserve = Math.max(0, goalReservedByAccount(goal, account.id, state.transactions));
      const { tagIds, mains, subs } = readTagSelection(data, "expense");
      const tag = mains[0] || null;
      const subtag = subs[0] || null;
      const used = Math.min(amount, reserve);
      const tx = { id: id(), type: "expense", amount, ownAmount: amount, accountId: account.id, date, tagId: tag?.id || null, subtagId: subtag?.id || null, tagIds, note: String(get("note") || "").trim() || goal.name, confirmed: true, savingsDraws: used > 0 ? [{ goalId: goal.id, amount: used }] : [], purchaseGoalId: goal.id, createdAt: new Date().toISOString() };
      goal.completedAt = new Date().toISOString();
      await db.putMany({ goals: [goal], transactions: [tx] });
      state.transactions.push(tx);
      closeDialog(); await refresh(); notify("Compra registrada; el sobrante volvió al saldo disponible.");
    } else if (formType === "budget") {
      const old = state.budgets.find((entry) => entry.id === form.dataset.id);
      const amount = num("amount");
      if (!(amount > 0)) throw new Error("El presupuesto debe ser mayor que cero.");
      const period = String(get("period"));
      if (!old && period < monthKey()) throw new Error("No puedes crear un presupuesto en un periodo pasado.");
      const kind = String(get("kind"));
      const tagIds = data.getAll("tagIds").map(String);
      const { selected: budgetTags } = validateTagSelection(tagIds);
      if (budgetTags.some((tag) => tag.kind && tag.kind !== "expense")) throw new Error("Los presupuestos solo pueden incluir etiquetas de gastos.");
      const goalId = kind === "saving" ? String(get("goalId") || "") : "";
      if (kind === "saving" && !state.goals.some((goal) => goal.id === goalId && ((!goal.hidden && !goal.completedAt) || goal.id === old?.goalId))) throw new Error("Selecciona un objetivo de ahorro activo.");
      const periodBudgets = state.budgets.filter((budget) => budget.id !== old?.id && budget.period === period && !budget.hidden).reduce((sum, budget) => sum + Number(budget.amount), 0);
      const pendingIncome = state.transactions.filter((tx) => tx.type === "income" && !tx.confirmed && tx.date.slice(0, 7) === period).reduce((sum, tx) => sum + Number(tx.amount), 0);
      const available = getVisibleAccounts().reduce((sum, account) => sum + Math.max(0, accountFigures(account, state.accounts, state.transactions, state.goals, state.debts).free), 0) + pendingIncome;
      const proposed = periodBudgets + amount;
      if (proposed > available + .005) throw new Error(`No es viable: tus presupuestos sumarían ${money(proposed)} y hay ${money(available)} disponibles, contando ingresos pendientes de ese mes.`);
      await db.put("budgets", { ...(old || {}), id: old?.id || id(), amount, period, kind, tagId: budgetTags.find((tag) => tagRole(tag, "main"))?.id || budgetTags[0]?.id || null, tagIds, goalId, hidden: old?.hidden || false, createdAt: old?.createdAt || new Date().toISOString() });
      closeDialog(); await refresh();
      if (Math.abs(proposed - available) < .01) notify("Aviso: has presupuestado todo el dinero disponible, sin margen.");
      else notify(old ? "Presupuesto actualizado." : "Presupuesto creado.");
    } else if (formType === "rescue-step") {
      const remaining = num("remaining");
      const tx = JSON.parse(String(get("transaction")));
      const draws = JSON.parse(String(get("draws")));
      const available = JSON.parse(String(get("available")));
      const goalId = String(get("goalId"));
      const amount = num("amount");
      const goalCapacity = available.find((entry) => entry.goalId === goalId)?.available || 0;
      if (!(amount > 0) || amount > goalCapacity + .005 || amount > remaining + .005) throw new Error("El importe supera el saldo reservado disponible.");
      draws.push({ goalId, amount });
      const updatedAvailable = available.map((entry) => entry.goalId === goalId ? { ...entry, available: entry.available - amount } : entry);
      closeDialog();
      const left = remaining - amount;
      if (left > .005) {
        const candidates = updatedAvailable.map((entry) => ({ goal: state.goals.find((goal) => goal.id === entry.goalId), available: entry.available })).filter((entry) => entry.goal);
        rescueStep(tx, candidates, left, draws);
      } else {
        tx.savingsDraws = draws;
        await persistTransaction(tx);
        notify("Gasto guardado usando dinero de tus ahorros.");
      }
    } else if (formType === "account-filter") {
      const selected = data.get("all") ? [] : data.getAll("accountId").map(String);
      if (form.dataset.target === "stats") state.statsAccounts = selected;
      else state.selectedAccounts = selected;
      closeDialog();
      render();
    } else if (formType === "tag-filter") {
      state.statsTags = data.get("all") ? [] : data.getAll("tagId").map(String);
      closeDialog();
      render();
    } else if (formType === "debt") {
      const old = state.debts.find((entry) => entry.id === form.dataset.id);
      if (form.dataset.id && !old) throw new Error("No se encuentra la deuda que quieres editar.");
      if (old?.source === "expense" && state.transactions.some((tx) => tx.id === old.transactionId)) throw new Error("Edita este registro desde el gasto dividido que lo originó.");
      const person = String(get("person") || "").trim();
      const amount = num("amount");
      if (!person) throw new Error("Indica el nombre de la persona.");
      if (!(amount > 0)) throw new Error("La deuda debe ser mayor que cero.");
      const direction = String(get("direction"));
      const accountId = direction === "owed_to_me" ? String(get("accountId")) : "";
      if (direction === "owed_to_me" && (!getAccount(accountId) || getAccount(accountId).archived)) throw new Error("Selecciona una cuenta activa para reservar el importe.");
      const personKey = person.replace(/\s+/g, " ").toLocaleLowerCase("es");
      const settledAmount = Number(old?.paidAmount || 0) + Number(old?.forgivenAmount || 0) + Number(old?.offsetPaidAmount || 0);
      if (old && amount + .005 < settledAmount) throw new Error(`El importe no puede ser inferior a los ${money(settledAmount)} ya abonados, perdonados o compensados.`);
      const identityChanged = old && (direction !== old.direction || personKey !== old.personKey);
      const settled = settledAmount > .005;
      if (identityChanged && settled) throw new Error("No puedes cambiar la persona o el sentido de una deuda que ya tiene abonos, perdones o compensaciones.");
      const paidOffset = Number(old?.offsetPaidAmount || 0) > .005;
      if (old && paidOffset && (identityChanged || Math.abs(amount - Number(old.amount)) > .005)) {
        throw new Error("No puedes cambiar la persona, el sentido o el importe de una deuda con compensaciones ya aplicadas.");
      }
      const debt = {
        ...(old || {}), id: old?.id || id(), direction, person, personKey,
        amount, paidAmount: Number(old?.paidAmount || 0), forgivenAmount: Number(old?.forgivenAmount || 0),
        offsetAmount: paidOffset ? Number(old.offsetAmount || 0) : 0,
        offsetPaidAmount: Number(old?.offsetPaidAmount || 0), accountId,
        description: String(get("description") || "").trim(), source: "manual", date: parsedFormDate(data, "date"),
        createdAt: old?.createdAt || new Date().toISOString()
      };
      const events = [];
      const deletedEventIds = new Set();
      const updates = new Map();
      if (old && !paidOffset) {
        for (const event of state.debtEvents.filter((entry) => entry.kind === "offset" && entry.debtId === old.id && entry.linkedDebtId)) {
          const counterpart = state.debts.find((entry) => entry.id === event.linkedDebtId);
          if (counterpart) {
            const updated = updates.get(counterpart.id) || { ...counterpart };
            updated.offsetAmount = Math.max(0, Number(updated.offsetAmount || 0) - Number(event.amount));
            updates.set(updated.id, updated);
          }
        }
        state.debtEvents.filter((entry) => entry.kind === "offset" && (entry.debtId === old.id || entry.linkedDebtId === old.id))
          .forEach((event) => deletedEventIds.add(event.id));
        if (Math.abs(amount - Number(old.amount)) > .005) {
          events.push({ id: id(), debtId: debt.id, kind: "adjusted", amount: amount - Number(old.amount), date: today(), createdAt: new Date().toISOString() });
        }
        const availableDebts = state.debts.filter((entry) => entry.id !== old.id).map((entry) => updates.get(entry.id) || entry);
        addDebtWithOffsets(debt, events, availableDebts);
      } else if (!old) {
        events.push({ id: id(), debtId: debt.id, kind: "created", amount, date: debt.date, createdAt: new Date().toISOString() });
        addDebtWithOffsets(debt, events);
      }
      const touched = new Set(events.map((event) => event.debtId));
      for (const entry of state.debts.filter((item) => touched.has(item.id))) {
        if (entry.id !== debt.id && !updates.has(entry.id)) updates.set(entry.id, entry);
      }
      await db.putAndDelete({ debts: [debt, ...updates.values()], debtEvents: events }, { debtEvents: [...deletedEventIds] });
      closeDialog(); await refresh(); notify(old ? "Deuda actualizada." : "Deuda registrada.");
    } else if (formType === "debt-collection") {
      const tx = state.transactions.find((entry) => entry.id === form.dataset.id);
      const debt = state.debts.find((entry) => entry.id === tx?.debtId);
      const event = state.debtEvents.find((entry) => entry.transactionId === tx?.id && entry.kind === "payment");
      if (!tx || !debt || !event || debt.direction !== "owed_to_me") throw new Error("No se encuentra el abono de deuda que quieres editar.");
      const amount = num("amount");
      if (!(amount > 0)) throw new Error("El importe debe ser mayor que cero.");
      const date = parsedFormDate(data, "date");
      if (date > today()) throw new Error("Un abono recibido no puede registrarse en una fecha futura.");
      const account = getAccount(String(get("accountId")));
      if (!account || account.archived) throw new Error("Selecciona una cuenta activa.");
      const otherPaid = Number(debt.paidAmount || 0) - Number(event.amount);
      const maximum = Number(debt.amount) - Number(debt.forgivenAmount || 0) - Number(debt.offsetAmount || 0) - otherPaid;
      const debtAmount = Math.min(amount, maximum);
      const excess = amount - debtAmount;
      debt.paidAmount = otherPaid + debtAmount;
      event.amount = debtAmount;
      event.date = date;
      event.accountId = account.id;
      tx.amount = debtAmount;
      tx.ownAmount = debtAmount;
      tx.accountId = account.id;
      tx.accountName = account.name;
      tx.date = date;
      tx.person = debt.person;
      tx.note = String(get("note") || `Devolución de ${debt.person}`).trim();
      const group = tx.settlementGroupId ? state.transactions.filter((entry) => entry.settlementGroupId === tx.settlementGroupId && entry.type === "income" && entry.id !== tx.id) : [];
      const extra = group[0];
      const transactions = [tx];
      const deletes = { debts: [], debtEvents: [], transactions: [] };
      if (excess > .005) {
        tx.settlementGroupId ||= id();
        if (extra) {
          extra.amount = excess;
          extra.accountId = account.id;
          extra.accountName = account.name;
          extra.date = date;
          transactions.push(extra);
        } else {
          transactions.push({
            id: id(), type: "income", amount: excess, accountId: account.id, date, confirmed: true,
            settlementGroupId: tx.settlementGroupId || id(), note: `Excedente de devolución de ${debt.person}`,
            createdAt: tx.createdAt
          });
        }
      } else if (extra) deletes.transactions.push(extra.id);
      for (const redundant of group.slice(1)) deletes.transactions.push(redundant.id);
      await db.putAndDelete({ debts: [debt], debtEvents: [event], transactions }, deletes);
      closeDialog(); await refresh(); notify("Abono recibido actualizado.");
    } else if (formType === "debt-payment") {
      const debt = state.debts.find((entry) => entry.id === form.dataset.id);
      if (!debt || debtOutstanding(debt) <= .005) throw new Error("Esta deuda ya está liquidada.");
      const outstanding = debtOutstanding(debt);
      const incoming = debt.direction === "owed_to_me";
      const offsetRemaining = incoming ? 0 : Math.max(0, Number(debt.offsetAmount || 0) - Number(debt.offsetPaidAmount || 0));
      const grossDue = outstanding + offsetRemaining;
      const amount = num("amount");
      if (!(amount > 0) || (!incoming && amount > grossDue + .005)) throw new Error(`El importe no puede superar los ${money(incoming ? outstanding : grossDue)} pendientes.`);
      const date = parsedFormDate(data, "date");
      if (date > today()) throw new Error("Una devolución real no puede registrarse en una fecha futura.");
      const accountId = String(get("accountId"));
      const account = getAccount(accountId);
      if (!account || account.archived) throw new Error("Selecciona una cuenta activa.");
      const offsetCredit = incoming ? 0 : Math.min(amount, offsetRemaining);
      const cashPayment = incoming ? 0 : amount - offsetCredit;
      if (!incoming && accountFigures(account, state.accounts, state.transactions, state.goals, state.debts).free + .005 < cashPayment) {
        throw new Error("No hay suficiente saldo libre en esa cuenta para devolver la deuda.");
      }
      const debtAmount = incoming ? Math.min(amount, outstanding) : cashPayment;
      const excess = incoming ? Math.max(0, amount - debtAmount) : 0;
      const { tagIds, mains, subs } = !incoming || excess > .005
        ? readTagSelection(data, incoming ? "income" : "expense", true)
        : { tagIds: [], mains: [], subs: [] };
      const tag = mains[0] || null;
      const subtag = subs[0] || null;
      const txs = [];
      const settlementGroupId = id();
      if (incoming && debtAmount > .005) txs.push({
        id: id(), type: "debt_collection", amount: debtAmount, ownAmount: debtAmount, accountId,
        debtId: debt.id, person: debt.person, date, confirmed: true, settlementGroupId,
        note: String(get("note") || `Devolución de ${debt.person}`).trim(), createdAt: new Date().toISOString()
      });
      if (!incoming && amount > .005) txs.push({
        id: id(), type: "expense", amount, ownAmount: amount, accountId,
        debtId: debt.id, person: debt.person, date, confirmed: true, tagId: tag.id,
        subtagId: subtag?.id || null, tagIds, settlementGroupId,
        note: String(get("note") || `Devolución a ${debt.person}`).trim(), createdAt: new Date().toISOString()
      });
      if (excess > .005) txs.push({
        id: id(), type: "income", amount: excess, accountId, date, confirmed: true, tagId: tag.id,
        subtagId: subtag?.id || null, tagIds, settlementGroupId,
        note: `Excedente de devolución de ${debt.person}`, createdAt: new Date().toISOString()
      });
      if (!incoming && offsetCredit > .005) txs.push({
        id: id(), type: "income", amount: offsetCredit, accountId, date, confirmed: true, settlementGroupId,
        offsetForTransactionId: txs.find((tx) => tx.type === "expense")?.id || "",
        note: `Compensación de deuda de ${debt.person}`, createdAt: new Date().toISOString()
      });
      debt.paidAmount = Number(debt.paidAmount || 0) + debtAmount;
      debt.offsetPaidAmount = Number(debt.offsetPaidAmount || 0) + offsetCredit;
      const expenseTx = txs.find((tx) => tx.type === "expense");
      const events = [];
      if (debtAmount > .005) events.push({ id: id(), debtId: debt.id, kind: "payment", amount: debtAmount, offsetAmount: offsetCredit, date, accountId, transactionId: expenseTx?.id || txs[0]?.id, createdAt: new Date().toISOString() });
      else if (offsetCredit > .005) events.push({ id: id(), debtId: debt.id, kind: "offset-paid", amount: offsetCredit, offsetAmount: offsetCredit, date, accountId, transactionId: expenseTx?.id, createdAt: new Date().toISOString() });
      await db.putMany({ debts: [debt], debtEvents: events, transactions: txs });
      closeDialog(); await refresh(); notify(incoming ? excess > .005 ? `Deuda saldada; el excedente de ${money(excess)} se registró como ingreso.` : "Abono recibido en la cuenta seleccionada." : "Devolución registrada como gasto.");
    } else if (formType === "debt-forgiveness") {
      const debt = state.debts.find((entry) => entry.id === form.dataset.id);
      if (!debt || debtOutstanding(debt) <= .005) throw new Error("Esta deuda ya está liquidada.");
      const amount = debtOutstanding(debt);
      const account = getAccount(String(get("accountId")));
      if (!account || account.archived) throw new Error("Selecciona una cuenta activa.");
      if (amount > accountBalance(account, state.transactions) + .005) throw new Error("La cuenta seleccionada no tiene saldo suficiente para registrar este gasto.");
      const { tagIds, mains, subs } = readTagSelection(data, "expense", true);
      const tag = mains[0];
      const subtag = subs[0] || null;
      debt.forgivenAmount = Number(debt.forgivenAmount || 0) + amount;
      const tx = { id: id(), type: "expense", amount, ownAmount: amount, accountId: account.id, debtId: debt.id, person: debt.person, tagId: tag.id, subtagId: subtag?.id || null, tagIds, date: today(), confirmed: true, note: `Deuda perdonada: ${debt.person}`, createdAt: new Date().toISOString() };
      const event = { id: id(), debtId: debt.id, kind: "forgiveness", amount, date: today(), transactionId: tx.id, accountId: account.id, createdAt: new Date().toISOString() };
      await db.putMany({ debts: [debt], debtEvents: [event], transactions: [tx] });
      closeDialog(); await refresh(); notify("Perdón anotado como gasto; el historial se conserva.");
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : "No se pudo guardar. Inténtalo de nuevo.");
  }
}

async function handleAction(action, target) {
  const idValue = target.dataset.id;
  if (action === "close-dialog") closeDialog();
  else if (action === "open-date-picker") {
    showDateCalendar(target);
  } else if (action === "shift-calendar") {
    showDateCalendar(target, Number(target.dataset.offset));
  } else if (action === "select-calendar-date") {
    const input = document.getElementById(target.dataset.target);
    if (input) {
      input.value = formatDate(target.dataset.date);
      closeDateCalendar();
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  else if (action === "cancel-confirmation") {
    const resolve = state.pendingConfirmation;
    state.pendingConfirmation = null;
    closeDialog();
    resolve?.(false);
  }
  else if (action === "add-expense-share") $("#expense-share-list", dialog)?.insertAdjacentHTML("beforeend", expenseShareRow());
  else if (action === "add-account-transfer") $("#account-transfer-list", dialog)?.insertAdjacentHTML("beforeend", accountTransferRow(dialog.querySelector('form[data-form="account-delete"]')?.dataset.id || ""));
  else if (action === "remove-account-transfer") {
    if ($$("#account-transfer-list .account-transfer-row", dialog).length > 1) target.closest(".account-transfer-row")?.remove();
  }
  else if (action === "remove-expense-share") {
    target.closest(".share-row")?.remove();
    if (!$("#expense-share-list .share-row", dialog)) $("#expense-share-list", dialog)?.insertAdjacentHTML("beforeend", expenseShareRow());
  }
  else if (action === "new-account") accountForm();
  else if (action === "edit-account") accountForm(getAccount(idValue));
  else if (action === "manage-accounts") manageAccountsDialog();
  else if (action === "adjust-account") { const account = getAccount(idValue); if (account) adjustmentForm(account); }
  else if (action === "archive-account") {
    const account = getAccount(idValue);
    if (account) deleteAccountForm(account);
  } else if (action === "restore-account") {
    const account = getAccount(idValue); if (account) { account.archived = false; await db.put("accounts", account); await refresh(); }
  } else if (action === "new-expense") transactionForm("expense");
  else if (action === "new-income") transactionForm("income");
  else if (action === "edit-transaction") {
    const clicked = state.transactions.find((entry) => entry.id === idValue);
    const tx = clicked?.offsetForTransactionId
      ? state.transactions.find((entry) => entry.id === clicked.offsetForTransactionId)
      : clicked;
    if (tx && (tx.type === "income" || tx.type === "expense")) transactionForm(tx.type, tx);
  }   else if (action === "delete-transaction") {
    const tx = state.transactions.find((entry) => entry.id === idValue);
    const movementName = tx?.type === "income" ? "ingreso" : tx?.type === "debt_collection" ? "abono recibido" : "gasto";
    if (tx && await confirmInDialog("Eliminar movimiento", `Se eliminará el ${movementName} de ${money(tx.amount)} y se recalcularán el saldo, las deudas y las estadísticas.`, "Eliminar")) {
      await removeTransaction(tx);
      notify("Movimiento eliminado y datos relacionados recalculados.");
    }
  }
  else if (action === "transfer") transferForm();
  else if (action === "select-accounts") accountFilterDialog("home");
  else if (action === "stats-accounts") accountFilterDialog("stats");
  else if (action === "stats-tags") tagFilterDialog();
  else if (action === "new-debt") debtForm(target.dataset.direction || "i_owe");
  else if (action === "edit-debt") {
    const debt = state.debts.find((entry) => entry.id === idValue);
    if (debt) debtForm(debt.direction, debt);
  } else if (action === "edit-source-debt") {
    const debt = state.debts.find((entry) => entry.id === idValue);
    const source = state.transactions.find((entry) => entry.id === debt?.transactionId);
    if (source) transactionForm("expense", source);
    else notify("No se encuentra el gasto dividido que originó esta deuda.");
  } else if (action === "delete-debt") {
    const debt = state.debts.find((entry) => entry.id === idValue);
    if (debt && await confirmInDialog(
      "Eliminar deuda",
      `Se eliminará la deuda de ${money(debt.amount)} junto con sus abonos relacionados. ${debt.source === "expense" ? "La parte de esta persona pasará a contar como gasto propio en el movimiento dividido." : ""}`,
      "Eliminar"
    )) {
      await removeDebt(debt);
      notify("Deuda eliminada y saldos recalculados.");
    }
  } else if (action === "edit-debt-payment") {
    const tx = state.transactions.find((entry) => entry.id === idValue);
    if (tx?.type === "debt_collection") debtCollectionForm(tx);
    else if (tx?.type === "expense") transactionForm("expense", tx);
    else if (tx?.type === "income") transactionForm("income", tx);
    else notify("Este tipo de abono no se puede editar desde aquí.");
  }
  else if (action === "pay-debt") {
    const debt = state.debts.find((entry) => entry.id === idValue);
    if (debt) debtPaymentForm(debt);
  } else if (action === "forgive-debt") {
    const debt = state.debts.find((entry) => entry.id === idValue);
    if (debt) forgiveDebtForm(debt);
  }
  else if (action === "new-tag") tagForm();
  else if (action === "create-tag-for-context") createTagFromContext(target);
  else if (action === "edit-tag") {
    const tag = state.tags.find((entry) => entry.id === idValue);
    if (tag) tagForm(tag, tag.kind || "expense");
  }
  else if (action === "delete-tag") {
    const tag = state.tags.find((entry) => entry.id === idValue);
    if (tag && await confirmInDialog("Eliminar etiqueta", `La etiqueta «${tag.name}» y sus subetiquetas se eliminarán. Se quitarán de movimientos y presupuestos; los presupuestos que se queden sin etiquetas también se eliminarán. El historial financiero se conservará.`, "Eliminar")) {
      const ids = new Set([tag.id]);
      const tagUpdates = new Map();
      if (tagRole(tag, "main")) {
        const parentsToRemove = [tag.id];
        while (parentsToRemove.length) {
          const parentId = parentsToRemove.pop();
          for (const child of state.tags.filter((entry) => tagParents(tagUpdates.get(entry.id) || entry).includes(parentId))) {
            const current = tagUpdates.get(child.id) || child;
            const parentIds = tagParents(current).filter((entry) => entry !== parentId);
            if (parentIds.length) tagUpdates.set(child.id, { ...current, parentIds, parentId: parentIds[0] });
            else if (!ids.has(child.id)) {
              ids.add(child.id);
              parentsToRemove.push(child.id);
            }
          }
        }
      }
      const transactions = state.transactions.filter((tx) => transactionTagIds(tx).some((tagId) => ids.has(tagId))).map((tx) => {
        const remaining = transactionTagIds(tx).filter((tagId) => !ids.has(tagId));
        const rootTag = remaining.find((tagId) => {
          const entry = state.tags.find((item) => item.id === tagId);
          return entry && tagRole(entry, "main");
        });
        const childTag = remaining.find((tagId) => {
          const entry = state.tags.find((item) => item.id === tagId);
          return entry && tagRole(entry, "sub");
        });
        return { ...tx, tagIds: remaining, tagId: rootTag || remaining[0] || null, subtagId: childTag || null };
      });
      const linkedBudgets = state.budgets.filter((budget) => (budget.tagIds || (budget.tagId ? [budget.tagId] : [])).some((tagId) => ids.has(tagId)));
      const budgetUpdates = [];
      const budgetDeletes = [];
      for (const budget of linkedBudgets) {
        const tagIds = (budget.tagIds || (budget.tagId ? [budget.tagId] : [])).filter((tagId) => !ids.has(tagId));
        if (!tagIds.length) budgetDeletes.push(budget.id);
        else budgetUpdates.push({ ...budget, tagIds, tagId: tagIds[0] });
      }
      await db.putAndDelete({ tags: [...tagUpdates.values()].filter((entry) => !ids.has(entry.id)), transactions, budgets: budgetUpdates }, { tags: [...ids], budgets: budgetDeletes });
      await refresh(); notify("Etiqueta eliminada; los movimientos y presupuestos conservan su historial.");
    }
  }
  else if (action === "new-goal") goalForm();
  else if (action === "edit-goal") { const goal = state.goals.find((entry) => entry.id === idValue); if (goal) goalForm(goal); }
  else if (action === "delete-goal") {
    const goal = state.goals.find((entry) => entry.id === idValue);
    if (goal && await confirmInDialog("Eliminar objetivo", `Se eliminará «${goal.name}» y sus presupuestos asociados. Los movimientos ya registrados se mantendrán en el historial sin reserva de ahorro.`, "Eliminar")) {
      await db.putAndDelete({}, { goals: [goal.id], budgets: state.budgets.filter((budget) => budget.goalId === goal.id).map((budget) => budget.id) });
      await refresh(); notify("Objetivo y presupuestos asociados eliminados.");
    }
  }
  else if (action === "contribute") { const goal = state.goals.find((item) => item.id === idValue); if (goal) contributeForm(goal); }
  else if (action === "withdraw-saving") { const goal = state.goals.find((item) => item.id === idValue); if (goal) contributeForm(goal, "out"); }
  else if (action === "buy-goal") { const goal = state.goals.find((item) => item.id === idValue); if (goal) buyGoalForm(goal); }
  else if (action === "new-budget") budgetForm();
  else if (action === "edit-budget") { const budget = state.budgets.find((entry) => entry.id === idValue); if (budget) budgetForm(budget); }
  else if (action === "delete-budget") {
    const budget = state.budgets.find((entry) => entry.id === idValue);
    if (budget && await confirmInDialog("Eliminar presupuesto", "Se eliminará el presupuesto. Los movimientos asociados permanecerán intactos.", "Eliminar")) {
      await db.delete("budgets", budget.id); await refresh(); notify("Presupuesto eliminado.");
    }
  }
  else if (action === "toggle-archived") archivedToggle();
  else if (action === "hide-budget" || action === "unhide-budget") {
    const budget = state.budgets.find((entry) => entry.id === idValue);
    if (budget) { budget.hidden = action === "hide-budget"; await db.put("budgets", budget); await refresh(); }
  } else if (action === "hide-goal") {
    const goal = state.goals.find((entry) => entry.id === idValue);
    if (goal) { goal.hidden = !goal.hidden; await db.put("goals", goal); await refresh(); }
  } else if (action === "confirm-income" || action === "confirm-transaction") {
    const tx = state.transactions.find((entry) => entry.id === idValue);
    if (tx && ["income", "expense"].includes(tx.type) && !tx.confirmed) {
      if (tx.date > today()) { notify("Confirma el movimiento cuando llegue su fecha; si ya ocurrió, edítalo y actualiza la fecha."); return; }
      const updated = { ...tx, confirmed: true, confirmedAt: new Date().toISOString() };
      if (tx.type === "expense") {
        const account = getAccount(tx.accountId);
        if (!account || account.archived) throw new Error("La cuenta de este gasto ya no está disponible.");
        const figures = accountFigures(account, state.accounts, state.transactions, state.goals, state.debts);
        if (tx.amount > figures.balance + .005) throw new Error(`El gasto supera el saldo total de la cuenta (${money(figures.balance)}).`);
        const shortage = Number(tx.amount) - figures.free;
        if (shortage > .005) {
          await saveExpenseWithRescue(updated, shortage);
          return;
        }
      }
      await persistEditedTransaction(updated, tx);
      notify(tx.type === "income" ? "Ingreso confirmado y añadido al saldo." : "Gasto confirmado y aplicado al saldo.");
    }
  } else if (action === "dismiss-rescue") {
    const tx = state.transactions.find((entry) => entry.id === idValue);
    if (tx) { tx.alertDismissed = true; await db.put("transactions", tx); await refresh(); }
  } else if (action === "cancel-rescue") { closeDialog(); notify("No se guardó el gasto."); }
  else if (action === "export-data") await exportData();
}

async function exportData() {
  try {
    const payload = await db.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `organizador-dinero-${today()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    notify("Copia descargada.");
  } catch (error) { notify(error instanceof Error ? error.message : "No se pudo exportar la copia."); }
}

async function importData(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (!await confirmInDialog("Importar copia", "Importar reemplazará todas las cuentas y movimientos actuales de este dispositivo. Asegúrate de tener una copia de seguridad reciente.", "Importar")) return;
    await db.importAll(payload);
    await refresh();
    notify("Copia importada correctamente.");
  } catch (error) { showImportError(error instanceof Error ? error.message : "No se pudo importar el archivo."); }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-view]");
  if (button) { setNav(button.dataset.view); return; }
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    try { await handleAction(actionButton.dataset.action, actionButton); }
    catch (error) {
      console.error(error);
      notify(error instanceof Error ? error.message : "No se pudo completar la operación.");
    }
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  submitForm(form);
});

document.addEventListener("pointerdown", (event) => {
  const popup = document.querySelector(".date-calendar-popup");
  if (popup && !popup.contains(event.target) && !event.target.closest('[data-action="open-date-picker"]')) closeDateCalendar();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.dateCalendar) {
    event.preventDefault();
    event.stopPropagation();
    closeDateCalendar();
  }
}, true);

document.addEventListener("scroll", () => {
  if (!state.dateCalendar) return;
  const popup = document.querySelector(".date-calendar-popup");
  const anchor = $$('[data-action="open-date-picker"]').find((button) => button.dataset.target === state.dateCalendar.target);
  if (!popup || !anchor) return closeDateCalendar();
  const bounds = anchor.getBoundingClientRect();
  if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return closeDateCalendar();
  positionDateCalendar(popup, anchor);
}, true);

dialog.addEventListener("cancel", () => {
  const resolve = state.pendingConfirmation;
  state.pendingConfirmation = null;
  resolve?.(false);
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.form?.dataset.form === "account-filter") {
    const all = $('input[name="all"]', target.form);
    if (target.name === "all" && target.checked) $$('input[name="accountId"]', target.form).forEach((input) => { input.checked = false; });
    else if (target.name === "accountId" && target.checked && all) all.checked = false;
  } else if (target.form?.dataset.form === "tag-filter") {
    const all = $('input[name="all"]', target.form);
    if (target.name === "all" && target.checked) $$('input[name="tagId"]', target.form).forEach((input) => { input.checked = false; });
    else if (target.name === "tagId" && target.checked && all) all.checked = false;
  } else if (target.id === "activity-period") { state.activityPeriod = target.value; render(); }
  else if (target.id === "activity-from") updateActivityDateFilter(target, "activityFrom");
  else if (target.id === "activity-to") updateActivityDateFilter(target, "activityTo");
  else if (target.id === "activity-account") { state.activityAccount = target.value; render(); }
  else if (target.id === "activity-tag") { state.activityTag = target.value; render(); }
  else if (target.id === "stats-period") { state.statsPeriod = target.value; render(); }
  else if (target.id === "stats-day") updateDateFilter(target, "statsDay");
  else if (target.id === "stats-from") updateDateFilter(target, "statsFrom");
  else if (target.id === "stats-to") updateDateFilter(target, "statsTo");
  else if (target.id === "forecast-date") updateDateFilter(target, "forecastDate");
  else if (target.id === "tx-type") {
    const pending = $("#pending-income-wrap", dialog);
    if (pending) pending.hidden = false;
    const pendingLabel = $("#pending-transaction-label", dialog);
    if (pendingLabel) pendingLabel.textContent = `${target.value === "income" ? "Ingreso" : "Gasto"} previsto: no sumarlo al saldo hasta confirmar que ocurrió`;
    const selected = $$('input[name="tagIds"]:checked', dialog).map((input) => input.value);
    const picker = $("#transaction-tag-picker", dialog);
    if (picker) picker.innerHTML = tagCascadePicker(target.value, selected.filter((tagId) => {
      const tag = state.tags.find((entry) => entry.id === tagId);
      return tag && (!tag.kind || tag.kind === target.value);
    }));
    const sharing = $("#expense-sharing", dialog);
    if (sharing) sharing.hidden = target.value !== "expense" || Boolean($("#pending-income", dialog)?.checked);
    const pendingBox = $("#pending-income", dialog);
    if (pendingBox && (parseDate($("#tx-date", dialog)?.value) || "") > today()) pendingBox.checked = true;
  } else if (target.name === "tagIds" && ["transaction", "budget", "debt-payment", "debt-forgiveness", "contribute", "buy-goal"].includes(target.form?.dataset.form)) {
    const picker = target.closest("[id$='tag-picker']");
    if (picker) {
      const formType = target.form.dataset.form;
      const kind = formType === "transaction" ? $("#tx-type", target.form)?.value || "expense" : formType === "debt-payment" ? target.form.dataset.kind : "expense";
      refreshTagCascadePicker(picker, kind);
    }
  } else if (target.id === "split-enabled") {
    const fields = $("#split-fields", dialog);
    if (fields) fields.hidden = !target.checked;
  } else if (target.id === "tx-date") {
    const pendingBox = $("#pending-income", dialog);
    if (pendingBox && (parseDate(target.value) || "") > today()) pendingBox.checked = true;
  } else if (target.id === "pending-income") {
    const sharing = $("#expense-sharing", dialog);
    if (sharing && $("#tx-type", dialog)?.value === "expense") sharing.hidden = target.checked;
  } else if (target.id === "tag-hierarchy") {
    const parentField = $("#tag-parent-field", dialog);
    if (parentField) parentField.hidden = target.value === "main";
  } else if (target.name === "kind" && target.form?.dataset.form === "tag") {
    const parentPicker = $("[data-tag-parent-options]", target.form);
    if (parentPicker) parentPicker.innerHTML = tagParentPicker(target.value, state.tags.find((tag) => tag.id === target.form.dataset.id));
  } else if (target.id === "budget-kind") {
    const goal = $("#budget-goal-field", dialog);
    if (goal) goal.hidden = target.value !== "saving";
  } else if (target.name === "mode" && target.form?.dataset.form === "account-delete") {
    const transferList = $("#account-transfer-list", dialog);
    if (transferList) transferList.hidden = target.value !== "transfer";
    const addButton = $('[data-action="add-account-transfer"]', dialog);
    if (addButton) addButton.hidden = target.value !== "transfer";
  } else if (target.id === "import-file" && target.files?.[0]) importData(target.files[0]);
});

$("#today-label").textContent = formatDate(today());
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch((error) => console.error("No se pudo registrar el service worker:", error));
}

refresh().catch((error) => {
  console.error(error);
  root.innerHTML = `<section class="panel">${emptyState("No se pudo abrir la base local", error instanceof Error ? error.message : "Comprueba los permisos del navegador y vuelve a cargar la página.")}</section>`;
});
