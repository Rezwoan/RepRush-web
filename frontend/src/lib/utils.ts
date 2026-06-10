import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatWeight(kg: number): string {
  return `${kg.toFixed(1)}kg`;
}

/** Local-time YYYY-MM-DD key — must match the backend's local-date bucketing
 *  (never use toISOString for day keys; it's UTC and drifts near midnight). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getWorkoutTypeColor(type: string): string {
  // On-palette: blues + gold accents drawn from the RepRush logo
  const colors: Record<string, string> = {
    'Push Day': '#0a80f5',
    'Pull Day': '#3b97f5',
    'Leg Day': '#7fb2f5',
    'Upper Body': '#046cc8',
    'Lower Body': '#0462b2',
    'Full Body': '#faba0c',
    'Cardio': '#e0a009',
  };
  return colors[type] || '#64748b';
}
