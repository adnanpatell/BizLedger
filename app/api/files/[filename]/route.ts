import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename } = await params

    // Only serve files that are registered attachments (prevents arbitrary path access)
    const attachment = await prisma.attachment.findFirst({
      where: { fileName: filename },
    })

    if (!attachment)
      return NextResponse.json({ error: "File not found" }, { status: 404 })

    // Vercel Blob (production): filePath is a public https:// URL — redirect to it
    if (attachment.filePath.startsWith("https://")) {
      return NextResponse.redirect(attachment.filePath)
    }

    // Local disk (development): read and stream the file
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
