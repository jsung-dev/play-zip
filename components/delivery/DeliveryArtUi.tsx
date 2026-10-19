// Small inline illustrations for the start, quiz, result and pause dialogs.
// Pure SVG (no image files), decorative only: every use is aria-hidden.

type Badge = "home" | "check" | "question";

/** Dome-shaped neighbourhood scene with a map pin over a house. */
export function DeliveryHero({ badge = "home", className }: { badge?: Badge; className?: string }) {
  return <svg className={className} viewBox="0 0 320 140" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bfe6ff" /><stop offset="1" stopColor="#f2fbff" /></linearGradient>
      <clipPath id="hero-dome"><path d="M22 140a138 132 0 0 1 276 0z" /></clipPath>
    </defs>
    <g clipPath="url(#hero-dome)">
      <rect width="320" height="140" fill="url(#hero-sky)" />
      <path d="M60 112 112 66l40 30 44-42 72 58z" fill="#d9eefa" />
      <g fill="#fff" stroke="#9ccbe8" strokeWidth="2"><path d="M70 60a10 10 0 0 1 18-6 8 8 0 0 1 14 7H66a5 5 0 0 1 4-1z" /><path d="M226 48a11 11 0 0 1 20-6 8 8 0 0 1 14 8h-38a5 5 0 0 1 4-2z" /></g>
      <path d="M0 116q80-14 160-6t160 0v30H0z" fill="#9fd98a" />
      <path d="M150 140q4-16 14-26h10q-6 10-4 26z" fill="#f6e3bf" />
      <g fill="#6cbf6a"><circle cx="66" cy="110" r="15" /><circle cx="86" cy="116" r="11" /><circle cx="248" cy="108" r="16" /><circle cx="226" cy="116" r="10" /><circle cx="270" cy="118" r="10" /></g>
      <g fill="#4aa457"><circle cx="58" cy="118" r="8" /><circle cx="258" cy="118" r="8" /></g>
      {/* house */}
      <rect x="132" y="86" width="56" height="34" rx="3" fill="#fff6e8" stroke="#e8c9a2" strokeWidth="1.5" />
      <path d="M126 90 160 64l34 26z" fill="#f2695c" stroke="#d9503f" strokeWidth="2" strokeLinejoin="round" />
      <rect x="153" y="100" width="13" height="20" rx="4" fill="#f5a05a" />
      <rect x="138" y="96" width="10" height="9" rx="2" fill="#8cc8ef" /><rect x="172" y="96" width="10" height="9" rx="2" fill="#8cc8ef" />
      <g stroke="#ffcf4a" strokeWidth="3" strokeLinecap="round"><path d="M128 30l-7-5M126 44h-9M192 30l7-5M194 44h9" /></g>
    </g>
    {/* map pin */}
    <path d="M160 64c-12-14-19-24-19-33a19 19 0 0 1 38 0c0 9-7 19-19 33z" fill="#f25b5b" stroke="#d94545" strokeWidth="2" />
    <circle cx="160" cy="31" r="11" fill="#fff" />
    {badge === "home" && <path d="M154 33l6-6 6 6v6h-12z" fill="#f25b5b" />}
    {badge === "check" && <path d="M154 31l4 4 8-8" fill="none" stroke="#13855f" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />}
    {badge === "question" && <text x="160" y="37" textAnchor="middle" fontSize="16" fontWeight="900" fill="#f25b5b">?</text>}
  </svg>;
}

/** Three short strokes either side of a title. */
export function Spark({ flip = false }: { flip?: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={flip ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M13 3l5 6M3 12l8 1M5 20l7-3" fill="none" stroke="#82d6b6" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

export function HouseArt() {
  return <svg viewBox="0 0 48 40" aria-hidden="true" focusable="false">
    <circle cx="9" cy="33" r="6" fill="#6cbf6a" /><circle cx="40" cy="33" r="6" fill="#6cbf6a" />
    <rect x="11" y="18" width="26" height="19" rx="2" fill="#fff6e8" stroke="#e8c9a2" />
    <path d="M7 20 24 6l17 14z" fill="#f2695c" stroke="#d9503f" strokeLinejoin="round" />
    <rect x="21" y="25" width="7" height="12" rx="2" fill="#f5a05a" /><rect x="14" y="23" width="5" height="5" rx="1" fill="#8cc8ef" />
  </svg>;
}

export function ApartmentArt() {
  return <svg viewBox="0 0 48 40" aria-hidden="true" focusable="false">
    <circle cx="8" cy="34" r="6" fill="#6cbf6a" /><circle cx="41" cy="34" r="5" fill="#6cbf6a" />
    <rect x="9" y="14" width="10" height="24" rx="2" fill="#d6ebfa" stroke="#9cc6e6" />
    <rect x="17" y="4" width="20" height="34" rx="2" fill="#e6f3fd" stroke="#8dbde3" />
    <g fill="#7cb6e6"><rect x="21" y="9" width="5" height="5" rx="1" /><rect x="29" y="9" width="5" height="5" rx="1" /><rect x="21" y="18" width="5" height="5" rx="1" /><rect x="29" y="18" width="5" height="5" rx="1" /><rect x="24" y="29" width="7" height="9" rx="1" /></g>
  </svg>;
}
