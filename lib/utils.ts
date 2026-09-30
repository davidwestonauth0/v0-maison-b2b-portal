import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Avoids floating-point remainders (e.g. 111.78999999999999) in computed
// order totals — apply to any value built from multiplying/summing prices.
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}
