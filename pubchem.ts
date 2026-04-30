import { Link, useLocation } from "wouter";
import { FlaskConical } from "lucide-react";

export function Navbar() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 glass">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center border border-primary/25 group-hover:bg-primary/25 transition-colors">
            <FlaskConical className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              CompoundScreen
            </span>
            <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
              BBB &amp; CYP2E1
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink href="/" active={location === "/"}>
            Screener
          </NavLink>
          {(location.startsWith("/results") ||
            location.startsWith("/compound") ||
            location.startsWith("/calibration") ||
            location.startsWith("/cyp2e1-calibration")) && (
            <NavLink href="/results" active={location.startsWith("/results")}>
              Results
            </NavLink>
          )}
          <NavLink
            href="/calibration"
            active={location.startsWith("/calibration")}
          >
            BBB Calibration
          </NavLink>
          <NavLink
            href="/cyp2e1-calibration"
            active={location.startsWith("/cyp2e1-calibration")}
          >
            CYP2E1 Calibration
          </NavLink>
          <NavLink href="/history" active={location === "/history"}>
            History
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
    >
      {children}
    </Link>
  );
}
