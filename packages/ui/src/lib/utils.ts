import { type ClassValue, clsx } from "clsx";
import { toast as sonnerToast } from "sonner";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const toast = sonnerToast;
