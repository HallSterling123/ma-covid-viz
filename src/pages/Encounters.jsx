import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Card from "../components/Card";
import Loader from "../components/Loader";
import styles from "./Page.module.css";

const CLASS_COLORS = {
  wellness:    "#3fb950",
  ambulatory:  "#58a6ff",
  outpatient:  "#bc8cff",
  inpatient:   "#f78166",
  emergency:   "#e3b341",
  urgentcare:  "#ffa657",
};

function PieChart({ data }) {
  const ref = useRef();

  useEffect(() => {
    if (!data?.length) return;
    const el   = ref.current;
    const size = 300;
    const r    = size / 2 - 10;
    const inner = r * 0.5;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).append("svg").attr("width", size).attr("height", size);
    const g   = svg.append("g").attr("transform", `translate(${size / 2},${size / 2})`);

    const pie  = d3.pie().value((d) => d.count).sort((a, b) => b.count - a.count);
    const arc  = d3.arc().innerRadius(inner).outerRadius(r);
    const arcH = d3.arc().innerRadius(inner).outerRadius(r + 7);

    const total = d3.sum(data, (d) => d.count);

    const tooltip = d3.select(el)
      .append("div")
      .style("position", "absolute")
      .style("background", "var(--surface)")
      .style("border", "1px solid var(--border)")
      .style("border-radius", "6px")
      .style("padding", "6px 10px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0);

    g.selectAll("path")
      .data(pie(data))
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => CLASS_COLORS[d.data.label] ?? "#666")
      .attr("stroke", "var(--bg)")
      .attr("stroke-width", 2)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("d", arcH);
        tooltip.style("opacity", 1).html(
          `<strong>${d.data.label}</strong><br/>${d.data.count.toLocaleString()}<br/>${((d.data.count / total) * 100).toFixed(1)}%`
        );
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 28}px`);
      })
      .on("mouseout", function () {
        d3.select(this).attr("d", arc);
        tooltip.style("opacity", 0);
      });

    g.append("text").attr("text-anchor", "middle").attr("dy", "-0.25em")
      .attr("fill", "var(--text)").attr("font-size", 18).attr("font-weight", 700)
      .text(total.toLocaleString());
    g.append("text").attr("text-anchor", "middle").attr("dy", "1.1em")
      .attr("fill", "var(--muted)").attr("font-size", 11).text("total");
  }, [data]);

  return <div ref={ref} style={{ position: "relative" }} />;
}

function EncounterLegend({ data }) {
  const total = d3.sum(data, (d) => d.count);
  return (
    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
      {[...data].sort((a, b) => b.count - a.count).map((d) => (
        <li key={d.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span style={{
            width: 10, height: 10, borderRadius: 2,
            background: CLASS_COLORS[d.label] ?? "#666", flexShrink: 0
          }} />
          <span style={{ flex: 1, color: "var(--text)", textTransform: "capitalize" }}>{d.label}</span>
          <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
            {d.count.toLocaleString()}
          </span>
          <span style={{ color: "var(--muted)", width: 42, textAlign: "right", fontSize: 11 }}>
            {((d.count / total) * 100).toFixed(0)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Encounters() {
  const { data: enc, loading, error } = useData("/data/encounter_classes.json");

  if (loading || error) return <Loader error={error} />;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Encounter Class Breakdown</h1>
      <p className={styles.pageDesc}>
        321,528 patient encounters classified by care setting. Wellness visits dominate,
        followed by ambulatory and outpatient encounters. Emergency and inpatient encounters
        reflect more acute COVID presentations.
      </p>

      <Card title="Encounter Types" subtitle="All encounters by class">
        <div style={{ display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap" }}>
          <PieChart data={enc} />
          <EncounterLegend data={enc} />
        </div>
      </Card>
    </div>
  );
}
