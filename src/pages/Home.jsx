import { Link } from "react-router-dom";
import TemporalFlowMap    from "../components/TemporalFlowMap";
import TravelSurvivalAnim from "../components/TravelSurvivalAnim";
import BodyComorbidity    from "../components/BodyComorbidity";
import styles from "./Home.module.css";

export default function Home() {
  return (
    <div className={styles.page}>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <p className={styles.heroKicker}>Synthea™ Synthetic Data · Massachusetts · 2020</p>
        <h1>Where you live<br />determines whether<br />you survive.</h1>
        <div className={styles.heroMeta}>
          <span>9,106 COVID patients</span>
          <span>Jan 20 – Mar 30, 2020</span>
          <span>Wave 1</span>
          <span>All 14 Massachusetts counties</span>
        </div>
        <p className={styles.heroLead}>
          During the first wave of COVID-19, survival was not simply a matter of biology.
          It was a matter of miles. The further a patient lived from the care they needed,
          the worse their odds — and the sicker they already were before the pandemic began.
          This is the story of how geography became a diagnosis.
        </p>
        <div className={styles.scrollCue}>
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
            <path d="M6 0v12M1 7l5 7 5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Scroll to begin
        </div>
      </section>

      {/* ── Viz 01 intro ───────────────────────────────────────────────── */}
      <div className={styles.storyIntro}>
        <p className={styles.storyNum}>Part 1 of 3</p>
        <h2>The care network<br />was never equal.</h2>
        <p>
          Each curved line below represents one patient visit — drawn in the moment it
          occurred, arcing from a patient's home to their care provider. Short lines mean
          nearby care. Long lines mean a patient had to travel.
        </p>
        <p>
          Watch the network build from the first confirmed case through the peak of Wave 1.
          Then, after the timeline ends, the view separates by care type — revealing a
          pattern that was present long before COVID arrived: <strong>routine care reached
          nearly everyone, but intensive care was concentrated in a narrow corridor,
          leaving much of the state exposed.</strong>
        </p>
        <p className={styles.storyScrollHint}>
          <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
            <path d="M5 0v9M1 5.5l4 6 4-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Scroll slowly — each line is a real trip
        </p>
      </div>

      <TemporalFlowMap />

      {/* ── Viz 02 intro ───────────────────────────────────────────────── */}
      <div className={styles.storyIntro}>
        <p className={styles.storyNum}>Part 2 of 3</p>
        <h2>Distance to care<br />was distance from survival.</h2>
        <p>
          The map showed the geography. Now we measure its human cost.
          Among patients who required emergency care during the pandemic,
          those who lived closer to that care were more likely to survive.
          Those who had to travel farther were not.
        </p>
        <p>
          The relationship is direct and consistent across every distance bracket —
          and it does not disappear when you account for insurance. <strong>Public,
          private, and uninsured patients all followed the same pattern.</strong>{" "}
          No coverage type could overcome the disadvantage of living far from care.
        </p>
        <p className={styles.storyScrollHint}>
          <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
            <path d="M5 0v9M1 5.5l4 6 4-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Scroll to break down by insurance type
        </p>
      </div>

      <TravelSurvivalAnim />

      {/* ── Viz 03 intro ───────────────────────────────────────────────── */}
      <div className={styles.storyIntro}>
        <p className={styles.storyNum}>Part 3 of 3</p>
        <h2>The damage begins<br />long before the crisis.</h2>
        <p>
          The distance penalty is not only acute. Patients who traveled farther for
          care during the pandemic were <strong>already carrying heavier disease
          burdens before COVID arrived</strong> — more metabolic conditions, more
          respiratory disease, more renal failure.
        </p>
        <p>
          This is the chronic cost of living in a care desert. Without nearby providers,
          conditions go undetected and unmanaged for years. By the time COVID struck,
          long-distance patients had less physiological reserve to survive it —
          a compounding of geographic and medical disadvantage measured in percentage
          points across every organ system.
        </p>
        <p>
          Scroll to split the figure: <strong>close-distance patients on the left,
          far-distance patients on the right.</strong> The difference in brightness
          is the difference that distance makes — not just during a pandemic,
          but across a lifetime.
        </p>
        <p className={styles.storyScrollHint}>
          <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
            <path d="M5 0v9M1 5.5l4 6 4-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Scroll to compare near vs. far
        </p>
      </div>

      <BodyComorbidity />

      {/* ── Footer CTA ─────────────────────────────────────────────────── */}
      <section className={styles.footerCta}>
        <p className={styles.footerKicker}>The data behind the story</p>
        <h2 className={styles.footerTitle}>Explore every chart,<br />every variable.</h2>
        <p className={styles.footerLead}>
          Demographics, condition timelines, encounter breakdowns, medication trends,
          payer comparisons, age distributions — all drawn from the same 9,106
          synthetic patients. The patterns above hold at every level of detail.
        </p>
        <Link to="/explore" className={styles.footerBtn}>
          Explore the Data →
        </Link>
        <p className={styles.footerNote}>
          Synthea™ synthetic patient data · Princeton COS 480
        </p>
      </section>

    </div>
  );
}
