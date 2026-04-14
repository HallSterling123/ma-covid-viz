import styles from "./Loader.module.css";

export default function Loader({ error }) {
  if (error) return <div className={styles.error}>Error loading data: {error}</div>;
  return (
    <div className={styles.wrap}>
      <div className={styles.spinner} />
      <span>Loading data…</span>
    </div>
  );
}
