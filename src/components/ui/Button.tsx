import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  fullWidth?: boolean
}

const variants = {
  primary: 'bg-[#C17F4A] text-white hover:bg-[#D4985E] active:bg-[#A86E3C] shadow-sm',
  secondary: 'bg-[#F5F1ED] text-[#3D2E26] border border-[#D9D2CA] hover:bg-[#EAE5E0] active:bg-[#D9D2CA]',
  ghost: 'bg-transparent text-[#C17F4A] hover:bg-[#F0E4D4] active:bg-[#E8D5BE]',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-base rounded-xl',
  lg: 'px-5 py-3.5 text-base rounded-xl font-medium',
}

export function Button({ variant = 'primary', size = 'md', children, fullWidth, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 font-medium
        transition-all duration-150 ease-out
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
}
