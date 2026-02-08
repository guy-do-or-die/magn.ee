import * as React from 'react'

interface LogoProps {
  className?: string
  size?: number
}

/**
 * Magnee logo — double horseshoe in blue/red/silver.
 * Inline SVG so it works in both web and extension without static asset copying.
 */
export function Logo({ className, size = 24 }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="24 40 432 400"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <path id="magnee-lU" d="M 34,380 L 34,180 A 120,120 0 0 1 274,180 L 274,380 L 206,380 L 206,180 A 52,52 0 0 0 102,180 L 102,380 Z" />
        <path id="magnee-rU" d="M 206,380 L 206,180 A 120,120 0 0 1 446,180 L 446,380 L 378,380 L 378,180 A 52,52 0 0 0 274,180 L 274,380 Z" />
        <clipPath id="magnee-ll"><rect x="0" y="0" width="154" height="440" /></clipPath>
        <clipPath id="magnee-lr"><rect x="154" y="0" width="326" height="440" /></clipPath>
        <clipPath id="magnee-rl"><rect x="0" y="0" width="326" height="440" /></clipPath>
        <clipPath id="magnee-rr"><rect x="326" y="0" width="154" height="440" /></clipPath>
      </defs>

      <use href="#magnee-lU" fill="#2563EB" clipPath="url(#magnee-ll)" />
      <use href="#magnee-lU" fill="#EF4444" clipPath="url(#magnee-lr)" />
      <use href="#magnee-rU" fill="#EF4444" clipPath="url(#magnee-rl)" />
      <use href="#magnee-rU" fill="#2563EB" clipPath="url(#magnee-rr)" />

      <rect x="34" y="380" width="68" height="48" fill="#94A3B8" />
      <rect x="206" y="380" width="68" height="48" fill="#94A3B8" />
      <rect x="378" y="380" width="68" height="48" fill="#94A3B8" />
    </svg>
  )
}
