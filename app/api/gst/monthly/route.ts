import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1))
    const year  = parseInt(searchParams.get("year")  || String(now.getFullYear()))
    const businessId = "default-business"

    const start = new Date(year, month - 1, 1)
    const end   = new Date(year, month, 0, 23, 59, 59)

    const transactions = await prisma.transaction.findMany({
      where: { businessId, date: { gte: start, lte: end } },
    })

    // Aggregate dynamically by whatever tax rates exist in the data
    const slabs: Record<number, { taxableIncome: number; taxCollected: number; taxableExpense: number; taxPaid: number }> = {}

    for (const tx of transactions) {
      const rate = tx.gstRate
      if (!slabs[rate]) {
        slabs[rate] = { taxableIncome: 0, taxCollected: 0, taxableExpense: 0, taxPaid: 0 }
      }
      if (tx.type === "INCOME") {
        slabs[rate].taxableIncome += tx.amountExclGst
        slabs[rate].taxCollected  += tx.gstAmount
      } else {
        slabs[rate].taxableExpense += tx.amountExclGst
        slabs[rate].taxPaid        += tx.gstAmount
      }
    }

    const totalTaxCollected = transactions.filter(t => t.type === "INCOME").reduce((s, t) => s + t.gstAmount, 0)
    const totalTaxPaid      = transactions.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.gstAmount, 0)
    const round = (n: number) => Math.round(n * 100) / 100

    return NextResponse.json({
      month,
      year,
      totalTaxCollected: round(totalTaxCollected),
      totalTaxPaid:      round(totalTaxPaid),
      netTaxPayable:     round(totalTaxCollected - totalTaxPaid),
      slabs: Object.entries(slabs).map(([rate, data]) => ({
        rate:           Number(rate),
        taxableIncome:  round(data.taxableIncome),
        taxCollected:   round(data.taxCollected),
        taxableExpense: round(data.taxableExpense),
        taxPaid:        round(data.taxPaid),
        netPayable:     round(data.taxCollected - data.taxPaid),
      })).sort((a, b) => a.rate - b.rate),
    })
  } catch (error) {
    console.error("GET /api/gst/monthly error:", error)
    return NextResponse.json({ error: "Failed to fetch tax data" }, { status: 500 })
  }
}
