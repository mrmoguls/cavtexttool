// Care-A-Van wordmark + van icon
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const scale = size === 'sm' ? 28 : size === 'lg' ? 48 : 36

  return (
    <div className="flex items-center gap-2.5">
      {/* Van icon */}
      <svg width={scale} height={scale} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="10" fill="#C17F4A"/>
        {/* Van body */}
        <path d="M5 22V16C5 14.9 5.9 14 7 14H22L28 19V22H5Z" fill="white"/>
        {/* Windshield */}
        <path d="M20 14H24L27 18H20V14Z" fill="#EAE5E0" fillOpacity="0.6"/>
        {/* Roof cross */}
        <rect x="14" y="11" width="1.5" height="5" rx="0.75" fill="white"/>
        <rect x="12" y="13" width="5.5" height="1.5" rx="0.75" fill="white"/>
        {/* Wheels */}
        <circle cx="10" cy="23" r="2.5" fill="#3D2E26"/>
        <circle cx="10" cy="23" r="1" fill="#8C7B72"/>
        <circle cx="23" cy="23" r="2.5" fill="#3D2E26"/>
        <circle cx="23" cy="23" r="1" fill="#8C7B72"/>
      </svg>
      <div className="flex flex-col leading-none">
        <span
          className="font-semibold tracking-tight text-[#3D2E26]"
          style={{ fontSize: scale * 0.42 }}
        >
          Care-A-Van
        </span>
        <span
          className="text-[#8C7B72] font-normal tracking-widest uppercase"
          style={{ fontSize: scale * 0.25 }}
        >
          Connect
        </span>
      </div>
    </div>
  )
}
