import { useState } from "react";
import Overview            from "./Overview";
import Timeline            from "./Timeline";
import Demographics        from "./Demographics";
import Conditions          from "./Conditions";
import Encounters          from "./Encounters";
import AgeDistribution     from "./AgeDistribution";
import Vitals              from "./Vitals";
import Medications         from "./Medications";
import Payers              from "./Payers";
import TravelSurvivability from "./TravelSurvivability";
import styles from "./ExploreData.module.css";

const TABS = [
  { id: "overview",     label: "Overview",              component: Overview },
  { id: "timeline",     label: "COVID Timeline",        component: Timeline },
  { id: "demographics", label: "Demographics",          component: Demographics },
  { id: "conditions",   label: "Conditions",            component: Conditions },
  { id: "encounters",   label: "Encounters",            component: Encounters },
  { id: "age",          label: "Age Distribution",      component: AgeDistribution },
  { id: "vitals",       label: "Vitals",                component: Vitals },
  { id: "medications",  label: "Medications",           component: Medications },
  { id: "payers",       label: "Payers",                component: Payers },
  { id: "travel",       label: "Travel & Survival",     component: TravelSurvivability },
];

export default function ExploreData() {
  const [active, setActive] = useState(TABS[0].id);
  const ActivePage = TABS.find((t) => t.id === active)?.component ?? Timeline;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>Explore the Data</h1>
        <p className={styles.desc}>
          Preliminary visualizations built from 16 Synthea CSV files (~2.9M rows) covering
          synthetic Massachusetts COVID-19 patient records.
        </p>
      </div>

      <div className={styles.tabBar}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`${styles.tab} ${active === t.id ? styles.tabActive : ""}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.panel}>
        <ActivePage />
      </div>
    </div>
  );
}
