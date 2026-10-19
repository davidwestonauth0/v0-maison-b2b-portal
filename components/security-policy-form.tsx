"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { saveSecurityPolicy } from "@/app/security/policies/actions"
import { FACTORS, STEPUP_ACTIONS, type SecurityPolicy } from "@/lib/security-policy"

// ─── Row components ───────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function FieldRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-medium">{label}</Label>
      {children}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

export function SecurityPolicyForm({
  initialPolicy,
  initialFactors,
}: {
  initialPolicy: SecurityPolicy
  initialFactors: string[]
}) {
  const [policy, setPolicy] = useState<SecurityPolicy>(initialPolicy)
  const [factors, setFactors] = useState<string[]>(initialFactors)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof SecurityPolicy>(key: K) => (value: SecurityPolicy[K]) =>
    setPolicy((p) => ({ ...p, [key]: value }))

  const toggleStepupAction = (id: string) =>
    setPolicy((p) => ({
      ...p,
      stepupActions: p.stepupActions.includes(id)
        ? p.stepupActions.filter((a) => a !== id)
        : [...p.stepupActions, id],
    }))

  const toggleFactor = (id: string) =>
    setFactors((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    )

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const result = await saveSecurityPolicy(policy, factors)
      if (!result.ok) throw new Error(result.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
   <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Security policies card */}
      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">Security Policies</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Configure the security policies for your organisation.</p>
        </div>

        <div className="px-5 divide-y">
          <ToggleRow
            label="Require Multi-Factor Authentication"
            description="Users will be required to verify their identity with a second factor."
            checked={policy.enforce}
            onCheckedChange={set("enforce")}
          />
          <ToggleRow
            label="Allow remember device"
            description="Allow users to remember their device for 30 days."
            checked={policy.allowRemember}
            onCheckedChange={set("allowRemember")}
          />
        </div>
      </div>

      {/* MFA settings — only active when enforce is on */}
      <div className={!policy.enforce ? "opacity-50 pointer-events-none" : ""}>
        <div className="space-y-6">
          {/* MFA interval */}
          <div className="border rounded-lg bg-card p-5 space-y-4">
            <FieldRow label="MFA interval" description="Select the time in minutes between 2FA requests">
              <Input
                type="number"
                min={1}
                value={policy.interval}
                onChange={(e) => set("interval")(Number(e.target.value))}
                className="max-w-xs"
                disabled={!policy.enforce}
              />
            </FieldRow>
          </div>

          {/* Stepup actions */}
          <div className="border rounded-lg bg-card p-5 space-y-3">
            <div>
              <Label className="font-medium">Actions requiring 2FA</Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                Accessing these actions will trigger a step-up MFA challenge.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {STEPUP_ACTIONS.map(({ id, label }) => {
                const active = policy.stepupActions.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleStepupAction(id)}
                    disabled={!policy.enforce}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {active && <Check className="w-3 h-3" />}
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* MFA providers */}
          <div className="border rounded-lg bg-card p-5 space-y-4">
            <div>
              <Label className="font-medium">Select which MFA providers your users are allowed to use</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {FACTORS.map(({ id, label, description }) => {
                const checked = factors.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleFactor(id)}
                    disabled={!policy.enforce}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 mt-0.5 shrink-0 rounded border-2 flex items-center justify-center ${
                        checked ? "bg-primary border-primary" : "border-muted-foreground"
                      }`}
                    >
                      {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* IP ranges */}
      <div className="border rounded-lg bg-card p-5 space-y-5">
        <FieldRow label="Only allow logins from the following IP ranges" description="Enter a comma-separated list of IP ranges.">
          <Textarea
            value={policy.ipAllowList}
            onChange={(e) => set("ipAllowList")(e.target.value)}
            placeholder="e.g. 192.168.1.0/24, 10.0.0.1"
            rows={3}
          />
        </FieldRow>
        <hr className="border-border" />
        <FieldRow label="Deny logins from the following IP ranges" description="Enter a comma-separated list of IP ranges.">
          <Textarea
            value={policy.ipDenyList}
            onChange={(e) => set("ipDenyList")(e.target.value)}
            placeholder="e.g. 192.168.1.0/24, 10.0.0.1"
            rows={3}
          />
        </FieldRow>
      </div>

      {/* Session timeouts */}
      <div className="border rounded-lg bg-card p-5 space-y-5">
        <FieldRow label="Session Timeout" description="The session timeout in minutes.">
          <Input
            type="number"
            min={1}
            value={policy.sessionTimeout}
            onChange={(e) => set("sessionTimeout")(Number(e.target.value))}
            className="max-w-xs"
          />
        </FieldRow>
        <hr className="border-border" />
        <FieldRow label="Session Idle Timeout" description="The idle session timeout in minutes.">
          <Input
            type="number"
            min={1}
            value={policy.sessionIdleTimeout}
            onChange={(e) => set("sessionIdleTimeout")(Number(e.target.value))}
            className="max-w-xs"
          />
        </FieldRow>
      </div>

      {/* Save */}
      <div className="flex justify-end gap-3">
        {saved && (
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Check className="w-4 h-4 text-green-600" /> Saved
          </span>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save"}
        </Button>
      </div>
    </div>
  )
}
