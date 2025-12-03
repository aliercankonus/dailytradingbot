import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a price value with consistent decimal places
 * @param value - The price value to format
 * @param decimals - Number of decimal places (default: 4)
 * @param prefix - Optional prefix like '$' (default: '')
 */
export function formatPrice(
  value: number | null | undefined,
  decimals: number = 4,
  prefix: string = ''
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return `${prefix}${value.toFixed(decimals)}`;
}

/**
 * Format a percentage value with consistent decimal places
 * @param value - The percentage value to format
 * @param decimals - Number of decimal places (default: 2)
 * @param showSign - Whether to show + for positive values (default: false)
 */
export function formatPercent(
  value: number | null | undefined,
  decimals: number = 2,
  showSign: boolean = false
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format a quantity value with appropriate decimal places
 * @param value - The quantity value to format
 * @param decimals - Number of decimal places (default: 6)
 */
export function formatQuantity(
  value: number | null | undefined,
  decimals: number = 6
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return value.toFixed(decimals);
}

export type SignalPriority = 'High' | 'Medium' | 'Low';

export function getSignalPriorityTier(confidenceScore: number | null | undefined): SignalPriority {
  if (!confidenceScore) return 'Low';
  
  if (confidenceScore > 80) return 'High';
  if (confidenceScore >= 50) return 'Medium';
  return 'Low';
}

export function getSignalPriorityVariant(priority: SignalPriority): "default" | "secondary" | "destructive" | "outline" {
  switch (priority) {
    case 'High':
      return 'default';
    case 'Medium':
      return 'secondary';
    case 'Low':
      return 'outline';
  }
}
