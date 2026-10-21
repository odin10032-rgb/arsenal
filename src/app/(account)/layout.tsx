import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteBottomNav } from "@/components/site-bottom-nav";

/**
 * Layout espace compte : même coquille que le site public
 * (header avec pill de solde A intégrée + footer collé en bas + nav basse)
 */
export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(58px+env(safe-area-inset-bottom))]">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <SiteBottomNav />
    </div>
  );
}
