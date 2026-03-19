import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { calcGst } from "@/lib/utils"
import { requireAuthNext } from "@/lib/auth-api"

const UpdateSchema = z.object({
  date: z.string().optional(),
  invoiceNumber: z.string().optional().nullable(),
  companyName: z.string().min(1).optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  categoryId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  amountExclGst: z.number().positive().optional(),
  gstRate: z.number().min(0).max(28).optional(),
  paymentStatus: z.enum(["PAID", "PENDING", "OVERDUE"]).optional(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const transaction = await prisma.transaction.findUnique({
      where: { id, businessId: auth.businessId },
      include: { category: true, attachments: true, lineItems: true },
    })
    if (!transaction) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ transaction })
  } catch (error) {
    console.error("GET /api/transactions/[id] error:", error)
    return NextResponse.json({ error: "Failed to fetch transaction" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const body = await request.json()
    const data = UpdateSchema.parse(body)

    const existing = await prisma.transaction.findUnique({ where: { id, businessId: auth.businessId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const amountExclGst = data.amountExclGst ?? existing.amountExclGst
    const gstRate = data.gstRate ?? existing.gstRate
    const { gstAmount, totalAmount } = calcGst(amountExclGst, gstRate)

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...data,
        ...(data.date && { date: new Date(data.date) }),
        gstAmount,
        totalAmount,
      },
      include: { category: true, attachments: true, lineItems: true },
    })

    return NextResponse.json({ transaction })
  } catch (error) {
    console.error("PUT /api/transactions/[id] error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const existing = await prisma.transaction.findUnique({ where: { id, businessId: auth.businessId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await prisma.transaction.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/transactions/[id] error:", error)
    return NextResponse.json({ error: "Failed to delete transaction" }, { status: 500 })
  }
}
