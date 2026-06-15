/** SanLikas wordmark with a shield-pin glyph. No emoji. */
export function Brand({ href = '/' }: { href?: string }) {
  return (
    <a className="brand" href={href} aria-label="SanLikas home">
      <svg className="brand-mark" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path
          d="M14 2.5 4.5 6.2v6.9c0 5.6 3.9 10.8 9.5 12.4 5.6-1.6 9.5-6.8 9.5-12.4V6.2L14 2.5Z"
          fill="#1C8C5A"
        />
        <path
          d="M14 8.5c-2.2 0-4 1.8-4 4 0 3 4 6.5 4 6.5s4-3.5 4-6.5c0-2.2-1.8-4-4-4Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
          fill="#fff"
        />
      </svg>
      SanLikas
    </a>
  );
}
