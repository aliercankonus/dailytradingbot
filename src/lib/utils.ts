import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
