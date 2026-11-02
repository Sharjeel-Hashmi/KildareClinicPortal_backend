import { DateTime } from 'luxon';
import Invoice from '../models/Invoice.js';
import Expense from '../models/Expense.js';
import Patient from '../models/Patient.js';
import { TIMEZONE } from '../config/booking.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

// GET /api/finance/summary?year=2026&month=10      (month is optional: leave it out for the whole year)
// Income = invoice totals, Expenses = recorded expenses, Profit = Income - Expenses. Months are Irish months.
export const getSummary = asyncHandler(async (req, res) => {
  const nowYear = DateTime.now().setZone(TIMEZONE).year;
  const year = req.query.year === undefined ? nowYear : Number(req.query.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new HttpError(400, 'Choose a valid year');

  let month = null;
  if (req.query.month !== undefined && req.query.month !== '') {
    month = Number(req.query.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new HttpError(400, 'Choose a valid month');
  }

  const yearStart = DateTime.fromObject({ year, month: 1, day: 1 }, { zone: TIMEZONE }).startOf('day');
  const yearEnd = yearStart.plus({ years: 1 });
  const periodStart = month ? DateTime.fromObject({ year, month, day: 1 }, { zone: TIMEZONE }) : yearStart;
  const periodEnd = month ? periodStart.plus({ months: 1 }) : yearEnd;

  // same rule as the Invoices list: an invoice whose patient was deleted is not counted
  const patientIds = await Patient.distinct('_id');
  const invoiceMatch = (from, to) => ({ date: { $gte: from.toJSDate(), $lt: to.toJSDate() }, patient: { $in: patientIds } });
  const expenseMatch = (from, to) => ({ date: { $gte: from.toJSDate(), $lt: to.toJSDate() } });
  const byMonth = { $month: { date: '$date', timezone: TIMEZONE } };

  const [incomeMonths, expenseMonths, periodIncome, periodExpense, doctorRows, categoryRows] = await Promise.all([
    Invoice.aggregate([
      { $match: invoiceMatch(yearStart, yearEnd) },
      { $group: { _id: byMonth, total: { $sum: '$subtotal' } } },
    ]),
    Expense.aggregate([
      { $match: expenseMatch(yearStart, yearEnd) },
      { $group: { _id: byMonth, total: { $sum: '$amount' } } },
    ]),
    Invoice.aggregate([
      { $match: invoiceMatch(periodStart, periodEnd) },
      { $group: { _id: null, total: { $sum: '$subtotal' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: expenseMatch(periodStart, periodEnd) },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: invoiceMatch(periodStart, periodEnd) },
      { $group: { _id: '$createdBy', income: { $sum: '$subtotal' }, invoices: { $sum: 1 }, takenBy: { $last: '$takenBy' } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $sort: { income: -1 } },
    ]),
    Expense.aggregate([
      { $match: expenseMatch(periodStart, periodEnd) },
      { $group: { _id: '$categoryName', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
  ]);

  const income = new Map(incomeMonths.map((r) => [r._id, r.total]));
  const spent = new Map(expenseMonths.map((r) => [r._id, r.total]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const inc = money(income.get(m));
    const exp = money(spent.get(m));
    return { month: m, income: inc, expenses: exp, profit: money(inc - exp) };
  });

  const incomeTotal = money(periodIncome[0]?.total);
  const expenseTotal = money(periodExpense[0]?.total);

  res.set('Cache-Control', 'no-store');
  res.json({
    year,
    month,
    months,
    period: {
      income: incomeTotal,
      expenses: expenseTotal,
      profit: money(incomeTotal - expenseTotal),
      invoiceCount: periodIncome[0]?.count || 0,
      expenseCount: periodExpense[0]?.count || 0,
    },
    doctors: doctorRows.map((d) => ({
      id: d._id ? String(d._id) : null,
      name: d.user?.[0]?.name || d.takenBy || 'Unknown',
      income: money(d.income),
      invoices: d.invoices,
      share: incomeTotal > 0 ? Math.round((d.income / incomeTotal) * 1000) / 10 : 0,
    })),
    expenseByCategory: categoryRows.map((c) => ({ name: c._id, amount: money(c.amount), count: c.count })),
  });
});