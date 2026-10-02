# -*- coding: utf-8 -*-
# Patch 5 : bouton « Promouvoir Super Affiliate » dans l'onglet Affiliés.
import io

path = r"src\components\admin\affiliates-tab.tsx"
content = io.open(path, encoding="utf-8").read()

# 1. Import de la nouvelle fonction admin
content = content.replace(
    "  setAffiliateStatus,",
    "  promoteSuperAffiliate,\n  setAffiliateStatus,",
    1,
)

# 2. État de l'action "promote" (réutilise ConfirmDialog existant)
old_state = "  const confirmAction = async () => {"
new_state = """  const [promoteTarget, setPromoteTarget] = useState<AdminAffiliate | null>(null);
  const [busyPromote, setBusyPromote] = useState(false);

  const confirmPromote = async () => {
    if (!promoteTarget || busyPromote) return;
    setBusyPromote(true);
    try {
      await promoteSuperAffiliate(promoteTarget.id);
      toast(
        `${promoteTarget.pseudo || promoteTarget.code} — Super Affiliate. L'animation sera jouée à sa prochaine visite.`,
        "success",
      );
      setPromoteTarget(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Promotion impossible.", "error");
    } finally {
      setBusyPromote(false);
    }
  };

  const confirmAction = async () => {"""
assert old_state in content, "état introuvable"
content = content.replace(old_state, new_state, 1)

# 3. Badge "demande en cours" + bouton Promouvoir dans la ligne.
#    Ancrage : le bloc des boutons d'action existants (setAction({ row: r, next: "suspended" })).
old_buttons = '''                          onClick={() => setAction({ row: r, next: "suspended" })}'''
assert old_buttons in content, "boutons introuvables"
# Repérer le <div> englobant : on insère le bouton AVANT la ligne du onClick suspendu,
# dans le même conteneur — plus sûr : ajouter après le bloc existant via ancrage sur
# la ligne du bouton suspendu, on ajoute un bouton promote dans le même parent.
# On utilise une insertion ciblée : trouver le bouton suspendu complet est fragile ;
# on insère donc juste après la ligne du bouton "Valider/Réactiver" (next: "active").
old_active_btn = '''                          onClick={() => setAction({ row: r, next: "active" })}'''
assert old_active_btn in content, "bouton actif introuvable"
# Identifier l'indentation de la ligne old_active_btn pour insérer au même niveau.
line_start = content[: content.index(old_active_btn)].rfind("\n")
indent_line = content[content.index(old_active_btn) - 200 : content.index(old_active_btn)]
# On insère un bloc bouton promote avant le bouton actif, même indentation approximative :
promote_block = '''                          {(r.superRequested || r.role !== "super_affiliate") && r.status === "active" && (
                            <button
                              type="button"
                              onClick={() => setPromoteTarget(r)}
                              className="flex-1 rounded-xl border border-[rgba(212,175,55,0.45)] bg-[rgba(212,175,55,0.08)] px-3 py-2 text-[0.74rem] font-semibold text-[#e9cd6c] transition-colors hover:border-[#d4af37]"
                            >
                              {r.superRequested ? "Demande ⤴" : "Super"}
                            </button>
                          )}
''' + old_active_btn
content = content.replace(old_active_btn, promote_block, 1)

# 4. Modale de confirmation de promotion (à la fin, avant la fermeture du composant).
old_confirm_end = """  const labels = action ? actionLabels(action) : null;"""
new_confirm_end = """  const labels = action ? actionLabels(action) : null;

  const promoteModal = promoteTarget ? (
    <ConfirmDialog
      title="Promouvoir Super Affiliate ?"
      message={`« ${promoteTarget.pseudo || promoteTarget.code} » obtiendra le rôle Super Affiliate : statistiques avancées, campagnes et privilèges associés. Un événement d'animation sera créé pour sa prochaine visite (irréversible).`}
      confirmLabel="Promouvoir"
      busy={busyPromote}
      onConfirm={() => void confirmPromote()}
      onCancel={() => setPromoteTarget(null)}
    />
  ) : null;"""
assert old_confirm_end in content
content = content.replace(old_confirm_end, new_confirm_end)

# 5. Rendre la modale (au niveau du ConfirmDialog existant) — ancre sur son rendu.
anchor_dialog = "<ConfirmDialog"
idx = content.index(anchor_dialog)
# La modale existante se rend quelque part ; on ajoute la nôtre juste après son bloc.
# Plus sûr : rendre {promoteModal} à côté du ConfirmDialog existant en cherchant sa fermeture.
close_idx = content.index("/ConfirmDialog>", idx) + len("/ConfirmDialog>")
# Aller à la fin de l'expression JSX existante : le ConfirmDialog est rendu comme {...}
# Le plus sûr est d'ajouter {promoteModal} juste après le bloc conditionnel existant.
# On cherche la ligne suivante qui ferme ce conditionnel (le premier "{  }" après).
# Approche pragmatique : insérer {promoteModal} immédiatement avant le ConfirmDialog existant.
content = content[:idx] + "{promoteModal}\n          " + content[idx:]

io.open(path, "w", encoding="utf-8").write(content)
print("affiliates-tab patché")
