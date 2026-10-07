import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Natural, human-friendly relative time. Kept intentionally short — Aurora's
 * timestamps should feel like a diary, not a log line.
 */
export function timeAgo(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const diff = Math.round((Date.now() - d.getTime()) / 1000);
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

