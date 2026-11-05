/**
 * Family Planner API
 * Paste this whole file into Extensions > Apps Script in the
 * "Family Planner 2027 - Rany & Sombo" Google Sheet.
 * Then follow the README to set your family PIN and deploy it as a web app.
 *
 * Every request must include the family PIN. The PIN is stored in
 * Project Settings > Script properties as FAMILY_PIN (never in this file).
 */

// Dates are formatted in the spreadsheet's own time zone (Asia/Phnom_Penh).
let tzCache_ = null;
function tz_() {
  if (!tzCache_) tzCache_ = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return tzCache_;
}
const MAX_FAILED_TRIES = 10;      // per 10 minutes, then requests are refused
const LOCK_MINUTES = 10;

// ---------- entry points ----------

function doGet() {
  return json_({ ok: true, message: 'Family Planner API is running.' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkPin_(body.pin);
    const action = body.action;
    const data = body.data || {};

    switch (action) {
      case 'getAll':     return json_({ ok: true, data: getAll_() });
      case 'addPlan':    return json_({ ok: true, row: addPlan_(data) });
      case 'addSpending':return json_({ ok: true, row: addSpending_(data) });
      case 'addIncome':  return json_({ ok: true, row: addIncome_(data) });
      case 'updateRow':  return json_({ ok: true, updated: updateRow_(data) });
      case 'deleteRow':  return json_({ ok: true, deleted: deleteRow_(data) });
      default: throw new Error('Unknown action: ' + action);
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ---------- security ----------

function checkPin_(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('failedTries') || 0);
  if (fails >= MAX_FAILED_TRIES) {
    throw new Error('Too many wrong PINs. Try again in ' + LOCK_MINUTES + ' minutes.');
  }
  const realPin = PropertiesService.getScriptProperties().getProperty('FAMILY_PIN');
  if (!realPin) throw new Error('FAMILY_PIN is not set in Script properties.');
  if (String(pin || '') !== String(realPin)) {
    cache.put('failedTries', String(fails + 1), LOCK_MINUTES * 60);
    throw new Error('Wrong PIN');
  }
}

// ---------- reading ----------

function getAll_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lists = ss.getSheetByName('Lists');
  const budget = ss.getSheetByName('Budget');
  const holidays = ss.getSheetByName('Public Holidays');

  return {
    plans: readTable_(ss.getSheetByName('Plans'), 5, ['date', 'plan', 'category', 'who', 'notes']),
    spending: readTable_(ss.getSheetByName('Spending'), 9,
      ['date', 'item', 'category', 'amount', 'currency', 'amountUsd', 'paidBy', 'note', 'receipt']),
    income: readTable_(ss.getSheetByName('Income'), 6,
      ['date', 'who', 'amount', 'currency', 'amountUsd', 'note']),
    budget: budget.getRange(2, 1, 26, 5).getValues()
      .filter(r => r[1] !== '')
      .map(r => ({ group: r[0], category: r[1], monthly: Number(r[4]) || 0 })),
    expectedIncome: Number(budget.getRange('E33').getValue()) || 0,
    holidays: holidays.getRange(5, 1, 56, 3).getValues()
      .filter(r => r[0] instanceof Date)
      .map(r => ({ date: fmt_(r[0]), name: r[2] })),
    khrPerUsd: Number(lists.getRange('F2').getValue()) || 4000,
    planCategories: colValues_(lists, 1),
    people: colValues_(lists, 2),
  };
}

function readTable_(sheet, numCols, keys) {
  const last = lastDataRow_(sheet);
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, numCols).getValues();
  const out = [];
  values.forEach((r, i) => {
    if (r[0] === '' && r[1] === '') return;
    const obj = { row: i + 2 };
    keys.forEach((k, j) => { obj[k] = r[j] instanceof Date ? fmt_(r[j]) : r[j]; });
    out.push(obj);
  });
  return out;
}

function colValues_(sheet, col) {
  return sheet.getRange(2, col, 20, 1).getValues().map(r => r[0]).filter(v => v !== '');
}

// ---------- writing ----------

/** Which cells each kind of entry fills. Formula columns (Amount USD) are skipped. */
function partsFor_(sheetName, d) {
  if (sheetName === 'Plans') {
    requireFields_(d, ['date', 'plan']);
    return [{ col: 1, values: [parseDate_(d.date), clean_(d.plan), clean_(d.category), clean_(d.who), clean_(d.notes)] }];
  }
  if (sheetName === 'Spending') {
    requireFields_(d, ['date', 'item', 'amount']);
    return [
      { col: 1, values: [parseDate_(d.date), clean_(d.item), clean_(d.category), toNumber_(d.amount), currency_(d.currency)] },
      { col: 7, values: [clean_(d.paidBy), clean_(d.note)] },
    ];
  }
  if (sheetName === 'Income') {
    requireFields_(d, ['date', 'who', 'amount']);
    return [
      { col: 1, values: [parseDate_(d.date), clean_(d.who), toNumber_(d.amount), currency_(d.currency)] },
      { col: 6, values: [clean_(d.note)] },
    ];
  }
  throw new Error('Cannot change ' + sheetName);
}

function addPlan_(d)     { return writeRow_('Plans', partsFor_('Plans', d)); }
function addSpending_(d) { return writeRow_('Spending', partsFor_('Spending', d)); }
function addIncome_(d)   { return writeRow_('Income', partsFor_('Income', d)); }

/** Throws unless the row's date and first text cell still match what the app showed. */
function checkUnchanged_(sheet, row, date, text) {
  if (!(row >= 2)) throw new Error('Bad row');
  const cells = sheet.getRange(row, 1, 1, 2).getValues()[0];
  const cellDate = cells[0] instanceof Date ? fmt_(cells[0]) : String(cells[0]);
  if (cellDate !== String(date) || String(cells[1]) !== String(text)) {
    throw new Error('This entry changed in the sheet. Refresh and try again.');
  }
}

/** Changes an existing row in place (same row, so nothing else moves). */
function updateRow_(d) {
  const parts = partsFor_(d.sheet, d);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(d.sheet);
    const row = Number(d.row);
    checkUnchanged_(sheet, row, d.origDate, d.origText);
    parts.forEach(p => sheet.getRange(row, p.col, 1, p.values.length).setValues([p.values]));
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Deletes a row only if its first two cells still match what the app showed. */
function deleteRow_(d) {
  const allowed = { Plans: true, Spending: true, Income: true };
  if (!allowed[d.sheet]) throw new Error('Cannot delete from ' + d.sheet);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(d.sheet);
    const row = Number(d.row);
    checkUnchanged_(sheet, row, d.date, d.text);
    sheet.deleteRow(row);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function writeRow_(sheetName, parts) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    const row = lastDataRow_(sheet) + 1;
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    parts.forEach(p => sheet.getRange(row, p.col, 1, p.values.length).setValues([p.values]));
    return row;
  } finally {
    lock.releaseLock();
  }
}

// ---------- helpers ----------

/** Last row with something in column A (ignores formulas that fill other columns). */
function lastDataRow_(sheet) {
  const colA = sheet.getRange(1, 1, sheet.getMaxRows(), 1).getValues();
  for (let i = colA.length - 1; i >= 0; i--) {
    if (colA[i][0] !== '' && colA[i][0] !== null) return i + 1;
  }
  return 1;
}

function requireFields_(d, fields) {
  fields.forEach(f => {
    if (d[f] === undefined || d[f] === null || String(d[f]).trim() === '') {
      throw new Error('Missing ' + f);
    }
  });
}

/** Returns the ISO text "2027-01-31". Google Sheets turns it into a real date
 *  in the sheet's own time zone, so the day never shifts. */
function parseDate_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) throw new Error('Date must look like 2027-01-31');
  return m[0];
}

function toNumber_(v) {
  const n = Number(String(v).replace(/,/g, ''));
  if (!isFinite(n) || n < 0) throw new Error('Amount must be a positive number');
  return n;
}

function currency_(c) {
  return c === 'KHR' ? 'KHR' : 'USD';
}

/** Plain text only, and never let text start like a formula. */
function clean_(v) {
  let s = String(v === undefined || v === null ? '' : v).trim().slice(0, 500);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function fmt_(d) {
  return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
