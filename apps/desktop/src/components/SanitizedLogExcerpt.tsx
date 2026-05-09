interface SanitizedLogExcerptProps {
  excerpt?: string;
}

export function SanitizedLogExcerpt({ excerpt }: SanitizedLogExcerptProps) {
  if (excerpt === undefined || excerpt.length === 0) {
    return <span>N/A</span>;
  }

  return <pre className="code-block">{excerpt}</pre>;
}
