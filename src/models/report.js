const db = require('../config/database')

const Report = {
  // Summary ya leo
  async todaySummary() {
    const [rows] = await db.execute(
      `SELECT 
       COUNT(id) as total_sales,
       SUM(total) as revenue,
       SUM(discount) as total_discounts,
       AVG(total) as average_sale
       FROM sales
       WHERE DATE(created_at) = CURDATE()`
    )
    return rows[0]
  },

  // Summary ya mwezi
  async monthlySummary(year, month) {
    const [rows] = await db.execute(
      `SELECT 
       COUNT(id) as total_sales,
       SUM(total) as revenue,
       SUM(discount) as total_discounts,
       AVG(total) as average_sale
       FROM sales
       WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?`,
      [year, month]
    )
    return rows[0]
  },

  // Best selling products
  async bestSellingProducts(limit = 10) {
    const [rows] = await db.execute(
      `SELECT p.name, p.category,
       SUM(si.quantity) as total_sold,
       SUM(si.quantity * si.price) as revenue
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       GROUP BY p.id
       ORDER BY total_sold DESC
       LIMIT ?`,
      [limit]
    )
    return rows
  },

  // Sales kwa payment method
  async salesByPaymentMethod() {
    const [rows] = await db.execute(
      `SELECT payment_method,
       COUNT(id) as total_sales,
       SUM(total) as revenue
       FROM sales
       GROUP BY payment_method`
    )
    return rows
  },

  // Sales kwa siku 7 zilizopita
  async lastSevenDays() {
    const [rows] = await db.execute(
      `SELECT DATE(created_at) as date,
       COUNT(id) as total_sales,
       SUM(total) as revenue
       FROM sales
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    )
    return rows
  }
}

module.exports = Report