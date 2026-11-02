import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import Expense, { EXPENSE_FIELDS } from '../models/Expense.js';
import ExpenseCategory from '../models/ExpenseCategory.js';
import { TIMEZONE } from '../config/booking.js';
import { isValidDateStr, dublinDateOf } from '../utils/slotMath.js';
import { asyncHandler, pick, HttpError, escapeRegex } from '../utils/asyncHandler.js';

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

const present = (e) => ({
  _id: e._id,
  category: e.category || null,
  categoryName: e.categoryName,
  name: e.name,
  detail: e.detail || '',
  amount: e.amount,
  date: e.date,
  dateLocal: dublinDateOf(new Date(e.date).getTime()), // YYYY-MM-DD in Irish time, for the edit form
  receiptUrl: e.receiptUrl || '',
  receiptName: e.receiptName || '',
});

// ---------------- categories ----------------

export const listCategories = asyncHandler(async (_req, res) => {
  const categories = await ExpenseCategory.find().sort({ name: 1 }).lean();
  res.json({ categories });
});

const cleanAmount = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10000000) throw new HttpError(400, 'Enter a valid amount');
  return money(n);
};

export const createCategory = asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new HttpError(400, 'Enter the category name');
  if (name.length > 80) throw new HttpError(400, 'The category name is too long');
  if (await ExpenseCategory.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })) {
    throw new HttpError(409, 'This category already exists');
  }
  const category = await ExpenseCategory.create({ name, defaultAmount: cleanAmount(req.body?.defaultAmount) });
  res.status(201).json({ category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await ExpenseCategory.findById(req.params.id);
  if (!category) throw new HttpError(404, 'Category not found');
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new HttpError(400, 'Enter the category name');
    const clash = await ExpenseCategory.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i'), _id: { $ne: category._id } });
    if (clash) throw new HttpError(409, 'This category already exists');
    category.name = name;
  }
  if (req.body?.defaultAmount !== undefined) category.defaultAmount = cleanAmount(req.body.defaultAmount);
  await category.save();
  res.json({ category });
});

// Expenses already recorded keep their category name, so a category can be removed safely
export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await ExpenseCategory.findById(req.params.id);
  if (!category) throw new HttpError(404, 'Category not found');
  await category.deleteOne();
  res.json({ message: 'Category removed' });
});

// ---------------- expenses ----------------

const dayStart = (s) => DateTime.fromISO(s, { zone: TIMEZONE }).startOf('day').toJSDate();

// GET /api/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD&categoryId=&search=
export const listExpenses = asyncHandler(async (req, res) => {
  const { from, to, categoryId, search } = req.query;
  const filter = {};

  if (from || to) {
    filter.date = {};
    if (from) {
      if (!isValidDateStr(from)) throw new HttpError(400, 'Dates must be in YYYY-MM-DD format');
      filter.date.$gte = dayStart(from);
    }
    if (to) {
      if (!isValidDateStr(to)) throw new HttpError(400, 'Dates must be in YYYY-MM-DD format');
      filter.date.$lt = DateTime.fromISO(to, { zone: TIMEZONE }).plus({ days: 1 }).startOf('day').toJSDate();
    }
  }
  if (categoryId) {
    if (!mongoose.isValidObjectId(categoryId)) throw new HttpError(400, 'Invalid category');
    filter.category = categoryId;
  }
  const term = String(search || '').trim();
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i');
    filter.$or = [{ name: rx }, { detail: rx }, { categoryName: rx }];
  }

  const rows = await Expense.find(filter).sort({ date: -1, _id: -1 }).limit(500).lean();
  res.json({
    expenses: rows.map(present),
    total: money(rows.reduce((sum, e) => sum + e.amount, 0)),
    count: rows.length,
  });
});

// Checks the fields of a create / update and turns them into what is stored
async function cleanExpense(body, { partial = false } = {}) {
  const out = {};
  const need = (cond, msg) => {
    if (!cond) throw new HttpError(400, msg);
  };

  if (!partial || body.category !== undefined) {
    need(mongoose.isValidObjectId(body.category), 'Choose a category');
    const category = await ExpenseCategory.findById(body.category);
    need(category, 'That category no longer exists');
    out.category = category._id;
    out.categoryName = category.name;
  }
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    need(name, 'Enter the expense name');
    need(name.length <= 150, 'The expense name is too long');
    out.name = name;
  }
  if (!partial || body.amount !== undefined) {
    const amount = Number(body.amount);
    need(Number.isFinite(amount) && amount > 0 && amount <= 10000000, 'Enter a valid amount');
    out.amount = money(amount);
  }
  if (!partial || body.date !== undefined) {
    need(isValidDateStr(String(body.date || '')), 'Choose the date');
    out.date = dayStart(body.date);
  }
  if (body.detail !== undefined) {
    const detail = String(body.detail || '').trim();
    need(detail.length <= 500, 'Keep the detail under 500 characters');
    out.detail = detail;
  }
  if (body.receiptUrl !== undefined) {
    const url = String(body.receiptUrl || '').trim();
    need(!url || (/^https:\/\//i.test(url) && url.length <= 500), 'The receipt must be an uploaded file');
    out.receiptUrl = url;
    out.receiptName = url ? String(body.receiptName || '').trim().slice(0, 200) : '';
  }
  return out;
}

export const createExpense = asyncHandler(async (req, res) => {
  const data = await cleanExpense(pick(req.body, EXPENSE_FIELDS));
  const expense = await Expense.create({ ...data, createdBy: req.user._id });
  res.status(201).json({ expense: present(expense) });
});

export const updateExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new HttpError(404, 'Expense not found');
  expense.set(await cleanExpense(pick(req.body, EXPENSE_FIELDS), { partial: true }));
  await expense.save();
  res.json({ expense: present(expense) });
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new HttpError(404, 'Expense not found');
  await expense.deleteOne();
  res.json({ message: 'Expense removed' });
});