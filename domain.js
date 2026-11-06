export const currency = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export const money = (value) => currency.format(Number(value) || 0);
export const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
export const formatDate = (date) => {
  const [year, month, day] = String(date || "").slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
};
export const parseDate = (value) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
  if (!match) return "";
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return "";
  return `${year}-${month}-${day}`;
};
export const monthKey = (date = today()) => String(date).slice(0, 7);
export const id = () => crypto.randomUUID();

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function txBalanceImpact(tx, accountId) {
  if (!tx.confirmed || (tx.date && tx.date > today())) return 0;
  if (tx.type === "income") return tx.accountId === accountId ? Number(tx.amount) : 0;
  if (tx.type === "debt_collection") return tx.accountId === accountId ? Number(tx.amount) : 0;
  if (tx.type === "expense") return tx.accountId === accountId ? -Number(tx.amount) : 0;
  if (tx.type === "debt_payment") return tx.accountId === accountId ? -Number(tx.amount) : 0;
  if (tx.type === "adjustment") return tx.accountId === accountId ? Number(tx.amount) : 0;
  if (tx.type === "transfer") {
    return (tx.accountId === accountId ? -Number(tx.amount) : 0) + (tx.toAccountId === accountId ? Number(tx.amount) : 0);
  }
  return 0;
}

export function accountBalance(account, transactions) {
  return transactions.reduce((sum, tx) => sum + txBalanceImpact(tx, account.id), Number(account.openingBalance) || 0);
}

export function goalReserved(goal, transactions) {
  if (goal.completedAt) return 0;
  return transactions.reduce((sum, tx) => {
    if (tx.type === "saving" && tx.goalId === goal.id && tx.confirmed) return sum + Number(tx.amount);
    if (tx.type === "expense" && tx.confirmed) {
      if (tx.savingsDraws) return sum - tx.savingsDraws.filter((draw) => draw.goalId === goal.id).reduce((total, draw) => total + Number(draw.amount), 0);
      if (tx.savingsGoalId === goal.id) return sum - Number(tx.savingsUsed || 0);
    }
    return sum;
  }, 0);
}

export function debtOutstanding(debt) {
  return Math.max(0, Number(debt.amount) - Number(debt.paidAmount || 0) - Number(debt.forgivenAmount || 0) - Number(debt.offsetAmount || 0));
}

export function goalReservedByAccount(goal, accountId, transactions) {
  if (goal.completedAt) return 0;
  return transactions.reduce((sum, tx) => {
    if (tx.type === "saving" && tx.goalId === goal.id && tx.confirmed && (tx.accountId || goal.accountId) === accountId) return sum + Number(tx.amount);
    if (tx.type === "expense" && tx.confirmed) {
      if (tx.savingsDraws) return sum - tx.savingsDraws.filter((draw) => draw.goalId === goal.id && (draw.accountId || tx.accountId) === accountId).reduce((total, draw) => total + Number(draw.amount), 0);
      if (tx.savingsGoalId === goal.id && tx.accountId === accountId) return sum - Number(tx.savingsUsed || 0);
    }
    return sum;
  }, 0);
}

export function accountFigures(account, accounts, transactions, goals, debts = []) {
  const balance = accountBalance(account, transactions);
  const reserved = goals.reduce((sum, goal) => sum + goalReservedByAccount(goal, account.id, transactions), 0);
  const debtHold = debts.filter((debt) => debt.direction === "owed_to_me" && debt.accountId === account.id)
    .reduce((sum, debt) => sum + debtOutstanding(debt), 0);
  return { balance, reserved, debtHold, free: balance - reserved - debtHold };
}

export function transactionMatchesTag(tx, tagId) {
  if (Array.isArray(tagId)) return !tagId.length || tagId.some((id) => transactionMatchesTag(tx, id));
  return !tagId || tx.tagId === tagId || tx.subtagId === tagId || (tx.tagIds || []).includes(tagId);
}

export function transactionTagIds(tx) {
  return [...new Set([...(tx.tagIds || []), tx.tagId, tx.subtagId].filter(Boolean))];
}

export function expenseAmount(tx) {
  return Math.max(0, Number(tx.ownAmount ?? tx.amount) || 0);
}

export function transactionInPeriod(tx, period, now = new Date()) {
  if (!period || period === "all") return true;
  if (period === "month") return tx.date.slice(0, 7) === monthKey(now.toISOString());
  if (period === "year") return tx.date.slice(0, 4) === String(now.getFullYear());
  return tx.date.slice(0, 7) === period;
}

export function budgetProgress(budget, transactions) {
  const tagIds = budget.tagIds?.length ? budget.tagIds : (budget.tagId ? [budget.tagId] : []);
  return transactions.reduce((sum, tx) => {
    if (!tx.confirmed || tx.date > today() || monthKey(tx.date) !== budget.period || (tagIds.length && !tagIds.some((tagId) => transactionMatchesTag(tx, tagId)))) return sum;
    if (budget.kind === "saving") return tx.type === "saving" && (!budget.goalId || tx.goalId === budget.goalId) ? sum + Number(tx.amount) : sum;
    return tx.type === "expense" || tx.type === "debt_payment" ? sum + expenseAmount(tx) : sum;
  }, 0);
}

export function tagName(tagId, tags) {
  return tags.find((tag) => tag.id === tagId)?.name || "Sin etiqueta";
}

export function accountName(accountId, accounts, originalName = "") {
  return accounts.find((account) => account.id === accountId)?.name || originalName || "Cuenta";
}
