import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Card from "../components/Card";
import Loader from "../components/Loader";
import styles from "./Page.module.css";

function HBarChart({ data, color = "var(--accent)", maxItems = 20 }) {
  const ref = useRef();

  useEffect(() => {
    if (!data?.length) return;
    const items = data.slice(0, maxItems);
    const el = ref.current;
    const W  = el.clientWidth || 640;
    const barH = 26;
    const margin = { top: 8, right: 80, bottom: 20, left: 260 };
    const H  = items.length * barH + margin.top + margin.bottom + 4;
    const w  = W - margin.left - margin.right;
    const h  = H - margin.top - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, d3.max(items, (d) => d.count)]).nice().range([0, w]);
    const y = d3.scaleBand().domain(items.map((d) => d.label)).range([0, h]).padding(0.2);

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

    g.selectAll("rect.bg")
      .data(items)
      .join("rect")
      .attr("class", "bg")
      .attr("y", (d) => y(d.label))
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", w)
      .attr("fill", "rgba(255,255,255,0.02)")
      .attr("rx", 3);

    g.selectAll("rect.bar")
      .data(items)
      .join("rect")
      .attr("class", "bar")
      .attr("y", (d) => y(d.label))
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", 0)
      .attr("fill", color)
      .attr("rx", 3)
      .attr("opacity", 0.8)
      .on("mouseover", (event, d) => {
        tooltip.style("opacity", 1).html(`<strong>${d.label}</strong><br/>${d.count.toLocaleString()} patients`);
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 28}px`);
      })
      .on("mouseout", () => tooltip.style("opacity", 0))
      .transition().duration(600).ease(d3.easeCubicOut)
      .attr("width", (d) => x(d.count));

    g.selectAll(".count-label")
      .data(items)
      .join("text")
      .attr("class", "count-label")
      .attr("x", (d) => x(d.count) + 6)
      .attr("y", (d) => y(d.label) + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("fill", "var(--muted)")
      .attr("font-size", 11)
      .text((d) => d.count.toLocaleString());

    g.append("g")
      .call(d3.axisLeft(y))
      .selectAll("text")
      .attr("fill", "var(--text)")
      .attr("font-size", 11.5);

    g.selectAll(".domain, .tick line").attr("stroke", "var(--border)");
  }, [data, color, maxItems]);

  return <div ref={ref} style={{ position: "relative", width: "100%" }} />;
}

export default function Conditions() {
  const { data: top,     loading: l1, error: e1 } = useData("/data/top_conditions.json");
  const { data: comorbid, loading: l2, error: e2 } = useData("/data/covid_comorbidities.json");

  if (l1 || l2) return <Loader />;
  if (e1 || e2) return <Loader error={e1 || e2} />;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Conditions & Diagnoses</h1>
      <p className={styles.pageDesc}>
        Most frequent ICD diagnoses across all patients, and the top pre-existing conditions
        (comorbidities) found specifically in COVID-19 patients.
      </p>

      <Card title="Top 20 Conditions" subtitle="All patients — sorted by frequency">
        <HBarChart data={top} color="var(--accent)" maxItems={20} />
      </Card>

      <Card title="COVID-19 Comorbidities" subtitle="Pre-existing conditions in COVID patients (excluding COVID itself)">
        <HBarChart data={comorbid} color="var(--covid)" maxItems={15} />
      </Card>
    </div>
  );
}
