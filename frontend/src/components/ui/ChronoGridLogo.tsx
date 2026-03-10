interface ChronoGridLogoProps {
  /** Rozmiar ikony w px (domyślnie 36) */
  size?: number
  /** Czy pokazać tekst obok ikony (domyślnie true) */
  showText?: boolean
  className?: string
}

export function ChronoGridLogo({ size = 36, showText = true, className = '' }: ChronoGridLogoProps) {
  const iconSize = size
  const fontSize = Math.round(size * 0.55)

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Ikona siatki kalendarza */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Tło */}
        <rect x="1" y="1" width="46" height="46" rx="11" fill="#4F46E5" />

        {/* Linie siatki poziome */}
        <line x1="1" y1="16" x2="47" y2="16" stroke="white" strokeWidth="2.5" strokeOpacity="0.55" />
        <line x1="1" y1="30" x2="47" y2="30" stroke="white" strokeWidth="2.5" strokeOpacity="0.55" />

        {/* Linie siatki pionowe */}
        <line x1="17" y1="16" x2="17" y2="47" stroke="white" strokeWidth="2.5" strokeOpacity="0.55" />
        <line x1="32" y1="16" x2="32" y2="47" stroke="white" strokeWidth="2.5" strokeOpacity="0.55" />

        {/* Uchwyty kalendarza */}
        <circle cx="16" cy="6.5" r="3" fill="white" fillOpacity="0.9" />
        <circle cx="32" cy="6.5" r="3" fill="white" fillOpacity="0.9" />

        {/* Aktywna komórka (środkowa) */}
        <rect x="18.5" y="17.5" width="11" height="11" rx="2.5" fill="white" fillOpacity="0.28" />

        {/* Kropka w aktywnej komórce */}
        <circle cx="24" cy="23" r="2.5" fill="white" fillOpacity="0.9" />
      </svg>

      {/* Tekst logo */}
      {showText && (
        <span
          className="font-bold tracking-tight text-gray-900 dark:text-slate-100"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1 }}
        >
          Chrono<span className="text-indigo-600 dark:text-indigo-400">Grid</span>
        </span>
      )}
    </div>
  )
}
