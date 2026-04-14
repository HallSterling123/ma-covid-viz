import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Card from "../components/Card";
import Loader from "../components/Loader";
import styles from "./Page.module.css";

const RACE_COLORS  = d3.schemeTableau10;
const GENDER_COLORS = ["#58a6ff", "#f78166"];

function DonutChart({ data, colorScale, width = 260 }) {
  const ref = useRef();

  useEffect(() => {
    if (!data?.length) return;
    const el = ref.current;
    const size = Math.min(el.clientWidth || width, 280);
    const r = size / 2 - 10;
    const inner = r * 0.55;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el)
      .append("svg")
      .attr("width", size)
      .attr("height", size);

    const g = svg.append("g").attr("transform", `translate(${size / 2},${size / 2})`);

    const pie   = d3.pie().value((d) => d.count).sort(null);
    const arc   = d3.arc().innerRadius(inner).outerRadius(r);
    const arcHo = d3.arc().innerRadius(inner).outerRadius(r + 6);

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

    const total = d3.sum(data, (d) => d.count);

    const slices = g.selectAll("path")
      .data(pie(data))
      .join("path")
      .attr("d", arc)
      .attr("fill", (_, i) => colorScale[i % colorScale.length])
      .attr("stroke", "var(--bg)")
      .attr("stroke-width", 2)
      .style("cursor", "pointer");

    slices
      .on("mouseover", function (event, d) {
        d3.select(this).attr("d", arcHo);
        tooltip.style("opacity", 1).html(
          `<strong>${d.data.label}</strong><br/>${d.data.count.toLocaleString()} (${((d.data.count / total) * 100).toFixed(1)}%)`
        );
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip
          .style("left", `${event.clientX - box.left + 12}px`)
          .style("top",  `${event.clientY - box.top  - 28}px`);
      })
      .on("mouseout", function () {
        d3.select(this).attr("d", arc);
        tooltip.style("opacity", 0);
      });

    // center label
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .attr("fill", "var(--text)")
      .attr("font-size", 20)
      .attr("font-weight", 700)
      .text(total.toLocaleString());
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.2em")
      .attr("fill", "var(--muted)")
      .attr("font-size", 11)
      .text("patients");
  }, [data, colorScale]);

  return <div ref={ref} style={{ position: "relative" }} />;
}

function Legend({ data, colors }) {
  return (
    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      {data.map((d, i) => (
        <li key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{
            width: 10, height: 10, borderRadius: 2,
            background: colors[i % colors.length], flexShrink: 0
          }} />
          <span style={{ color: "var(--text)", flex: 1 }}>{d.label}</span>
          <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
            {d.count.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CountyBar({ data }) {
  const ref = useRef();
  useEffect(() => {
    if (!data?.length) return;
    const top = data.slice(0, 12);
    const el = ref.current;
    const W = el.clientWidth || 600;
    const H = top.length * 30 + 40;
    const margin = { top: 10, right: 80, bottom: 30, left: 170 };
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, d3.max(top, (d) => d.count)]).nice().range([0, w]);
    const y = d3.scaleBand().domain(top.map((d) => d.label)).range([0, h]).padding(0.25);

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
      .data(top)
      .join("rect")
      .attr("y", (d) => y(d.label))
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", (d) => x(d.count))
      .attr("fill", "var(--accent)")
      .attr("rx", 3)
      .attr("opacity", 0.85)
      .on("mouseover", (event, d) => {
        tooltip.style("opacity", 1).html(`<strong>${d.label}</strong><br/>${d.count.toLocaleString()} patients`);
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 28}px`);
      })
      .on("mouseout", () => tooltip.style("opacity", 0));

    g.selectAll(".count-label")
      .data(top)
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
      .attr("font-size", 12);

    g.selectAll(".domain, .tick line").attr("stroke", "var(--border)");
  }, [data]);

  return <div ref={ref} style={{ position: "relative", width: "100%" }} />;
}

export default function Demographics() {
  const { data, loading, error } = useData("/data/demographics.json");
  if (loading || error) return <Loader error={error} />;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Patient Demographics</h1>
      <p className={styles.pageDesc}>
        Breakdown of the 12,352 synthetic Massachusetts patients by race, gender, and county of residence.
      </p>

      <div className={styles.twoCol}>
        <Card title="Race / Ethnicity" subtitle="Patient distribution by race">
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            <DonutChart data={data.race} colorScale={RACE_COLORS} />
            <Legend data={data.race} colors={RACE_COLORS} />
          </div>
        </Card>

        <Card title="Gender" subtitle="Patient distribution by gender">
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            <DonutChart data={data.gender} colorScale={GENDER_COLORS} />
            <Legend data={data.gender} colors={GENDER_COLORS} />
          </div>
        </Card>
      </div>

      <Card title="Patients by County" subtitle="Top 12 Massachusetts counties by patient count" full>
        <CountyBar data={data.county} />
      </Card>
    </div>
  );
}
