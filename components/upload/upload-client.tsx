"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatCurrency, calcGst, CA_TAX_RATES } from "@/lib/utils"
import { cn } from "@/lib/utils"
import {
  Upload, FileText, Image as ImageIcon, CheckCircle,
  AlertCircle, X, RefreshCw, Save
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { apiFetch } from "@/lib/api"

interface ExtractedData {
  company_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  line_items: Array<{
    description: string
    quantity: number
    unit_price: number
    gst_rate: number
    amount: number
  }> | null
  subtotal: number | null
  total_gst: number | null
  total_amount: number | null
  currency: string | null
  notes: string | null
}

interface UploadResult {
  file: {
    fileName: string
    originalName: string
    filePath: string
    fileType: string
    fileSize: number
    extractedText: string
  }
  extractedData: ExtractedData | null
  extractionError: string | null
}

const defaultForm = {
  date: new Date().toISOString().split("T")[0],
  invoiceNumber: "",
  companyName: "",
  type: "EXPENSE" as "INCOME" | "EXPENSE",
  categoryId: "",
  description: "",
  amountExclGst: 0,
  gstRate: 5,
  paymentStatus: "PENDING" as "PAID" | "PENDING" | "OVERDUE",
}

export function UploadClient() {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [categories, setCategories] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload")

  useEffect(() => {
    apiFetch("/api/categories").then(r => r.json()).then(d => setCategories(d.categories || []))
  }, [])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setUploading(true)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await apiFetch("/api/upload", { method: "POST", body: formData })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Upload failed")
        return
      }

      setUploadResult(data)

      // Pre-fill form from extracted data
      if (data.extractedData) {
        const ex = data.extractedData as ExtractedData & {
          tax_rate?: number | null
          suggested_type?: "INCOME" | "EXPENSE"
          gst_included?: boolean
        }
        setForm(prev => ({
          ...prev,
          type: ex.suggested_type || "EXPENSE",
          companyName: ex.company_name || "",
          invoiceNumber: ex.invoice_number || "",
          date: ex.invoice_date || prev.date,
          amountExclGst: ex.subtotal || 0,
          gstRate: ex.tax_rate ?? 5,
          description: ex.notes || (ex.gst_included ? "GST included in total" : ""),
        }))
        const typeLabel = (ex.suggested_type || "EXPENSE") === "INCOME" ? "Income" : "Expense"
        toast.success(`Invoice data extracted — suggested as ${typeLabel}`)
      } else if (data.extractionError) {
        toast.warning(data.extractionError)
      }

      setStep("preview")
    } catch (err) {
      toast.error("Upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  })

  const handleSave = async () => {
    if (!form.companyName) {
      toast.error("Company name is required")
      return
    }
    setSaving(true)
    try {
      // Create transaction
      const txRes = await apiFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          amountExclGst: Number(form.amountExclGst),
          gstRate: Number(form.gstRate),
        }),
      })

      if (!txRes.ok) throw new Error("Failed to save transaction")
      const { transaction } = await txRes.json()

      // If we have a file, attach it
      if (uploadResult?.file) {
        await apiFetch(`/api/transactions/${transaction.id}/attachments`, {
          method: "POST",
          body: JSON.stringify(uploadResult.file),
        })
      }

      toast.success("Transaction saved to ledger!")
      setStep("done")
    } catch {
      toast.error("Failed to save transaction")
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setStep("upload")
    setUploadResult(null)
    setForm(defaultForm)
  }

  const { gstAmount, totalAmount } = calcGst(Number(form.amountExclGst) || 0, Number(form.gstRate) || 0)

  if (step === "done") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-96 space-y-4">
        <CheckCircle className="h-16 w-16 text-emerald-500" />
        <h2 className="text-2xl font-bold">Transaction Saved!</h2>
        <p className="text-muted-foreground">The invoice has been added to your ledger.</p>
        <div className="flex gap-3">
          <Button onClick={reset} variant="outline">Upload Another</Button>
          <Button onClick={() => router.push("/ledger")}>View Ledger</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Invoice</h1>
        <p className="text-muted-foreground text-sm">Upload a PDF or image — we'll extract the data automatically using text recognition</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Dropzone & File Info */}
        <div className="space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30",
              uploading && "pointer-events-none opacity-50"
            )}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <div className="space-y-3">
                <RefreshCw className="h-10 w-10 mx-auto text-primary animate-spin" />
                <p className="font-medium">Processing invoice...</p>
                <p className="text-sm text-muted-foreground">Extracting text and parsing invoice data</p>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {isDragActive ? "Drop the file here" : "Drag & drop invoice here"}
                  </p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                </div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {["PDF", "JPG", "PNG", "WEBP"].map(ext => (
                    <Badge key={ext} variant="secondary" className="text-xs">{ext}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Max 10 MB</p>
              </div>
            )}
          </div>

          {/* Uploaded File Info */}
          {uploadResult && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {uploadResult.file.fileType.includes("pdf") ? (
                    <FileText className="h-4 w-4 text-red-500" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-blue-500" />
                  )}
                  Uploaded File
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Name:</span> {uploadResult.file.originalName}</p>
                <p><span className="text-muted-foreground">Size:</span> {(uploadResult.file.fileSize / 1024).toFixed(1)} KB</p>
                {uploadResult.extractionError ? (
                  <div className="flex items-center gap-2 text-orange-600 mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-xs">{uploadResult.extractionError}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-600 mt-2">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-xs">Data extracted successfully</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Extracted raw data preview */}
          {uploadResult?.extractedData && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Extracted Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                {(uploadResult.extractedData.line_items || []).length > 0 ? (
                  <div className="space-y-2 text-xs">
                    {uploadResult.extractedData.line_items!.map((item, i) => (
                      <div key={i} className="flex justify-between border-b border-border pb-1">
                        <span className="truncate max-w-48">{item.description}</span>
                        <span className="font-mono ml-2 shrink-0">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold pt-1">
                      <span>Total (from invoice)</span>
                      <span className="font-mono">{formatCurrency(uploadResult.extractedData.total_amount || 0)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No line items extracted</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Editable Preview Form */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {step === "preview" ? "Review & Confirm" : "Transaction Details"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Transaction Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: (v ?? "EXPENSE") as "INCOME" | "EXPENSE" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INCOME">Income (you received payment)</SelectItem>
                      <SelectItem value="EXPENSE">Expense (you paid someone)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Company Name *</Label>
                <Input
                  value={form.companyName}
                  onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                  placeholder="Company or person name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Invoice Number</Label>
                  <Input
                    value={form.invoiceNumber}
                    onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                    placeholder="INV-001"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={form.categoryId} onValueChange={(v) => setForm(f => ({ ...f, categoryId: v ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Amount (Excl. Tax) *</Label>
                  <Input
                    type="number"
                    value={form.amountExclGst || ""}
                    onChange={e => setForm(f => ({ ...f, amountExclGst: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tax Rate</Label>
                  <Select value={String(form.gstRate)} onValueChange={(v) => setForm(f => ({ ...f, gstRate: Number(v ?? "5") }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CA_TAX_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tax Preview */}
              <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax ({form.gstRate}%)</span>
                  <span className="font-mono">{formatCurrency(gstAmount)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-border pt-1">
                  <span>Total (Incl. Tax)</span>
                  <span className="font-mono text-lg">{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Payment Status</Label>
                <Select value={form.paymentStatus} onValueChange={(v) => setForm(f => ({ ...f, paymentStatus: (v ?? "PENDING") as "PAID" | "PENDING" | "OVERDUE" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="OVERDUE">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 pt-2">
                {uploadResult && (
                  <Button variant="outline" onClick={reset} className="gap-2">
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                )}
                <Button
                  onClick={handleSave}
                  disabled={saving || !form.companyName}
                  className="flex-1 gap-2"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save to Ledger"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
