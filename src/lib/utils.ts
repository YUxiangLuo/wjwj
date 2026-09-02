import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const mergeClasses = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["control", "surface", "overlay", "circle", "toggle"],
      shadow: ["floating"],
      text: ["display", "page-title", "section-title", "subheading", "body", "label", "meta"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return mergeClasses(clsx(inputs));
}
