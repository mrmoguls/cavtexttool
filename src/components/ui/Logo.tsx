import { useState } from 'react'

// CAV Hub logo. Uses the real Care-A-Van logo at public/brand/logo.png when it's there
// (see public/brand/README.md); until then, a drawn shield mark.
const LOGO_URL = `${import.meta.env.BASE_URL}brand/logo.png`
// Remember a missing logo for the rest of the visit so every screen doesn't ask again.
let logoMissing = false

export function Logo({ size = 'md', onDark = false }: { size?: 'sm' | 'md' | 'lg'; onDark?: boolean }) {
  const scale = size === 'sm' ? 28 : size === 'lg' ? 52 : 36
  const [hasImage, setHasImage] = useState(!logoMissing)

  const mark = hasImage ? (
    // The logo has a white background, so it sits on a white chip in the dark header.
    <span className={`inline-flex items-center justify-center rounded-lg ${onDark ? 'bg-white px-1 py-0.5' : ''}`}>
      <img
        src={LOGO_URL}
        alt="Care-A-Van"
        onError={() => { logoMissing = true; setHasImage(false) }}
        style={{ height: size === 'lg' ? 96 : scale, width: 'auto' }}
      />
    </span>
  ) : (
    <svg width={scale} height={scale * 1.1} viewBox="0 0 40 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Care-A-Van">
      <clipPath id="shield-clip">
        <path d="M20 2L3 9V22C3 31.6 10.5 40.4 20 43C29.5 40.4 37 31.6 37 22V9L20 2Z" />
      </clipPath>
      <path d="M20 2L3 9V22C3 31.6 10.5 40.4 20 43C29.5 40.4 37 31.6 37 22V9L20 2Z" fill="#0B1A5C" />
      <g clipPath="url(#shield-clip)">
        <rect x="2" y="2" width="36" height="5" fill="#CC2A2A" />
        <rect x="2" y="11" width="36" height="5" fill="#CC2A2A" />
        <rect x="2" y="20" width="36" height="5" fill="#CC2A2A" />
        <rect x="2" y="7" width="36" height="4" fill="white" />
        <rect x="2" y="16" width="36" height="4" fill="white" />
        <rect x="2" y="25" width="36" height="20" fill="#0B1A5C" />
        <text x="10" y="38" fontSize="6" fill="white" textAnchor="middle">★</text>
        <text x="20" y="34" fontSize="6" fill="white" textAnchor="middle">★</text>
        <text x="30" y="38" fontSize="6" fill="white" textAnchor="middle">★</text>
      </g>
      <path d="M20 2L3 9V22C3 31.6 10.5 40.4 20 43C29.5 40.4 37 31.6 37 22V9L20 2Z" stroke="#1B2E6B" strokeWidth="1.5" fill="none" />
    </svg>
  )

  // On the sign-in screens the logo stands on its own with the app name under it.
  if (size === 'lg') {
    return (
      <div className="flex flex-col items-center gap-2">
        {mark}
        <span className="font-extrabold tracking-tight text-[#0B1A5C] text-2xl">CAV <span className="text-[#CC2A2A]">Hub</span></span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5">
      {mark}
      <span className={`font-extrabold tracking-tight leading-none ${onDark ? 'text-white' : 'text-[#0B1A5C]'}`} style={{ fontSize: scale * 0.5 }}>
        CAV <span className={onDark ? 'text-red-400' : 'text-[#CC2A2A]'}>Hub</span>
      </span>
    </div>
  )
}
