import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}

export function shortenHash(hash: string, chars = 6): string {
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`
}
