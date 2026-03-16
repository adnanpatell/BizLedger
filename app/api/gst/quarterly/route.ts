import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getQuarterMonths } from "@/lib/utils"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()))
    const businessId = "default-business"

    // Canadian GST/HST filing deadlines
    const deadlines: Record<number, string> = {
      1: "April 30",
      2: "July 31",
      3: "October 31",
      4: "January 31 (next year)",
    }

    const quarters = []

    for (let q = 1; q <= 4; q++) {
      const months = getQuarterMonths(q)
      const start = new Date(year, months[0] - 1, 1)
      const end   = new Date(year, months[months.length - 1], 0, 23, 59, 59)

      const txs = await prisma.transaction.findMany({
        where: { businessId, date: { gte: start, lte: end } },
      })

      const totalSales     = txs.filter(t => t.type === "INCOME").reduce((s, t) => s + t.amountExclGst, 0)
      const totalPurchases = txs.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.amountExclGst, 0)
      const outputTax      = txs.filter(t => t.type === "INCOME").reduce((s, t) => s + t.gstAmount, 0)
      const itc            = txs.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.gstAmount, 0)
      const netLiability   = outputTax - itc
      const round = (n: number) => Math.round(n * 100) / 100

      quarters.push({
        quarter: q,
        label: `Q${q} (${months.map(m => new Date(2000, m - 1, 1).toLocaleString("en-CA", { month: "short" })).join(" – ")})`,
        year,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        totalSales:      round(totalSales),
        totalPurchases:  round(totalPurchases),
        outputTax:       round(outputTax),
        itc:             round(itc),
        netLiability:    round(netLiability),
        filingDeadline:  deadlines[q],
        transactionCount: txs.length,
      })
    }

    return NextResponse.json({ year, quarters })
  } catch (error) {
    console.error("GET /api/gst/quarterly error:", error)
    return NextResponse.json({ error: "Failed to fetch quarterly tax data" }, { status: 500 })
  }
}
