import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Card from "../components/Card";
import Loader from "../components/Loader";
import styles from "./Page.module.css";

const VITALS_META = {
  o2:     { label: "O₂ Saturation",          unit: "%",    domain: [85, 102] },
  temp:   { label: "Body Temperature",        unit: "°C",   domain: [35, 41]  },
  sbp:    { label: "Systolic Blood Pressure", unit: "mmHg", domain: [80, 200] },
  dbp:    { label: "Diastolic BP",            unit: "mmHg", domain: [40, 120] },
  hr:     { label: "Heart Rate",              unit: "bpm",  domain: [40, 130] },
  weight: { label: "Body Weight",             unit: "kg",   domain: [10, 150] },
};

function BoxPlotGroup({ data }) {
  const ref = useRef();

  useEffect(() => {
    if (!data) return;
    const keys = Object.keys(VITALS_META).filter((k) => data[k]);
    if (!keys.length) return;

    const el = ref.current;
    const W  = el.clientWidth || 800;
    const boxW = 20;
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const groupW = Math.max((W - margin.left - margin.right) / keys.length, 80);
    const H = 320;
    const h = H - margin.top - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const groups = ["covid", "non_covid"];
    const colors = { covid: "var(--covid)", non_covid: "var(--non-covid)" };
    const offsets= { covid: -boxW * 0.7, non_covid: boxW * 0.7 };

    const tooltip = d3.select(el)
      .append("div")
      .style("position", "absolute")
      .style("background", "var(--surface)")
      .style("border", "1px solid var(--border)")
      .style("border-radius", "6px")
      .style("padding", "8px 10px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("line-height", "1.7");

    keys.forEach((key, ki) => {
      const meta    = VITALS_META[key];
      const cx      = ki * groupW + groupW / 2;
      const yScale  = d3.scaleLinear().domain(meta.domain).nice().range([h, 0]);

      // y-axis on first key only
      if (ki === 0) {
        g.append("g")
          .call(d3.axisLeft(yScale).ticks(5))
          .selectAll("text").attr("fill", "var(--muted)").attr("font-size", 10);
        g.selectAll(".domain, .tick line").attr("stroke", "var(--border)");
      }

      // x-label
      g.append("text")
        .attr("x", cx)
        .attr("y", h + 40)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--text)")
        .attr("font-size", 11)
        .text(meta.label);

      g.append("text")
        .attr("x", cx)
        .attr("y", h + 54)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--muted)")
        .attr("font-size", 10)
        .text(meta.unit);

      // grid line
      if (ki > 0) {
        g.append("line")
          .attr("x1", cx - groupW / 2).attr("x2", cx - groupW / 2)
          .attr("y1", 0).attr("y2", h)
          .attr("stroke", "rgba(255,255,255,0.04)");
      }

      groups.forEach((grp) => {
        const s = data[key]?.[grp];
        if (!s) return;
        const x = cx + offsets[grp];

        // IQR box
        g.append("rect")
          .attr("x", x - boxW / 2)
          .attr("y", yScale(s.q3))
          .attr("width", boxW)
          .attr("height", Math.max(1, yScale(s.q1) - yScale(s.q3)))
          .attr("fill", colors[grp])
          .attr("opacity", 0.65)
          .attr("rx", 2);

        // median line
        g.append("line")
          .attr("x1", x - boxW / 2).attr("x2", x + boxW / 2)
          .attr("y1", yScale(s.median)).attr("y2", yScale(s.median))
          .attr("stroke", "#fff").attr("stroke-width", 2);

        // whiskers
        [[s.min, s.q1], [s.q3, s.max]].forEach(([a, b]) => {
          g.append("line")
            .attr("x1", x).attr("x2", x)
            .attr("y1", yScale(a)).attr("y2", yScale(b))
            .attr("stroke", colors[grp]).attr("stroke-width", 1.5).attr("opacity", 0.7);
          g.append("line")
            .attr("x1", x - 5).attr("x2", x + 5)
            .attr("y1", yScale(a)).attr("y2", yScale(a))
            .attr("stroke", colors[grp]).attr("stroke-width", 1.5).attr("opacity", 0.7);
        });

        // hover rect
        g.append("rect")
          .attr("x", x - boxW / 2 - 2).attr("width", boxW + 4)
          .attr("y", yScale(s.max) - 5)
          .attr("height", yScale(s.min) - yScale(s.max) + 10)
          .attr("fill", "transparent")
          .style("cursor", "pointer")
          .on("mouseover", (event) => {
            tooltip.style("opacity", 1).html(
              `<strong>${meta.label} — ${grp === "covid" ? "COVID-19" : "No COVID"}</strong><br/>` +
              `Median: ${s.median} ${meta.unit}<br/>` +
              `IQR: ${s.q1} – ${s.q3}<br/>` +
              `Range (5–95%): ${s.min} – ${s.max}<br/>` +
              `n = ${s.n.toLocaleString()}`
            );
          })
          .on("mousemove", (event) => {
            const box = el.getBoundingClientRect();
            tooltip.style("left", `${event.clientX - box.left + 14}px`).style("top", `${event.clientY - box.top - 40}px`);
          })
          .on("mouseout", () => tooltip.style("opacity", 0));
      });
    });

    // legend
    const leg = svg.append("g").attr("transform", `translate(${margin.left},0)`);
    [["covid","COVID-19"],["non_covid","No COVID"]].forEach(([k,lbl],i) => {
      const lg = leg.append("g").attr("transform", `translate(${i * 110},0)`);
      lg.append("rect").attr("width",10).attr("height",10).attr("rx",2).attr("fill",colors[k]).attr("opacity",0.8);
      lg.append("text").attr("x",14).attr("y",9).attr("fill","var(--muted)").attr("font-size",11).text(lbl);
    });
  }, [data]);

  return <div ref={ref} style={{ position: "relative", width: "100%" }} />;
}

export default function Vitals() {
  const { data, loading, error } = useData("/data/vitals_boxplot.json");

  if (loading || error) return <Loader error={error} />;

  const o2Covid    = data?.o2?.covid?.median ?? "—";
  const o2NoCovid  = data?.o2?.non_covid?.median ?? "—";
  const tempCovid  = data?.temp?.covid?.median ?? "—";

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Vital Signs Comparison</h1>
      <p className={styles.pageDesc}>
        Box plots (5th–95th percentile whiskers, IQR box, median line) for six key vitals comparing
        COVID-19 patients to those without COVID. O₂ saturation and body temperature show the
        most notable differences.
      </p>

      <Card title="Vitals — COVID-19 vs No COVID" subtitle="Hover over each box for detailed stats">
        {data ? <BoxPlotGroup data={data} /> : null}
      </Card>

      <div className={styles.insightRow}>
        {[
          { label: "Median O₂ — COVID",    value: `${o2Covid}%`,   color: "var(--covid)"     },
          { label: "Median O₂ — No COVID", value: `${o2NoCovid}%`, color: "var(--non-covid)" },
          { label: "Median Temp — COVID",  value: `${tempCovid}°C`,color: "var(--yellow)"    },
        ].map(({ label, value, color }) => (
          <div key={label} className={styles.insightCard}>
            <div className={styles.insightValue} style={{ color }}>{value}</div>
            <div className={styles.insightLabel}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
