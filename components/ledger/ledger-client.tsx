"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { formatCurrency, formatDate, calcGst, MONTHS, CA_TAX_RATES } from "@/lib/utils"
import { cn } from "@/lib/utils"
import {
  Plus, Search, Download, Trash2, CheckSquare,
  ChevronUp, ChevronDown, Pencil, FileText, Filter, Paperclip
} from "lucide-react"
import { apiUrl } from "@/lib/api"

interface Transaction {
  id: string
  date: string
  invoiceNumber: string | null
  companyName: string
  type: "INCOME" | "EXPENSE"
  category: { id: string; name: string } | null
  categoryId: string | null
  description: string | null
  amountExclGst: number
  gstRate: number
  gstAmount: number
  totalAmount: number
  paymentStatus: "PAID" | "PENDING" | "OVERDUE"
  attachments: Array<{
    id: string
    fileName: string
    originalName: string
    fileType: string
    fileSize: number
  }>
}

const statusColor: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  OVERDUE: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
}

const defaultForm = {
  date: new Date().toISOString().split("T")[0],
  invoiceNumber: "",
  companyName: "",
  type: "INCOME" as "INCOME" | "EXPENSE",
  categoryId: "",
  description: "",
  amountExclGst: 0,
  gstRate: 5,
  paymentStatus: "PENDING" as "PAID" | "PENDING" | "OVERDUE",
}

