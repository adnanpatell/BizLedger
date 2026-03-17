"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { MONTHS, CANADIAN_PROVINCES } from "@/lib/utils"
import { Plus, Trash2, Save, Download } from "lucide-react"
import { apiUrl } from "@/lib/api"

// Business Profile Tab
function BusinessProfile() {
  const [form, setForm] = useState({
    name: "",
    taxNumber: "",
    address: "",
    currency: "CAD",
    province: "AB",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(apiUrl("/api/business"))
      .then(r => r.json())
      .then(d => {
        if (d.business) setForm({ ...d.business })
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(apiUrl("/api/business"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success("Business profile updated")
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Profile</CardTitle>
        <CardDescription>Your business details used across the application</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div className="space-y-1">
          <Label>Business Name *</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Business Number (GST/HST Registration)</Label>
          <Input
            value={form.taxNumber || ""}
            onChange={e => setForm(f => ({ ...f, taxNumber: e.target.value }))}
            placeholder="123456789RT0001"
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label>Address</Label>
          <Textarea
            value={form.address || ""}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            placeholder="Business address"
            rows={2}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm(f => ({ ...f, currency: v || "CAD" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CAD">CAD ($)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
                <SelectItem value="GBP">GBP (£)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Province / Territory</Label>
            <Select value={form.province} onValueChange={(v) => setForm(f => ({ ...f, province: v ?? "AB" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANADIAN_PROVINCES.map(p => (
                  <SelectItem key={p.code} value={p.code}>{p.name} ({p.taxLabel})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </CardContent>
    </Card>
  )
}

// Categories Tab
function Categories() {
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState("BOTH")
  const [adding, setAdding] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(apiUrl("/api/categories"))
      .then(r => r.json())
      .then(d => setCategories(d.categories || []))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const add = async () => {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const res = await fetch(apiUrl("/api/categories"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType }),
      })
      if (!res.ok) throw new Error()
      toast.success("Category added")
      setNewName("")
      load()
    } catch {
      toast.error("Failed to add category")
    } finally {
      setAdding(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm("Delete this category?")) return
    try {
      await fetch(apiUrl(`/api/categories?id=${id}`), { method: "DELETE" })
      toast.success("Category deleted")
      load()
    } catch {
      toast.error("Failed to delete")
    }
  }

  const typeColor: Record<string, string> = {
    INCOME: "bg-emerald-100 text-emerald-700",
    EXPENSE: "bg-red-100 text-red-700",
    BOTH: "bg-blue-100 text-blue-700",
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction Categories</CardTitle>
        <CardDescription>Manage categories for organizing transactions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Category */}
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Category name"
            onKeyDown={e => e.key === "Enter" && add()}
            className="flex-1"
          />
          <Select value={newType} onValueChange={(v) => setNewType(v ?? "BOTH")}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="INCOME">Income</SelectItem>
              <SelectItem value="EXPENSE">Expense</SelectItem>
              <SelectItem value="BOTH">Both</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={add} disabled={adding || !newName.trim()} className="gap-1">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        {/* Category List */}
        {loading ? <Skeleton className="h-48 w-full" /> : (
          <div className="space-y-2">
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No categories yet</p>
            ) : categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">{cat.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor[cat.type]}`}>
                    {cat.type}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-red-500 hover:text-red-600"
                  onClick={() => remove(cat.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Export Tab
function Export() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [mode, setMode] = useState<"month" | "year">("month")

  const doExport = (format: "csv" | "json") => {
    const params = new URLSearchParams({ format })
    if (mode === "month") {
      params.set("month", String(month))
      params.set("year", String(year))
    } else {
      params.set("year", String(year))
    }
    window.open(apiUrl(`/api/export?${params}`), "_blank")
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export Data</CardTitle>
        <CardDescription>Download your transaction data in CSV or JSON format</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-1">
          <Label>Export Scope</Label>
          <Select value={mode} onValueChange={(v) => setMode((v ?? "month") as "month" | "year")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Specific Month</SelectItem>
              <SelectItem value="year">Full Calendar Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "month" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Month</Label>
              <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Year</Label>
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {mode === "year" && (
          <div className="space-y-1">
            <Label>Calendar Year</Label>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y} (Jan–Dec)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button onClick={() => doExport("csv")} className="gap-2 flex-1">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button onClick={() => doExport("json")} variant="outline" className="gap-2 flex-1">
            <Download className="h-4 w-4" /> Export JSON
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SettingsClient() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Configure your business profile and preferences</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Business Profile</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="export">Export & Backup</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <BusinessProfile />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <Categories />
        </TabsContent>
        <TabsContent value="export" className="mt-4">
          <Export />
        </TabsContent>
      </Tabs>
    </div>
  )
}
