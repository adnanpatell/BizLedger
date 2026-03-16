import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCalendarQuarter, getQuarterMonths } from "@/lib/utils"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1))
    const year  = parseInt(searchParams.get("year")  || String(now.getFullYear()))
    const businessId = "default-business"

    // Current month range
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd   = new Date(year, month, 0, 23, 59, 59)

    // Current calendar quarter
    const quarter       = getCalendarQuarter(month)
    const quarterMonths = getQuarterMonths(quarter)
    const quarterStart  = new Date(year, quarterMonths[0] - 1, 1)
    const quarterEnd    = new Date(year, quarterMonths[quarterMonths.length - 1], 0, 23, 59, 59)

    // Monthly transactions
    const monthlyTx = await prisma.transaction.findMany({
      where: { businessId, date: { gte: monthStart, lte: monthEnd } },
    })

    // Quarterly tax
    const quarterlyTx = await prisma.transaction.findMany({
      where: { businessId, date: { gte: quarterStart, lte: quarterEnd } },
    })

    const totalIncome  = monthlyTx.filter(t => t.type === "INCOME").reduce((s, t) => s + t.totalAmount, 0)
    const totalExpense = monthlyTx.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.totalAmount, 0)
    const netProfit    = totalIncome - totalExpense

    const qTaxCollected = quarterlyTx.filter(t => t.type === "INCOME").reduce((s, t) => s + t.gstAmount, 0)
    const qTaxPaid      = quarterlyTx.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.gstAmount, 0)
    const taxPayable    = Math.max(0, qTaxCollected - qTaxPaid)

    // Monthly trend (last 12 months)
    const trend = []
    for (let i = 11; i >= 0; i--) {
      const d   = new Date(year, month - 1 - i, 1)
      const m   = d.getMonth() + 1
      const y   = d.getFullYear()
      const txs = await prisma.transaction.findMany({
        where: { businessId, date: { gte: new Date(y, m - 1, 1), lte: new Date(y, m, 0, 23, 59, 59) } },
        select: { type: true, totalAmount: true },
      })
      const inc = txs.filter(t => t.type === "INCOME").reduce((s, t) => s + t.totalAmount, 0)
      const exp = txs.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.totalAmount, 0)
      trend.push({
        month:   d.toLocaleString("en-CA", { month: "short" }),
        year:    y,
        income:  Math.round(inc * 100) / 100,
        expense: Math.round(exp * 100) / 100,
        net:     Math.round((inc - exp) * 100) / 100,
      })
    }

    // Expense category breakdown for current month
    const monthlyWithCat = await prisma.transaction.findMany({
      where: { businessId, date: { gte: monthStart, lte: monthEnd }, type: "EXPENSE" },
      include: { category: true },
    })
    const catBreakdown: Record<string, number> = {}
    for (const tx of monthlyWithCat) {
      const key = tx.category?.name || "Uncategorized"
      catBreakdown[key] = (catBreakdown[key] || 0) + tx.amountExclGst
    }

    // Recent transactions
    const recentTx = await prisma.transaction.findMany({
      where: { businessId },
      include: { category: true },
      orderBy: { date: "desc" },
      take: 10,
    })

    // Pending / overdue
    const pendingTx = await prisma.transaction.findMany({
      where: { businessId, paymentStatus: { in: ["PENDING", "OVERDUE"] } },
      include: { category: true },
      orderBy: { date: "asc" },
      take: 10,
    })

    return NextResponse.json({
      summary: {
        totalIncome:  Math.round(totalIncome  * 100) / 100,
        totalExpense: Math.round(totalExpense * 100) / 100,
        netProfit:    Math.round(netProfit    * 100) / 100,
        taxPayable:   Math.round(taxPayable   * 100) / 100,
      },
      trend,
      categoryBreakdown: Object.entries(catBreakdown).map(([name, value]) => ({
        name, value: Math.round(value * 100) / 100,
      })),
      recentTransactions: recentTx,
      pendingPayments:    pendingTx,
    })
  } catch (error) {
    console.error("GET /api/dashboard error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
