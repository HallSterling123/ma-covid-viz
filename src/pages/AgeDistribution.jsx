import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Card from "../components/Card";
import Loader from "../components/Loader";
import styles from "./Page.module.css";

function GroupedBar({ data }) {
  const ref = useRef();

  useEffect(() => {
    if (!data?.length) return;
    const el = ref.current;
    const W  = el.clientWidth || 700;
    const H  = 340;
    const margin = { top: 30, right: 30, bottom: 50, left: 50 };
    const w  = W - margin.left - margin.right;
    const h  = H - margin.top - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const labels  = data.map((d) => d.label);
    const groups  = ["covid", "non_covid"];
    const groupLabels = { covid: "COVID-19", non_covid: "No COVID" };
    const colors  = { covid: "var(--covid)", non_covid: "var(--non-covid)" };

    const x0 = d3.scaleBand().domain(labels).range([0, w]).paddingInner(0.2);
    const x1 = d3.scaleBand().domain(groups).range([0, x0.bandwidth()]).padding(0.05);
    const y  = d3.scaleLinear()
      .domain([0, d3.max(data, (d) => Math.max(d.covid, d.non_covid)) * 1.12])
      .nice().range([h, 0]);

    // gridlines
    g.append("g")
      .call(d3.axisLeft(y).tickSize(-w).tickFormat(""))
      .selectAll("line").attr("stroke", "rgba(255,255,255,0.05)");
    g.select(".grid")?.remove();

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

    const ageGroups = g.selectAll(".age-group")
      .data(data)
      .join("g")
      .attr("class", "age-group")
      .attr("transform", (d) => `translate(${x0(d.label)},0)`);

    ageGroups.selectAll("rect")
      .data((d) => groups.map((k) => ({ key: k, value: d[k], label: d.label })))
      .join("rect")
      .attr("x", (d) => x1(d.key))
      .attr("width", x1.bandwidth())
      .attr("y", h)
      .attr("height", 0)
      .attr("fill", (d) => colors[d.key])
      .attr("rx", 2)
      .attr("opacity", 0.85)
      .on("mouseover", (event, d) => {
        tooltip.style("opacity", 1).html(
          `<strong>Age ${d.label}</strong><br/>${groupLabels[d.key]}: ${d.value.toLocaleString()}`
        );
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 28}px`);
      })
      .on("mouseout", () => tooltip.style("opacity", 0))
      .transition().duration(500).ease(d3.easeCubicOut)
      .attr("y", (d) => y(d.value))
      .attr("height", (d) => h - y(d.value));

    // axes
    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x0))
      .selectAll("text")
      .attr("fill", "var(--muted)")
      .attr("font-size", 11);

    g.append("g")
      .call(d3.axisLeft(y).ticks(6))
      .selectAll("text")
      .attr("fill", "var(--muted)")
      .attr("font-size", 11);

    g.selectAll(".domain, .tick line").attr("stroke", "var(--border)");

    // legend
    const legend = svg.append("g").attr("transform", `translate(${margin.left},8)`);
    groups.forEach((k, i) => {
      const lg = legend.append("g").attr("transform", `translate(${i * 110},0)`);
      lg.append("rect").attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", colors[k]);
      lg.append("text").attr("x", 14).attr("y", 9).attr("fill", "var(--muted)").attr("font-size", 11).text(groupLabels[k]);
    });
  }, [data]);

  return <div ref={ref} style={{ position: "relative", width: "100%" }} />;
}

export default function AgeDistribution() {
  const { data, loading, error } = useData("/data/age_distribution.json");

  if (loading || error) return <Loader error={error} />;

  const covidTotal    = data?.reduce((s, d) => s + d.covid, 0) ?? 0;
  const nonCovidTotal = data?.reduce((s, d) => s + d.non_covid, 0) ?? 0;
  const peakAge = data?.reduce((a, b) => a.covid > b.covid ? a : b)?.label ?? "—";

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Age Distribution</h1>
      <p className={styles.pageDesc}>
        Comparison of COVID-19 and non-COVID patient counts by decade of age at the time of the
        pandemic (March 2020). Older patients show higher COVID representation.
      </p>

      <Card title="Patients by Age Group" subtitle="COVID-19 vs. non-COVID patients">
        {data ? <GroupedBar data={data} /> : null}
      </Card>

      <div className={styles.insightRow}>
        {[
          { label: "COVID Patients",      value: covidTotal.toLocaleString(),    color: "var(--covid)" },
          { label: "Non-COVID Patients",  value: nonCovidTotal.toLocaleString(), color: "var(--non-covid)" },
          { label: "Peak COVID Age Group",value: peakAge,                        color: "var(--yellow)" },
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
