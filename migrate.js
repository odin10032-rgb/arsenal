const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

async function migrate() {
  const products = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'products.json'), 'utf8'));
  const analytics = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'analytics.json'), 'utf8'));
  const media = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'media.json'), 'utf8'));

  let sql = [];

  // Migration Produits
  for (const p of products) {
    const badges = JSON.stringify(p.badges);
    sql.push(`INSERT INTO products (id, title, short_description, description, category, action_type, badges, price, action_url, apk_url, pwa_url, command, video_url, image_url, clicks, created_at, updated_at) VALUES ('${p.id.replace(/'/g, "''")}', '${p.title.replace(/'/g, "''")}', '${p.shortDescription.replace(/'/g, "''")}', '${p.description.replace(/'/g, "''")}', '${p.category}', '${p.actionType}', '${badges}', '${p.price}', '${p.actionUrl}', ${p.apkUrl ? `'${p.apkUrl}'` : 'NULL'}, ${p.pwaUrl ? `'${p.pwaUrl}'` : 'NULL'}, ${p.command ? `'${p.command.replace(/'/g, "''")}'` : 'NULL'}, ${p.videoUrl ? `'${p.videoUrl}'` : 'NULL'}, '${p.imageUrl}', ${p.clicks}, ${p.createdAt}, ${p.updatedAt});`);
  }

  // Migration Analytics
  sql.push(`INSERT INTO analytics (id, visits, actions_total, clicks_by_product, visits_by_day, recent_visits, updated_at) VALUES (1, ${analytics.visits}, ${analytics.actionsTotal}, '${JSON.stringify(analytics.clicksByProduct)}', '${JSON.stringify(analytics.visitsByDay)}', '${JSON.stringify(analytics.recentVisits)}', ${analytics.updatedAt});`);

  // Migration Media
  for (const m of media) {
    sql.push(`INSERT INTO media (name, url, kind, size, uploaded_at) VALUES ('${m.name.replace(/'/g, "''")}', '${m.url}', '${m.kind}', ${m.size}, ${m.uploadedAt});`);
  }

  fs.writeFileSync('migrate_final.sql', sql.join('\n'));
  console.log('Fichier migrate_final.sql généré avec succès. Exécutez : npx wrangler d1 execute arsenal-db --local --file=migrate_final.sql');
}

migrate();
