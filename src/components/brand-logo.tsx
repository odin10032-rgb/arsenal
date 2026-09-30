/**
 * Logo de marque — clé de mécanicien (référence aux « Tools »)
 * SVG inline rouge sur plaque sombre, réutilisé partout (header, admin, login).
 */

export function BrandLogo({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid flex-shrink-0 place-items-center rounded-[9px] border border-[#333] bg-[#141414]"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        fill="none"
        stroke="#e63946"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    </span>
  );
}

/** Favicon : la même clé, encodée data-URI */
export const BRAND_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#0a0a0a'/><path d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' fill='none' stroke='#e63946' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' transform='translate(10 10) scale(1.83)'/></svg>",
  );
