import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()))
    const businessId = "default-business"

    const yearStart = new Date(year, 0, 1)
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59)

    const transactions = await prisma.transaction.findMany({
      where: { businessId, date: { gte: yearStart, lte: yearEnd } },
    })

    const totalTurnover    = transactions.filter(t => t.type === "INCOME").reduce((s, t) => s + t.amountExclGst, 0)
    const totalTaxCollected = transactions.filter(t => t.type === "INCOME").reduce((s, t) => s + t.gstAmount, 0)
    const totalTaxPaid      = transactions.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.gstAmount, 0)
    const netTaxPaid        = totalTaxCollected - totalTaxPaid

    // Month-by-month trend Jan → Dec
    const monthlyData = []
    for (let m = 1; m <= 12; m++) {
      const start = new Date(year, m - 1, 1)
      const end   = new Date(year, m, 0, 23, 59, 59)
      const txs   = transactions.filter(t => t.date >= start && t.date <= end)
      const inc   = txs.filter(t => t.type === "INCOME").reduce((s, t) => s + t.totalAmount, 0)
      const exp   = txs.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.totalAmount, 0)
      const taxCol = txs.filter(t => t.type === "INCOME").reduce((s, t) => s + t.gstAmount, 0)
      const taxPd  = txs.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.gstAmount, 0)
      monthlyData.push({
        month:        new Date(year, m - 1, 1).toLocaleString("en-CA", { month: "short" }),
        income:       Math.round(inc * 100) / 100,
        expense:      Math.round(exp * 100) / 100,
        taxCollected: Math.round(taxCol * 100) / 100,
        taxPaid:      Math.round(taxPd * 100) / 100,
      })
    }

    const round = (n: number) => Math.round(n * 100) / 100

    return NextResponse.json({
      year,
      totalTurnover:     round(totalTurnover),
      totalTaxCollected: round(totalTaxCollected),
      totalTaxPaid:      round(totalTaxPaid),
      netTaxPaid:        round(netTaxPaid),
      monthlyData,
    })
  } catch (error) {
    console.error("GET /api/gst/annual error:", error)
    return NextResponse.json({ error: "Failed to fetch annual tax data" }, { status: 500 })
  }
}
