import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function escapeCSV(val: any): string {
  if (val === null || val === undefined) return ""
  const str = String(val)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const format = searchParams.get("format") || "csv"
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null
    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null
    const businessId = "default-business"

    const where: any = { businessId }
    if (month && year) {
      where.date = {
        gte: new Date(year, month - 1, 1),
        lte: new Date(year, month, 0, 23, 59, 59),
      }
    } else if (year) {
      where.date = {
        gte: new Date(year, 3, 1),
        lte: new Date(year + 1, 2, 31, 23, 59, 59),
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: { category: true },
      orderBy: { date: "asc" },
    })

    if (format === "json") {
      return new NextResponse(JSON.stringify({ transactions }, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="bizledger-export.json"`,
        },
      })
    }

    // CSV
    const headers = [
      "Date", "Invoice Number", "Company Name", "Type", "Category",
      "Description", "Amount (Excl GST)", "GST Rate (%)", "GST Amount",
      "Total Amount", "Payment Status",
    ]

    const rows = transactions.map(t => [
      new Date(t.date).toLocaleDateString("en-IN"),
      t.invoiceNumber || "",
      t.companyName,
      t.type,
      t.category?.name || "",
      t.description || "",
      t.amountExclGst.toFixed(2),
      t.gstRate.toFixed(0),
      t.gstAmount.toFixed(2),
      t.totalAmount.toFixed(2),
      t.paymentStatus,
    ])

    const csv = [
      headers.map(escapeCSV).join(","),
      ...rows.map(row => row.map(escapeCSV).join(",")),
    ].join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bizledger-export.csv"`,
      },
    })
  } catch (error) {
    console.error("GET /api/export error:", error)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
