"use client";

/**
 * Historique de statut d'affiliation (table `status_history`).
 *
 * ⚠️ IMPORTANT : à ce jour il n'existe AUCUNE route API pour lire cet historique
 * (les données sont écrites mais jamais exposées côté client). Ce composant est
 * donc PUREMENT présentationnel : il reçoit ses entrées via la prop `entries`,
 * fournies par l'appelant. Tant qu'une route de lecture n'est pas ajoutée côté
 * Worker, `entries` sera vide et le composant affiche un état neutre — il ne fait
 * AUCUN appel réseau.
 *
 * Sémantique des colonnes (schéma `status_history`) : `from_role` / `to_role`
 * portent un RÔLE (`user`, `affiliate`, `super_affiliate`) OU un STATUT
 * (`pending`, `active`, `suspended`) selon la transition journalisée ; le motif
 * est un texte libre (ex. « admin_promotion », « request », ou une note d'admin).
 */

export interface StatusHistoryEntry {
  id: string;
  /** Horodatage d'écriture (ms epoch) */
  createdAt: number;
  fromRole: string | null;
  toRole: string;
  reason: string | null;
}

/** Libellés FR des rôles et statuts observables dans l'historique. */
const ROLE_LABELS: Record<string, string> = {
  user: "Utilisateur",
  affiliate: "Affilié",
  super_affiliate: "Super affilié",
  admin: "Admin",
  // Statuts d'affiliation (transitions actif/suspendu)
  pending: "En attente",
  active: "Actif",
  suspended: "Suspendu",
};

/** Motifs connus → libellés lisibles ; tout autre motif est affiché tel quel. */
const REASON_LABELS: Record<string, string> = {
  request: "Demande de promotion",
  admin_promotion: "Promotion par l'équipe",
};

function roleLabel(role: string | null): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role;
}

function reasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return REASON_LABELS[reason] ?? reason;
}

function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function AffiliateStatusHistory({ entries }: { entries: StatusHistoryEntry[] }) {
  return (
    <div className="mt-4 rounded-2xl border border-[#333] bg-[#141414] p-6">
      <h2 className="font-display text-[1rem] font-bold">Historique de statut</h2>
      <p className="mt-1 text-[0.78rem] text-[#666]">
        Les changements de statut de votre compte affilié, du plus récent au plus ancien.
      </p>

      {entries.length === 0 ? (
        <p className="mt-4 text-[0.84rem] text-[#666]">
          Aucun changement de statut enregistré pour le moment.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3 border-t border-dashed border-[#333] pt-4">
          {entries.map((e) => {
            const reason = reasonLabel(e.reason);
            return (
              <li key={e.id} className="flex flex-col gap-1">
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-[#666]">
                  {formatDate(e.createdAt)}
                </span>
                <span className="text-[0.86rem] text-[#f0f0f0]">
                  {roleLabel(e.fromRole)} <span className="text-[#666]">→</span> {roleLabel(e.toRole)}
                </span>
                {reason && <span className="text-[0.78rem] text-[#a0a0a0]">{reason}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
