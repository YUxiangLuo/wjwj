export type AccessibleNameProps =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };

export type AccessibleLabelProps = {
  "aria-label": string;
  "aria-labelledby"?: never;
};