export function LedgerClient() {
  const searchParams = useSearchParams()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "ALL")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<string>("date")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [showForm, setShowForm] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        month: String(month),
        year: String(year),
      })
      if (typeFilter !== "ALL") params.set("type", typeFilter)
      if (statusFilter !== "ALL") params.set("status", statusFilter)
      if (search) params.set("search", search)

      const res = await fetch(apiUrl(`/api/transactions?${params}`))
      const data = await res.json()
      setTransactions(data.transactions || [])
    } finally {
      setLoading(false)
    }
  }, [month, year, typeFilter, statusFilter, search])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])
  useEffect(() => {
    fetch(apiUrl("/api/categories")).then(r => r.json()).then(d => setCategories(d.categories || []))
  }, [])

  const sorted = [...transactions].sort((a, b) => {
    let av: any = a[sortField as keyof Transaction]
    let bv: any = b[sortField as keyof Transaction]
    if (sortField === "date") { av = new Date(a.date).getTime(); bv = new Date(b.date).getTime() }
    if (typeof av === "string") av = av.toLowerCase()
    if (typeof bv === "string") bv = bv.toLowerCase()
    if (av < bv) return sortDir === "asc" ? -1 : 1
    if (av > bv) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }

  const SortIcon = ({ field }: { field: string }) => (
    sortField === field
      ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
      : null
  )

  const totals = {
    income: transactions.filter(t => t.type === "INCOME").reduce((s, t) => s + t.totalAmount, 0),
    expense: transactions.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.totalAmount, 0),
    taxCollected: transactions.filter(t => t.type === "INCOME").reduce((s, t) => s + t.gstAmount, 0),
    taxPaid: transactions.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.gstAmount, 0),
  }

  const allSelected = sorted.length > 0 && sorted.every(t => selectedIds.has(t.id))

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(sorted.map(t => t.id)))
  }

  const openCreate = () => {
    setEditTx(null)
    setForm(defaultForm)
    setShowForm(true)
  }

  const openEdit = (tx: Transaction) => {
    setEditTx(tx)
    setForm({
      date: new Date(tx.date).toISOString().split("T")[0],
      invoiceNumber: tx.invoiceNumber || "",
      companyName: tx.companyName,
      type: tx.type,
      categoryId: tx.categoryId || "",
      description: tx.description || "",
      amountExclGst: tx.amountExclGst,
      gstRate: tx.gstRate,
      paymentStatus: tx.paymentStatus,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.companyName || !form.amountExclGst) {
      toast.error("Company name and amount are required")
      return
    }
    setSaving(true)
    try {
      const url = editTx ? apiUrl(`/api/transactions/${editTx.id}`) : apiUrl("/api/transactions")
      const method = editTx ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amountExclGst: Number(form.amountExclGst), gstRate: Number(form.gstRate) }),
      })
      if (!res.ok) throw new Error("Save failed")
      toast.success(editTx ? "Transaction updated" : "Transaction created")
      setShowForm(false)
      fetchTransactions()
    } catch {
      toast.error("Failed to save transaction")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this transaction?")) return
    try {
      await fetch(apiUrl(`/api/transactions/${id}`), { method: "DELETE" })
      toast.success("Transaction deleted")
      fetchTransactions()
    } catch {
      toast.error("Failed to delete")
    }
  }

  const handleBulkAction = async (action: string) => {
    if (selectedIds.size === 0) return
    if (action === "delete" && !confirm(`Delete ${selectedIds.size} transactions?`)) return
    try {
      await fetch(apiUrl("/api/transactions/bulk"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      })
      toast.success(`Bulk action complete`)
      setSelectedIds(new Set())
      fetchTransactions()
    } catch {
      toast.error("Bulk action failed")
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)
  const { gstAmount: previewGst, totalAmount: previewTotal } = calcGst(Number(form.amountExclGst) || 0, Number(form.gstRate) || 0)

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Monthly Ledger</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Add Transaction
        </Button>
      </div>

      {/* Month/Year + Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v ?? "1"))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map(m => (
              <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? String(new Date().getFullYear())))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "ALL")}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="EXPENSE">Expense</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "ALL")}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company or invoice..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            const params = new URLSearchParams({ month: String(month), year: String(year) })
            window.open(apiUrl(`/api/export?${params}`), "_blank")
          }}
          title="Export CSV"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("markPaid")}>Mark Paid</Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("markPending")}>Mark Pending</Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("markOverdue")}>Mark Overdue</Button>
          <Button size="sm" variant="destructive" onClick={() => handleBulkAction("delete")}>
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="p-3 text-left w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </th>
              <th className="p-3 text-left cursor-pointer hover:text-primary whitespace-nowrap" onClick={() => toggleSort("date")}>
                <span className="flex items-center gap-1">Date <SortIcon field="date" /></span>
              </th>
              <th className="p-3 text-left whitespace-nowrap">Invoice #</th>
              <th className="p-3 text-left cursor-pointer hover:text-primary" onClick={() => toggleSort("companyName")}>
                <span className="flex items-center gap-1">Company <SortIcon field="companyName" /></span>
              </th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-right cursor-pointer hover:text-primary whitespace-nowrap" onClick={() => toggleSort("amountExclGst")}>
                <span className="flex items-center justify-end gap-1">Excl. Tax <SortIcon field="amountExclGst" /></span>
              </th>
              <th className="p-3 text-right whitespace-nowrap">Tax %</th>
              <th className="p-3 text-right whitespace-nowrap">Tax Amt</th>
              <th className="p-3 text-right cursor-pointer hover:text-primary whitespace-nowrap" onClick={() => toggleSort("totalAmount")}>
                <span className="flex items-center justify-end gap-1">Total <SortIcon field="totalAmount" /></span>
              </th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Attach</th>
              <th className="p-3 text-left w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: 13 }).map((_, j) => (
                    <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-12 text-center text-muted-foreground">
                  <div className="space-y-2">
                    <FileText className="h-8 w-8 mx-auto opacity-30" />
                    <p>No transactions found for this period.</p>
                    <Button size="sm" onClick={openCreate}>Add your first transaction</Button>
                  </div>
                </td>
              </tr>
            ) : (
              sorted.map(tx => (
                <tr key={tx.id} className={cn(
                  "border-b border-border hover:bg-muted/30 transition-colors",
                  selectedIds.has(tx.id) && "bg-muted/50"
                )}>
                  <td className="p-3">
                    <Checkbox
                      checked={selectedIds.has(tx.id)}
                      onCheckedChange={checked => {
                        const next = new Set(selectedIds)
                        if (checked) next.add(tx.id)
                        else next.delete(tx.id)
                        setSelectedIds(next)
                      }}
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground text-xs">{formatDate(tx.date)}</td>
                  <td className="p-3 text-xs font-mono">{tx.invoiceNumber || "—"}</td>
                  <td className="p-3 font-medium max-w-40 truncate">{tx.companyName}</td>
                  <td className="p-3">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium",
                      tx.type === "INCOME" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    )}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{tx.category?.name || "—"}</td>
                  <td className="p-3 text-right font-mono text-xs">{formatCurrency(tx.amountExclGst)}</td>
                  <td className="p-3 text-right text-xs">{tx.gstRate}%</td>
                  <td className="p-3 text-right font-mono text-xs text-muted-foreground">{formatCurrency(tx.gstAmount)}</td>
                  <td className="p-3 text-right font-mono text-sm font-semibold">{formatCurrency(tx.totalAmount)}</td>
                  <td className="p-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColor[tx.paymentStatus])}>
                      {tx.paymentStatus}
                    </span>
                  </td>
                  <td className="p-3">
                    {tx.attachments.length > 0 ? (
                      <div className="flex items-center gap-1">
                        <a
                          href={`/api/files/${tx.attachments[0].fileName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`View: ${tx.attachments[0].originalName}`}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                        <a
                          href={`/api/files/${tx.attachments[0].fileName}`}
                          download={tx.attachments[0].originalName}
                          title={`Download: ${tx.attachments[0].originalName}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/40"><Paperclip className="h-3.5 w-3.5" /></span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(tx)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDelete(tx.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && sorted.length > 0 && (
            <tfoot>
              <tr className="bg-muted/50 font-semibold text-sm">
                <td colSpan={6} className="p-3">
                  <span className="text-muted-foreground">{sorted.length} records</span>
                </td>
                <td colSpan={2} className="p-3 text-right text-xs text-muted-foreground">Totals</td>
                <td className="p-3 text-right font-mono text-xs">
                  <div className="text-emerald-600">{formatCurrency(totals.taxCollected)}</div>
                  <div className="text-red-500 text-xs">-{formatCurrency(totals.taxPaid)}</div>
                </td>
                <td colSpan={4} className="p-3 text-right">
                  <div className="text-emerald-600">Inc: {formatCurrency(totals.income)}</div>
                  <div className="text-red-500">Exp: {formatCurrency(totals.expense)}</div>
                  <div className={cn("font-bold", totals.income - totals.expense >= 0 ? "text-emerald-600" : "text-red-600")}>
                    Net: {formatCurrency(totals.income - totals.expense)}
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTx ? "Edit Transaction" : "New Transaction"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: (v || 'INCOME') as 'INCOME' | 'EXPENSE' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOME">Income</SelectItem>
                    <SelectItem value="EXPENSE">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Company Name *</Label>
              <Input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="Company or person name" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Invoice Number</Label>
                <Input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="INV-2026-001" />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm(f => ({ ...f, categoryId: v || '' }))}>
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
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" rows={2} />
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
                <Label>Tax Rate (%)</Label>
                <Select value={String(form.gstRate)} onValueChange={(v) => setForm(f => ({ ...f, gstRate: Number(v || '5') }))}>
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
                <span className="text-muted-foreground">Tax Amount ({form.gstRate}%)</span>
                <span className="font-mono">{formatCurrency(previewGst)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total (Incl. Tax)</span>
                <span className="font-mono">{formatCurrency(previewTotal)}</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Payment Status</Label>
              <Select value={form.paymentStatus} onValueChange={(v) => setForm(f => ({ ...f, paymentStatus: (v || 'PENDING') as 'PAID' | 'PENDING' | 'OVERDUE' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="OVERDUE">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editTx ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
