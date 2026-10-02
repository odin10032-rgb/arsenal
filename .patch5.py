# -*- coding: utf-8 -*-
# Patch 4 : AdminAffiliate.superRequested + role, campagnes-tab, bouton promote.
import io

# ---------- 1. lib/admin.ts : superRequested + role dans AdminAffiliate ----------
path = r"src\lib\admin.ts"
content = io.open(path, encoding="utf-8").read()

old_type = """export interface AdminAffiliate {
  id: string;
  code: string;
  status: AffiliateStatus;
  pseudo: string;
  email: string;
  clicks: number;
  sales: number;
  payable: number;
  paid: number;
  appliedAt: number | null;
  activatedAt: number | null;
}"""
new_type = """export interface AdminAffiliate {
  id: string;
  code: string;
  status: AffiliateStatus;
  /** Rôle du compte (user | affiliate | super_affiliate) — Phase 3. */
  role?: string | null;
  /** Une demande de promotion Super Affiliate est en attente. */
  superRequested?: boolean;
  pseudo: string;
  email: string;
  clicks: number;
  sales: number;
  payable: number;
  paid: number;
  appliedAt: number | null;
  activatedAt: number | null;
}"""
assert old_type in content
content = content.replace(old_type, new_type)

# Mapper les nouveaux champs dans fetchAdminAffiliates (après le mapping existant).
old_map_anchor = "      appliedAt: affiliateTs(item.appliedAt) ?? affiliateTs(item.appliedAt ?? null),"
if old_map_anchor not in content:
    # on cherche un point d'ancrage plus générique : la ligne activatedAt du mapping
    import re
    m = re.search(r"(\n\s*)activatedAt: ([^\n]+),", content)
    assert m, "ancrage mapping introuvable"
    content = content.replace(
        m.group(0),
        m.group(0)
        + m.group(1)
        + "role: typeof item.role === 'string' ? item.role : null,"
        + m.group(1)
        + "superRequested: item.superRequested === true,",
        1,
    )

io.open(path, "w", encoding="utf-8").write(content)
print("admin.ts : AdminAffiliate étendu")
