export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>
          &copy; {year} SanLikas. Hazard-aware evacuation for Metro Manila.
        </span>
        <nav className="footer-links" aria-label="Footer">
          <a href="https://www.pagasa.dost.gov.ph" target="_blank" rel="noreferrer">
            PAGASA
          </a>
          <a href="https://ndrrmc.gov.ph" target="_blank" rel="noreferrer">
            NDRRMC
          </a>
          <a href="https://mmda.gov.ph" target="_blank" rel="noreferrer">
            MMDA
          </a>
        </nav>
      </div>
    </footer>
  );
}
