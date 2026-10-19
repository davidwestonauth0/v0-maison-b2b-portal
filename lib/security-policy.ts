// Per-organization security policy, stored as JSON strings in the Auth0
// Organization's metadata (keys: securityPolicy, factors). This portal only
// stores and edits it — see the note on app/security/policies/page.tsx about
// what enforces it.
export interface SecurityPolicy {
  enforce: boolean
  allowRemember: boolean
  interval: number
  stepupActions: string[]
  ipAllowList: string
  ipDenyList: string
  sessionTimeout: number
  sessionIdleTimeout: number
}

export interface FactorsConfig {
  factors: string[]
}

export const DEFAULT_POLICY: SecurityPolicy = {
  enforce: false,
  allowRemember: false,
  interval: 15,
  stepupActions: [],
  ipAllowList: "",
  ipDenyList: "",
  sessionTimeout: 120,
  sessionIdleTimeout: 60,
}

export const DEFAULT_FACTORS: FactorsConfig = { factors: [] }

export const STEPUP_ACTIONS = [
  { id: "manage:stock", label: "Update stock" },
  { id: "manage:team", label: "Manage team" },
  { id: "manage:security", label: "Security & federation" },
]

export const FACTORS = [
  { id: "phone", label: "Phone", description: "OTP to verified phone" },
  { id: "otp", label: "One-time Password", description: "OTP using Google Authenticator or similar." },
  { id: "webauthn-platform", label: "Security Keys", description: "WebAuthn-compliant security keys (like FIDO2)." },
  { id: "email", label: "Email", description: "Email" },
  { id: "recovery-code", label: "Recovery Code", description: "Recovery Code" },
]

// Auth0 organization metadata values are limited to 255 characters each.
export const METADATA_VALUE_MAX = 255

function parseJson<T extends object>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

export function readSecurityPolicy(metadata: Record<string, string> | undefined) {
  return {
    policy: parseJson<SecurityPolicy>(metadata?.securityPolicy, DEFAULT_POLICY),
    factors: parseJson<FactorsConfig>(metadata?.factors, DEFAULT_FACTORS),
  }
}

/** Clamp/clean user input into a policy that is safe to store. */
export function sanitizePolicy(input: SecurityPolicy, factors: string[]) {
  const minutes = (value: number, fallback: number) =>
    Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback
  const policy: SecurityPolicy = {
    enforce: Boolean(input.enforce),
    allowRemember: Boolean(input.allowRemember),
    interval: minutes(input.interval, DEFAULT_POLICY.interval),
    stepupActions: input.stepupActions.filter((id) => STEPUP_ACTIONS.some((a) => a.id === id)),
    ipAllowList: String(input.ipAllowList ?? "").trim(),
    ipDenyList: String(input.ipDenyList ?? "").trim(),
    sessionTimeout: minutes(input.sessionTimeout, DEFAULT_POLICY.sessionTimeout),
    sessionIdleTimeout: minutes(input.sessionIdleTimeout, DEFAULT_POLICY.sessionIdleTimeout),
  }
  return { policy, factors: { factors: factors.filter((id) => FACTORS.some((f) => f.id === id)) } }
}
