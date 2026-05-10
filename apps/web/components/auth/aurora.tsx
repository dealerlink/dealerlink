// Aurora illustration — abstract gradient blobs + grid + floating cards.
// Adapted from docs/screens-extra.jsx LOGIN_THEMES.aurora.
export function AuroraIllustration() {
  return (
    <svg
      viewBox="0 0 600 800"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id="aur-a" cx="0.7" cy="0.25" r="0.7">
          <stop offset="0%" stopColor="#7C6BFF" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#7C6BFF" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#7C6BFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="aur-b" cx="0.15" cy="0.85" r="0.6">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#A78BFA" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="aur-c" cx="0.5" cy="0.55" r="0.5">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
        </radialGradient>
        <pattern id="aur-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0L0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="600" height="800" fill="url(#aur-grid)" />
      <rect width="600" height="800" fill="url(#aur-a)" />
      <rect width="600" height="800" fill="url(#aur-b)" />
      <rect width="600" height="800" fill="url(#aur-c)" />
      <g opacity="0.92">
        <rect
          x="80"
          y="200"
          width="180"
          height="64"
          rx="10"
          fill="#fff"
          fillOpacity="0.06"
          stroke="rgba(255,255,255,0.18)"
        />
        <circle cx="108" cy="232" r="12" fill="#7C6BFF" />
        <rect x="130" y="222" width="100" height="6" rx="3" fill="rgba(255,255,255,0.5)" />
        <rect x="130" y="236" width="70" height="5" rx="2.5" fill="rgba(255,255,255,0.25)" />

        <rect
          x="320"
          y="320"
          width="200"
          height="84"
          rx="10"
          fill="#fff"
          fillOpacity="0.08"
          stroke="rgba(255,255,255,0.22)"
        />
        <rect x="338" y="338" width="62" height="9" rx="2" fill="rgba(255,255,255,0.6)" />
        <text x="338" y="380" fill="#fff" fontFamily="ui-sans-serif" fontWeight="600" fontSize="22">
          +24.8%
        </text>
        <polyline
          points="430,388 446,372 460,378 476,358 502,344"
          fill="none"
          stroke="#22D3EE"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <rect
          x="120"
          y="520"
          width="240"
          height="56"
          rx="10"
          fill="#fff"
          fillOpacity="0.05"
          stroke="rgba(255,255,255,0.15)"
        />
        <circle cx="148" cy="548" r="10" fill="#22D3EE" />
        <rect x="166" y="540" width="140" height="6" rx="3" fill="rgba(255,255,255,0.45)" />
        <rect x="166" y="554" width="86" height="5" rx="2.5" fill="rgba(255,255,255,0.22)" />
      </g>
    </svg>
  );
}
