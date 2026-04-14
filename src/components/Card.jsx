import styles from "./Card.module.css";

export default function Card({ title, subtitle, children, full }) {
  return (
    <div className={`${styles.card} ${full ? styles.full : ""}`}>
      {(title || subtitle) && (
        <div className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
