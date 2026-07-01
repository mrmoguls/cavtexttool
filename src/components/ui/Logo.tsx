// Care-A-Van shield mark + wordmark
export function Logo({ size = 'md', onDark = false }: { size?: 'sm' | 'md' | 'lg'; onDark?: boolean }) {
  const scale = size === 'sm' ? 28 : size === 'lg' ? 52 : 36

  return (
    <div className="flex items-center gap-2.5">
      {/* Shield icon */}
      <svg width={scale} height={scale * 1.1} viewBox="0 0 40 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Shield body */}
        <path d="M20 2L3 9V22C3 31.6 10.5 40.4 20 43C29.5 40.4 37 31.6 37 22V9L20 2Z" fill="#0B1A5C"/>
        {/* Flag stripes (top half) */}
        <clipPath id="shield-clip">
          <path d="M20 2L3 9V22C3 31.6 10.5 40.4 20 43C29.5 40.4 37 31.6 37 22V9L20 2Z"/>
        </clipPath>
        <g clipPath="url(#shield-clip)">
          {/* Red stripe bands */}
          <rect x="2" y="2" width="36" height="5" fill="#CC2A2A"/>
          <rect x="2" y="11" width="36" height="5" fill="#CC2A2A"/>
          <rect x="2" y="20" width="36" height="5" fill="#CC2A2A"/>
          {/* White bands */}
          <rect x="2" y="7" width="36" height="4" fill="white"/>
          <rect x="2" y="16" width="36" height="4" fill="white"/>
          {/* Navy bottom */}
          <rect x="2" y="25" width="36" height="20" fill="#0B1A5C"/>
          {/* Stars */}
          <text x="10" y="38" fontSize="6" fill="white" textAnchor="middle">★</text>
          <text x="20" y="34" fontSize="6" fill="white" textAnchor="middle">★</text>
          <text x="30" y="38" fontSize="6" fill="white" textAnchor="middle">★</text>
          {/* Caduceus simplified */}
          <line x1="20" y1="26" x2="20" y2="42" stroke="white" strokeWidth="1.2"/>
          <ellipse cx="18" cy="29" rx="2" ry="1.5" stroke="white" strokeWidth="0.8" fill="none"/>
          <ellipse cx="22" cy="32" rx="2" ry="1.5" stroke="white" strokeWidth="0.8" fill="none"/>
        </g>
        {/* Shield border */}
        <path d="M20 2L3 9V22C3 31.6 10.5 40.4 20 43C29.5 40.4 37 31.6 37 22V9L20 2Z" stroke="#1B2E6B" strokeWidth="1.5" fill="none"/>
      </svg>

      <div className="flex flex-col leading-none">
        <span
          className={`font-bold tracking-tight ${onDark ? 'text-white' : 'text-[#0B1A5C]'}`}
          style={{ fontSize: scale * 0.38 }}
        >
          CARE·A·VAN
        </span>
        <span
          className={`font-medium tracking-widest uppercase ${onDark ? 'text-red-400' : 'text-[#CC2A2A]'}`}
          style={{ fontSize: scale * 0.22 }}
        >
          Connect
        </span>
      </div>
    </div>
  )
}
