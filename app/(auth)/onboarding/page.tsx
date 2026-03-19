"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TrendingUp, ChevronRight, ChevronLeft, Check } from "lucide-react"
import { CANADIAN_PROVINCES, US_STATES, getDefaultTaxRate, getDefaultTaxRateUS } from "@/lib/utils"
import { apiFetch } from "@/lib/api"
import { toast } from "sonner"

type Step = 1 | 2 | 3

interface FormData {
  displayName: string
  email: string
  avatarUrl: string
  businessName: string
  taxNumber: string
  currency: string
  country: string
  province: string
  city: string
}

const STEPS = [
  { title: "Your Profile", description: "Confirm your details from Google" },
  { title: "Business Info", description: "Tell us about your business" },
  { title: "Location & Tax", description: "Set your region for tax calculations" },
]

const DEFAULT_CA_PROVINCE = "AB"
const DEFAULT_US_STATE = "CA"

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormData>({
    displayName: "",
    email: "",
    avatarUrl: "",
    businessName: "",
    taxNumber: "",
    currency: "CAD",
    country: "CA",
    province: DEFAULT_CA_PROVINCE,
    city: "",
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/login"); return }
      if (user.user_metadata?.onboarded) { router.push("/"); return }
      setForm(f => ({
        ...f,
        displayName: user.user_metadata?.full_name ?? "",
        email: user.email ?? "",
        avatarUrl: user.user_metadata?.avatar_url ?? "",
        businessName: user.user_metadata?.full_name ? `${user.user_metadata.full_name}'s Business` : "My Business",
      }))
    })
  }, [])

  const handleCountryChange = (country: string | null) => {
    if (!country) return
    setForm(f => ({
      ...f,
      country,
      province: country === "US" ? DEFAULT_US_STATE : DEFAULT_CA_PROVINCE,
      currency: country === "US" ? "USD" : "CAD",
    }))
  }

  const next = () => setStep(s => (s < 3 ? (s + 1) as Step : s))
  const back = () => setStep(s => (s > 1 ? (s - 1) as Step : s))

  const finish = async () => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/business/onboard", {
        method: "POST",
        body: JSON.stringify({
          name: form.businessName || "My Business",
          taxNumber: form.taxNumber || null,
          currency: form.currency,
          province: form.province,
          city: form.city || null,
          country: form.country,
        }),
      })
      if (!res.ok) throw new Error("Onboard failed")
      await supabase.auth.refreshSession()
      router.push("/")
    } catch (err) {
      console.error(err)
      toast.error("Setup failed. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const isUS = form.country === "US"
  const taxRate = isUS ? getDefaultTaxRateUS(form.province) : getDefaultTaxRate(form.province)
  const taxLabel = isUS
    ? `${US_STATES.find(s => s.code === form.province)?.name ?? ""} Sales Tax`
    : CANADIAN_PROVINCES.find(p => p.code === form.province)?.taxLabel ?? "Tax"

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary">
            <TrendingUp className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">BizLedger</h1>
            <p className="text-xs text-muted-foreground">Setup your account</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-2">
          {([1, 2, 3] as Step[]).map(s => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="border border-border rounded-xl p-6 bg-card space-y-5">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Step {step} of 3
            </p>
            <h2 className="text-xl font-bold mt-0.5">{STEPS[step - 1].title}</h2>
            <p className="text-sm text-muted-foreground">{STEPS[step - 1].description}</p>
          </div>

          {/* Step 1: Profile */}
          {step === 1 && (
            <div className="space-y-4">
              {form.avatarUrl && (
                <img
                  src={form.avatarUrl}
                  alt="Profile"
                  className="w-16 h-16 rounded-full border-2 border-border"
                />
              )}
              <div className="space-y-1">
                <Label>Full Name</Label>
                <Input
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={form.email} readOnly className="bg-muted/50 text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Step 2: Business */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Business Name *</Label>
                <Input
                  value={form.businessName}
                  onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))}
                  placeholder="Acme Corp."
                />
              </div>
              <div className="space-y-1">
                <Label>Tax / Business Number (optional)</Label>
                <Input
                  value={form.taxNumber}
                  onChange={e => setForm(f => ({ ...f, taxNumber: e.target.value }))}
                  placeholder="123456789RT0001"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v ?? "CAD" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAD">CAD – Canadian Dollar</SelectItem>
                    <SelectItem value="USD">USD – US Dollar</SelectItem>
                    <SelectItem value="EUR">EUR – Euro</SelectItem>
                    <SelectItem value="GBP">GBP – British Pound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 3: Location */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Country</Label>
                <Select value={form.country} onValueChange={handleCountryChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CA">Canada</SelectItem>
                    <SelectItem value="US">United States</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>{isUS ? "State" : "Province / Territory"}</Label>
                {isUS ? (
                  <Select value={form.province} onValueChange={v => setForm(f => ({ ...f, province: v ?? DEFAULT_US_STATE }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {US_STATES.map(s => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.name}{s.salesTaxRate > 0 ? ` — ${s.salesTaxRate}%` : " — No sales tax"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={form.province} onValueChange={v => setForm(f => ({ ...f, province: v ?? DEFAULT_CA_PROVINCE }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CANADIAN_PROVINCES.map(p => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.name} — {p.taxLabel} ({p.primaryRate}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1">
                <Label>City (optional)</Label>
                <Input
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder={isUS ? "San Francisco" : "Calgary"}
                />
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="text-muted-foreground">Default tax rate: </span>
                <span className="font-semibold">{taxRate}%</span>
                <span className="text-muted-foreground ml-1">({taxLabel})</span>
                {taxRate === 0 && <span className="text-muted-foreground ml-1">— tax-free region</span>}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={back} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <Button onClick={next} className="gap-2" disabled={step === 2 && !form.businessName.trim()}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving} className="gap-2">
              <Check className="h-4 w-4" />
              {saving ? "Setting up..." : "Finish Setup"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
