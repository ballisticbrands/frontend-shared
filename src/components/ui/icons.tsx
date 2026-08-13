import * as React from "react";

// Inline icon set for the nav and the shared pages.
//
// Hand-rolled rather than pulled from an icon package: the whole set is
// eight glyphs, and a dependency here would land in every brand app's
// bundle plus its Tailwind content globs. All are 16×16, 1.5px stroke,
// currentColor — so a nav row's active/inactive colour drives them.

type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 13.5h12" />
    <path d="M4 13.5V8M8 13.5V3.5M12 13.5v-4" />
  </Icon>
);

export const PlugIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 2v3.5M10 2v3.5" />
    <path d="M4 5.5h8v2a4 4 0 0 1-4 4 4 4 0 0 1-4-4v-2Z" />
    <path d="M8 11.5V14" />
  </Icon>
);

export const DatabaseIcon = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="8" cy="4" rx="5.5" ry="2.2" />
    <path d="M2.5 4v8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V4" />
    <path d="M2.5 8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2" />
  </Icon>
);

export const KeyIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5" cy="8" r="2.75" />
    <path d="M7.75 8H14M11.5 8v2.25M13.5 8v1.5" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.25" />
    <path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.4 3.6l-1.05 1.05M4.65 11.35 3.6 12.4M12.4 12.4l-1.05-1.05M4.65 4.65 3.6 3.6" />
  </Icon>
);

export const LifebuoyIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <circle cx="8" cy="8" r="2.5" />
    <path d="M3.6 3.6 6.2 6.2M9.8 9.8l2.6 2.6M12.4 3.6 9.8 6.2M6.2 9.8 3.6 12.4" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </Icon>
);

export const SparkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.75 9.4 6.1l4.35 1.4-4.35 1.4L8 13.25 6.6 8.9 2.25 7.5 6.6 6.1 8 1.75Z" />
  </Icon>
);

export const ExternalLinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 2.5H13.5V6.5" />
    <path d="M13.5 2.5 7.5 8.5" />
    <path d="M12 9.75v3a.75.75 0 0 1-.75.75h-8a.75.75 0 0 1-.75-.75v-8a.75.75 0 0 1 .75-.75h3" />
  </Icon>
);
