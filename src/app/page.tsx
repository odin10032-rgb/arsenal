import { redirect } from "next/navigation";

/**
 * Bêta Arsenal — page racine.
 * La SPA vanilla (public/index.html + app.js + style.css) est servie via la
 * réécriture beforeFiles "/ → /index.html" dans next.config.ts.
 * Ce composant n'est atteint que si la réécriture est désactivée : il
 * redirige alors vers la SPA (le fragment #admin est préservé par le navigateur).
 */
export default function Home() {
  redirect("/index.html");
}
