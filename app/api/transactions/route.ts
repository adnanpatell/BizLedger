import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { calcGst } from "@/lib/utils"
import { requireAuthNext } from "@/lib/auth-api"

const TransactionSchema = z.object({
  date: z.string(),
  invoiceNumber: z.string().optional().nullable(),
  companyName: z.string().min(1),
  type: z.enum(["INCOME", "EXPENSE"]),
  categoryId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  amountExclGst: z.number().positive(),
  gstRate: z.number().min(0).max(28),
  paymentStatus: z.enum(["PAID", "PENDING", "OVERDUE"]).default("PENDING"),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number().default(1),
    unitPrice: z.number(),
    gstRate: z.number().default(0),
    amount: z.number(),
  })).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null
    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null
    const type = searchParams.get("type")
    const status = searchParams.get("status")
    const search = searchParams.get("search")
    const businessId = auth.businessId

    const where: any = { businessId }

    if (month && year) {
      where.date = { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0, 23, 59, 59) }
    } else if (year) {
      where.date = { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) }
    }

    if (type && type !== "ALL") where.type = type
    if (status && status !== "ALL") where.paymentStatus = status
    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: "insensitive" } },
        { invoiceNumber: { contains: search, mode: "insensitive" } },
      ]
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: { category: true, attachments: true, lineItems: true },
      orderBy: { date: "desc" },
    })

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error("GET /api/transactions error:", error)
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const data = TransactionSchema.parse(body)
    const { gstAmount, totalAmount } = calcGst(data.amountExclGst, data.gstRate)
    const { lineItems, ...rest } = data

    const transaction = await prisma.transaction.create({
      data: {
        ...rest,
        businessId: auth.businessId,
        date: new Date(data.date),
        gstAmount,
        totalAmount,
        ...(lineItems && lineItems.length > 0 && { lineItems: { create: lineItems } }),
      },
      include: { category: true, attachments: true, lineItems: true },
    })

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (error) {
    console.error("POST /api/transactions error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 })
  }
}
