"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts"
import {
  TrendingUp, TrendingDown, IndianRupee, ArrowUpRight,
  ArrowDownRight, AlertCircle, Upload, ChevronRight
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { apiUrl } from "@/lib/api"

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"]

interface DashboardData {
  summary: {
    totalIncome: number
    totalExpense: number
    netProfit: number
    taxPayable: number
  }
  trend: Array<{ month: string; year: number; income: number; expense: number; net: number }>
  categoryBreakdown: Array<{ name: string; value: number }>
  recentTransactions: any[]
  pendingPayments: any[]
}

function SummaryCard({ title, value, icon: Icon, trend, color }: {
  title: string; value: string; icon: any; trend?: "up" | "down" | "neutral"; color: "green" | "red" | "blue" | "orange"
}) {
  const colors = {
    green: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950",
    red: "text-red-600 bg-red-50 dark:bg-red-950",
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-950",
    orange: "text-orange-600 bg-orange-50 dark:bg-orange-950",
  }
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className={cn("p-3 rounded-full", colors[color])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            {trend === "up" ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : trend === "down" ? <ArrowDownRight className="h-3 w-3 text-red-500" /> : null}
            <span>Current month</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const now = new Date()

  useEffect(() => {
    fetch(apiUrl(`/api/dashboard?month=${now.getMonth() + 1}&year=${now.getFullYear()}`))
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  const statusColor: Record<string, string> = {
    PAID: "bg-emerald-100 text-emerald-700",
    PENDING: "bg-yellow-100 text-yellow-700",
    OVERDUE: "bg-red-100 text-red-700",
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {now.toLocaleString("en-CA", { month: "long", year: "numeric" })} overview
          </p>
        </div>
        <Link href="/upload">
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Invoice
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <SummaryCard title="Total Income" value={formatCurrency(data?.summary.totalIncome || 0)} icon={TrendingUp} color="green" trend="up" />
            <SummaryCard title="Total Expenses" value={formatCurrency(data?.summary.totalExpense || 0)} icon={TrendingDown} color="red" trend="down" />
            <SummaryCard
              title="Net Profit/Loss"
              value={formatCurrency(Math.abs(data?.summary.netProfit || 0))}
              icon={(data?.summary.netProfit || 0) >= 0 ? TrendingUp : TrendingDown}
              color={(data?.summary.netProfit || 0) >= 0 ? "green" : "red"}
            />
            <SummaryCard title="Tax Payable (QTR)" value={formatCurrency(data?.summary.taxPayable || 0)} icon={IndianRupee} color="orange" />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Income vs Expense Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Income vs Expenses (12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data?.trend} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                  <Legend />
                  <Bar dataKey="income" fill="#10b981" name="Income" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Expense Breakdown Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expense by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={data?.categoryBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(props: any) => `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {data?.categoryBreakdown.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Line Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash Flow Trend (Net Balance)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data?.trend} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Net Balance" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions & Pending Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Transactions</CardTitle>
            <Link href="/ledger">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                View all <ChevronRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <div className="space-y-3">
                {(data?.recentTransactions || []).slice(0, 6).map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between py-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tx.companyName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className={cn("text-sm font-semibold", tx.type === "INCOME" ? "text-emerald-600" : "text-red-600")}>
                        {tx.type === "INCOME" ? "+" : "-"}{formatCurrency(tx.totalAmount)}
                      </p>
                      <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", statusColor[tx.paymentStatus])}>
                        {tx.paymentStatus}
                      </span>
                    </div>
                  </div>
                ))}
                {(!data?.recentTransactions || data.recentTransactions.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">No transactions yet</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending/Overdue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Pending & Overdue
            </CardTitle>
            <Link href="/ledger?status=PENDING">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                View all <ChevronRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <div className="space-y-3">
                {(data?.pendingPayments || []).slice(0, 6).map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between py-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tx.companyName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className={cn("text-sm font-semibold", tx.type === "INCOME" ? "text-emerald-600" : "text-red-600")}>
                        {formatCurrency(tx.totalAmount)}
                      </p>
                      <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", statusColor[tx.paymentStatus])}>
                        {tx.paymentStatus}
                      </span>
                    </div>
                  </div>
                ))}
                {(!data?.pendingPayments || data.pendingPayments.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">No pending payments</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
