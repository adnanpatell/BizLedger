"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts"
import { formatCurrency, MONTHS, getMonthName } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { AlertCircle, TrendingUp } from "lucide-react"

const now = new Date()

// Monthly Tax Tab
function MonthlyTax() {
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [data,  setData]  = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/gst/monthly?month=${month}&year=${year}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [month, year])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v ?? "1"))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? String(now.getFullYear())))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {loading ? Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-14 w-full" /></CardContent></Card>
        )) : (
          <>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Tax Collected</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(data?.totalTaxCollected || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">On income invoices</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Tax Paid (ITC)</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(data?.totalTaxPaid || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Input tax credits</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Net Tax Payable</p>
                <p className={cn("text-2xl font-bold", (data?.netTaxPayable || 0) >= 0 ? "text-orange-600" : "text-emerald-600")}>
                  {formatCurrency(Math.abs(data?.netTaxPayable || 0))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(data?.netTaxPayable || 0) < 0 ? "ITC carry-forward" : "To remit to CRA"}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Rate Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax Rate Breakdown — {getMonthName(month)} {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 text-left">Tax Rate</th>
                    <th className="p-3 text-right">Taxable Revenue</th>
                    <th className="p-3 text-right">Tax Collected</th>
                    <th className="p-3 text-right">Taxable Expenses</th>
                    <th className="p-3 text-right">Tax Paid (ITC)</th>
                    <th className="p-3 text-right">Net Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.slabs || []).filter((s: any) => s.taxableIncome > 0 || s.taxableExpense > 0).map((slab: any) => (
                    <tr key={slab.rate} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{slab.rate}%</td>
                      <td className="p-3 text-right font-mono">{formatCurrency(slab.taxableIncome)}</td>
                      <td className="p-3 text-right font-mono text-emerald-600">{formatCurrency(slab.taxCollected)}</td>
                      <td className="p-3 text-right font-mono">{formatCurrency(slab.taxableExpense)}</td>
                      <td className="p-3 text-right font-mono text-red-600">{formatCurrency(slab.taxPaid)}</td>
                      <td className={cn("p-3 text-right font-mono font-semibold", slab.netPayable >= 0 ? "text-orange-600" : "text-emerald-600")}>
                        {formatCurrency(Math.abs(slab.netPayable))}
                        {slab.netPayable < 0 && " (ITC)"}
                      </td>
                    </tr>
                  ))}
                  {(data?.slabs || []).filter((s: any) => s.taxableIncome > 0 || s.taxableExpense > 0).length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No transactions this month</td></tr>
                  )}
                </tbody>
                {(data?.slabs || []).filter((s: any) => s.taxableIncome > 0 || s.taxableExpense > 0).length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/50 font-semibold">
                      <td className="p-3">Total</td>
                      <td className="p-3 text-right font-mono">
                        {formatCurrency((data?.slabs || []).reduce((s: number, r: any) => s + r.taxableIncome, 0))}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-600">{formatCurrency(data?.totalTaxCollected || 0)}</td>
                      <td className="p-3 text-right font-mono">
                        {formatCurrency((data?.slabs || []).reduce((s: number, r: any) => s + r.taxableExpense, 0))}
                      </td>
                      <td className="p-3 text-right font-mono text-red-600">{formatCurrency(data?.totalTaxPaid || 0)}</td>
                      <td className={cn("p-3 text-right font-mono font-bold", (data?.netTaxPayable || 0) >= 0 ? "text-orange-600" : "text-emerald-600")}>
                        {formatCurrency(Math.abs(data?.netTaxPayable || 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Quarterly Tax Tab
function QuarterlyTax() {
  const [year,  setYear]  = useState(now.getFullYear())
  const [data,  setData]  = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/gst/quarterly?year=${year}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [year])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Year</span>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? String(now.getFullYear())))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
        )) : (data?.quarters || []).map((q: any) => (
          <Card key={q.quarter}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{q.label}</CardTitle>
                <Badge variant="outline" className="text-xs">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Due: {q.filingDeadline}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Revenue (pre-tax)</span>
                  <span className="font-mono">{formatCurrency(q.totalSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Expenses (pre-tax)</span>
                  <span className="font-mono">{formatCurrency(q.totalPurchases)}</span>
                </div>
                <div className="border-t border-border my-2" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax Collected (GST/HST)</span>
                  <span className="font-mono text-emerald-600">{formatCurrency(q.outputTax)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input Tax Credits (ITC)</span>
                  <span className="font-mono text-red-600">-{formatCurrency(q.itc)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-border pt-2">
                  <span>Net Tax Remittance</span>
                  <span className={cn("font-mono font-bold", q.netLiability > 0 ? "text-orange-600" : "text-emerald-600")}>
                    {q.netLiability > 0
                      ? `${formatCurrency(q.netLiability)} to CRA`
                      : `${formatCurrency(Math.abs(q.netLiability))} refund`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{q.transactionCount} transactions</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// Annual Tax Tab
function AnnualTax() {
  const [year,  setYear]  = useState(now.getFullYear())
  const [data,  setData]  = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/gst/annual?year=${year}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [year])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Year</span>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? String(now.getFullYear())))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Annual Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-14 w-full" /></CardContent></Card>
        )) : (
          <>
            <Card>
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground">Annual Revenue</p>
                <p className="text-xl font-bold">{formatCurrency(data?.totalTurnover || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground">Tax Collected</p>
                <p className="text-xl font-bold text-emerald-600">{formatCurrency(data?.totalTaxCollected || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground">Tax Paid (ITC)</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(data?.totalTaxPaid || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground">Net Remitted to CRA</p>
                <p className={cn("text-xl font-bold", (data?.netTaxPaid || 0) >= 0 ? "text-orange-600" : "text-emerald-600")}>
                  {formatCurrency(Math.abs(data?.netTaxPaid || 0))}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Monthly Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Monthly Revenue & Expenses — {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data?.monthlyData || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
                <Bar dataKey="income"  fill="#10b981" name="Revenue" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tax Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax Collected vs Paid — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data?.monthlyData || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="taxCollected" stroke="#10b981" strokeWidth={2} name="Tax Collected" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="taxPaid"      stroke="#ef4444" strokeWidth={2} name="Tax Paid (ITC)" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function GSTClient() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tax Summary</h1>
        <p className="text-muted-foreground text-sm">GST / HST tracking and CRA remittance summaries</p>
      </div>

      <Tabs defaultValue="monthly">
        <TabsList>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
          <TabsTrigger value="annual">Annual Overview</TabsTrigger>
        </TabsList>
        <TabsContent value="monthly"   className="mt-4"><MonthlyTax /></TabsContent>
        <TabsContent value="quarterly" className="mt-4"><QuarterlyTax /></TabsContent>
        <TabsContent value="annual"    className="mt-4"><AnnualTax /></TabsContent>
      </Tabs>
    </div>
  )
}
