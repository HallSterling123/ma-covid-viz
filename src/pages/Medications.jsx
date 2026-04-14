import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Card from "../components/Card";
import Loader from "../components/Loader";
import styles from "./Page.module.css";

function MedChart({ data }) {
  const ref = useRef();

  useEffect(() => {
    if (!data?.length) return;
    const items = data.slice(0, 15);
    const el = ref.current;
    const W  = el.clientWidth || 700;
    const barH = 30;
    const margin = { top: 8, right: 90, bottom: 20, left: 310 };
    const H  = items.length * barH + margin.top + margin.bottom;
    const w  = W - margin.left - margin.right;
    const h  = H - margin.top - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const colorScale = d3.scaleSequential(d3.interpolateReds).domain([0, items.length]);

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

    g.selectAll("rect")
      .data(items)
      .join("rect")
      .attr("y", (d) => y(d.label))
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", 0)
      .attr("fill", (_, i) => colorScale(items.length - i))
      .attr("rx", 3)
      .attr("opacity", 0.85)
      .on("mouseover", (event, d) => {
        tooltip.style("opacity", 1).html(`<strong>${d.label}</strong><br/>${d.count.toLocaleString()} prescriptions`);
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
      .attr("font-size", 11);

    g.selectAll(".domain, .tick line").attr("stroke", "var(--border)");
  }, [data]);

  return <div ref={ref} style={{ position: "relative", width: "100%" }} />;
}

export default function Medications() {
  const { data, loading, error } = useData("/data/covid_medications.json");

  if (loading || error) return <Loader error={error} />;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>COVID-19 Medications</h1>
      <p className={styles.pageDesc}>
        The 15 most frequently prescribed medications among patients diagnosed with COVID-19 or
        Suspected COVID-19. Acetaminophen, face masks (PPE supplies), and antivirals feature
        prominently.
      </p>

      <Card title="Top 15 Medications — COVID Patients" subtitle="Prescription frequency among COVID-19 patients">
        <MedChart data={data} />
      </Card>
    </div>
  );
}
