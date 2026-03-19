import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthNext } from "@/lib/auth-api"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const auth = await requireAuthNext(request)
  if (auth instanceof NextResponse) return auth

  try {
    const { filename } = await params

    const attachment = await prisma.attachment.findFirst({
      where: { fileName: filename, transaction: { businessId: auth.businessId } },
    })

    if (!attachment)
      return NextResponse.json({ error: "File not found" }, { status: 404 })

    if (attachment.filePath.startsWith("https://")) {
      return NextResponse.redirect(attachment.filePath)
    }

    const { readFile } = await import("fs/promises")
    const { join } = await import("path")
    const absolutePath = join(process.cwd(), attachment.filePath)
    const fileBuffer = await readFile(absolutePath)

    const viewable = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(attachment.fileType)
    const disposition = viewable
      ? `inline; filename="${attachment.originalName}"`
      : `attachment; filename="${attachment.originalName}"`

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": attachment.fileType,
        "Content-Disposition": disposition,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (error: any) {
    if (error?.code === "ENOENT")
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 })
    console.error("GET /api/files/[filename] error:", error)
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 })
  }
}
