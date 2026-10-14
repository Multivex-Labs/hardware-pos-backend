const db = require('../config/database')

// Helper: ongeza profit fields (cogs, gross_profit, total_expenses, net_profit)
// kwenye summary yoyote ya sales (leo au mwezi)
function buildProfitSummary(base, cogs, totalExpenses) {
  const revenue = parseFloat(base.revenue) || 0
  const cogsNum = parseFloat(cogs) || 0
  const expensesNum = parseFloat(totalExpenses) || 0
  const gross_profit = revenue - cogsNum
  const net_profit = gross_profit - expensesNum

  return {
    ...base,
    revenue: revenue.toFixed(2),
    cogs: cogsNum.toFixed(2),
    gross_profit: gross_profit.toFixed(2),
    total_expenses: expensesNum.toFixed(2),
    net_profit: net_profit.toFixed(2)
  }
}

const Report = {
  // Summary ya leo — sasa na Gross Profit, Expenses na Net Profit
  async todaySummary() {
    const [rows] = await db.execute(
      `SELECT COUNT(id) as total_sales, COALESCE(SUM(total),0) as revenue,
       COALESCE(SUM(discount),0) as total_discounts, COALESCE(AVG(total),0) as average_sale
       FROM sales WHERE DATE(created_at) = CURDATE()`
    )

    const [cogsRows] = await db.execute(
      `SELECT COALESCE(SUM(si.quantity * si.cost_price), 0) as cogs
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE DATE(s.created_at) = CURDATE()`
    )

    const [expenseRows] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM expenses WHERE expense_date = CURDATE()`
    )

    return buildProfitSummary(rows[0], cogsRows[0].cogs, expenseRows[0].total_expenses)
  },

  // Summary ya mwezi — sasa na Gross Profit, Expenses na Net Profit
  async monthlySummary(year, month) {
    const [rows] = await db.execute(
      `SELECT COUNT(id) as total_sales, COALESCE(SUM(total),0) as revenue,
       COALESCE(SUM(discount),0) as total_discounts, COALESCE(AVG(total),0) as average_sale
       FROM sales WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?`,
      [year, month]
    )

    const [cogsRows] = await db.execute(
      `SELECT COALESCE(SUM(si.quantity * si.cost_price), 0) as cogs
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE YEAR(s.created_at) = ? AND MONTH(s.created_at) = ?`,
      [year, month]
    )

    const [expenseRows] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM expenses WHERE YEAR(expense_date) = ? AND MONTH(expense_date) = ?`,
      [year, month]
    )

    return buildProfitSummary(rows[0], cogsRows[0].cogs, expenseRows[0].total_expenses)
  },

  async bestSellingProducts(limit = 10) {
    const safeLimit = parseInt(limit) || 10
    const [rows] = await db.query(
      `SELECT p.name, p.category,
       SUM(si.quantity) as total_sold,
       SUM(si.quantity * si.price) as revenue
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       GROUP BY p.id, p.name, p.category
       ORDER BY total_sold DESC
       LIMIT ${safeLimit}`
    )
    return rows
  },

  async salesByPaymentMethod() {
    const [rows] = await db.execute(
      `SELECT payment_method, COUNT(id) as total_sales, SUM(total) as revenue
       FROM sales GROUP BY payment_method`
    )
    return rows
  },

  async lastSevenDays() {
    const [rows] = await db.execute(
      `SELECT DATE(created_at) as date, COUNT(id) as total_sales, SUM(total) as revenue
       FROM sales
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    )
    return rows
  }
}

module.exports = Report
