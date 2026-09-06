export type PlatformGlyphPlatform = "windows" | "android";

export function PlatformGlyph({
  platform,
  size = 36
}: {
  platform: PlatformGlyphPlatform;
  size?: number;
}) {
  if (platform === "windows") {
    return (
      <svg aria-hidden="true" className="platform-glyph" height={size} viewBox="0 0 48 48" width={size}>
        <rect height="27" rx="5" width="38" x="5" y="7" />
        <path d="M16 41h16M24 34v7M11 27l7-7 6 4 8-10 5 5" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="platform-glyph" height={size} viewBox="0 0 48 48" width={size}>
      <rect height="38" rx="8" width="24" x="12" y="5" />
      <path d="M19 10h10M20 37h8M17 27l4-5 4 3 6-9" />
    </svg>
  );
}
