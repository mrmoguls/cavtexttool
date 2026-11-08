// CAV Hub logo: the Care-A-Van badge plus the app name.
// src/assets/logo.png is made from brand/CareAVanLogo.jpg by scripts/make-icons.py.
import logoUrl from '../../assets/logo.png'

export function Logo({ size = 'md', onDark = false }: { size?: 'sm' | 'md' | 'lg'; onDark?: boolean }) {
  const height = size === 'sm' ? 30 : size === 'lg' ? 120 : 40

  // The logo has a white background, so on the navy header it sits on a white chip.
  const mark = (
    <span className={`inline-flex items-center justify-center rounded-lg ${onDark ? 'bg-white px-1 py-0.5' : ''}`}>
      <img src={logoUrl} alt="Care-A-Van" style={{ height, width: 'auto' }} />
    </span>
  )

  // Sign-in screens: the badge on its own with the app name under it.
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
      <span className={`font-extrabold tracking-tight leading-none ${onDark ? 'text-white' : 'text-[#0B1A5C]'}`} style={{ fontSize: height * 0.5 }}>
        CAV <span className={onDark ? 'text-red-400' : 'text-[#CC2A2A]'}>Hub</span>
      </span>
    </div>
  )
}
