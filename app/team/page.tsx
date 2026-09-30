import { MemberManagementSection } from "@/components/member-management-section"
import { ProductLineGrants } from "@/components/product-line-grants"

// Member list, invite, and role assignment are Auth0's own Organizations
// self-service management component (backed by the My Organization API) —
// this is the direct fulfillment of "universal components to delegate all
// aspects of organization management." There's no equivalent Auth0
// component for FGA product-line delegation (that's this app's own
// authorization model, not an Auth0-native concept), so the section below
// is this app's own UI, driven by lib/fga.ts.
export default function PortalTeamPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Team</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Invite employees, assign organization roles, and delegate which product lines each admin can manage.
        </p>
        <MemberManagementSection />
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-1">Product-line access</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Grants below are Auth0 FGA relationship tuples, scoped per product line — an admin can be a manager of one
          line and a viewer (or nothing at all) of another.
        </p>
        <ProductLineGrants />
      </div>
    </div>
  )
}
