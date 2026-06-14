/** Set de iconos portado de /reference/trackapp-mockup.html (line-icons 24x24). */

export const ICON_PATHS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.6 1.6 0 0 0-2.7.7A1.6 1.6 0 0 0 12 22a2 2 0 0 1-4 0 1.6 1.6 0 0 0-2.7-.6 2 2 0 1 1-2.8-2.8A1.6 1.6 0 0 0 2 12a2 2 0 0 1 0-4 1.6 1.6 0 0 0 .6-2.7 2 2 0 1 1 2.8-2.8A1.6 1.6 0 0 0 8 2a2 2 0 0 1 4 0 1.6 1.6 0 0 0 2.7.6 2 2 0 1 1 2.8 2.8A1.6 1.6 0 0 0 22 8a2 2 0 0 1 0 4 1.6 1.6 0 0 0-1.6 1z"/>',
  truck:
    '<path d="M1 16V7h13v9M14 9h4l3 4v3h-7M1 16h13M3 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
  euro: '<path d="M18 7a6 6 0 1 0 0 10M5 10h7M5 14h7"/>',
  chart: '<path d="M3 3v18h18M8 16V9M13 16V5M18 16v-4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
