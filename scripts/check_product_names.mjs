// Vérification d'antériorité des noms des 12 produits de démo "Bêta Arsenal"
// Objectif : déterminer si ces noms correspondent à des produits réels existants
import ZAI from 'z-ai-web-dev-sdk';

const names = [
  'NeuroForm AI',
  'PixelPeek',
  'ClipForge',
  'TermVault',
  'RepoSentinel',
  'HydroTrack',
  'FokusFlow',
  'Prompt Alchemy',
  'ZenPost',
  'FlowBridge',
  'NeuroForm',
  'MegaPack prompts'
];

async function main() {
  const zai = await ZAI.create();
  const report = [];

  for (const name of names) {
    try {
      const results = await zai.functions.invoke('web_search', {
        query: `"${name}"`,
        num: 5
      });
      const items = (results || []).slice(0, 5).map(r => ({
        title: r.name,
        host: r.host_name,
        url: r.url
      }));
      report.push({ name, count: items.length, items });
      console.log(`\n=== ${name} (${items.length} résultats) ===`);
      items.forEach(i => console.log(`  - ${i.title}  [${i.host}]`));
    } catch (e) {
      console.log(`\n=== ${name} — ERREUR: ${e.message} ===`);
      report.push({ name, error: e.message });
    }
  }

  // Sauvegarde du rapport brut
  const fs = await import('fs');
  fs.writeFileSync('/home/z/my-project/scripts/name_check_report.json', JSON.stringify(report, null, 2));
  console.log('\nRapport sauvegardé.');
}

main().catch(e => { console.error(e); process.exit(1); });
