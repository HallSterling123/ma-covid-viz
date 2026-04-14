import { NavLink, useLocation } from "react-router-dom";
import styles from "./Layout.module.css";

const NAV = [
  { to: "/explore", label: "Explore the Data" },
];

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const showSidebar  = pathname !== "/";

  return (
    <div className={styles.shell}>
      {showSidebar && (
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span className={styles.dot} />
            <span>MA COVID-19<br /><small>Synthea 10k</small></span>
          </div>
          <nav className={styles.nav}>
            <NavLink to="/" end className={styles.link}>
              ← Visualizations
            </NavLink>
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `${styles.link} ${isActive ? styles.active : ""}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <footer className={styles.footer}>
            Princeton · COS 480<br />Synthetic patient data
          </footer>
        </aside>
      )}
      <main className={styles.main}>{children}</main>
    </div>
  );
}
