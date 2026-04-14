import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Card from "../components/Card";
import Loader from "../components/Loader";
import styles from "./Page.module.css";

function CoverageChart({ data }) {
  const ref = useRef();

  useEffect(() => {
    if (!data?.length) return;
    const el = ref.current;
    const W  = el.clientWidth || 700;
    const margin = { top: 10, right: 30, bottom: 30, left: 160 };
    const barH = 40;
    const H  = data.length * barH + margin.top + margin.bottom;
    const w  = W - margin.left - margin.right;
    const h  = H - margin.top - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const maxVal = d3.max(data, (d) => d.covered + d.uncovered);
    const x = d3.scaleLinear().domain([0, maxVal]).nice().range([0, w]);
    const y = d3.scaleBand().domain(data.map((d) => d.name)).range([0, h]).padding(0.3);

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

    // covered bars
    g.selectAll(".bar-covered")
      .data(data)
      .join("rect")
      .attr("class", "bar-covered")
      .attr("y", (d) => y(d.name))
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", (d) => x(d.covered))
      .attr("fill", "var(--non-covid)")
      .attr("rx", 3)
      .attr("opacity", 0.8)
      .on("mouseover", (event, d) => {
        tooltip.style("opacity", 1).html(
          `<strong>${d.name}</strong><br/>` +
          `Covered: $${(d.covered / 1e6).toFixed(1)}M<br/>` +
          `Uncovered: $${(d.uncovered / 1e6).toFixed(1)}M<br/>` +
          `Customers: ${d.customers.toLocaleString()}<br/>` +
          `Quality of Life: ${(d.qols * 100).toFixed(1)}`
        );
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 48}px`);
      })
      .on("mouseout", () => tooltip.style("opacity", 0));

    // uncovered bars (stacked)
    g.selectAll(".bar-uncovered")
      .data(data)
      .join("rect")
      .attr("class", "bar-uncovered")
      .attr("y", (d) => y(d.name))
      .attr("height", y.bandwidth())
      .attr("x", (d) => x(d.covered))
      .attr("width", (d) => x(d.uncovered))
      .attr("fill", "var(--covid)")
      .attr("rx", 0)
      .attr("opacity", 0.7)
      .on("mouseover", (event, d) => {
        tooltip.style("opacity", 1).html(
          `<strong>${d.name}</strong><br/>` +
          `Uncovered: $${(d.uncovered / 1e6).toFixed(1)}M<br/>` +
          `Covered: $${(d.covered / 1e6).toFixed(1)}M`
        );
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 48}px`);
      })
      .on("mouseout", () => tooltip.style("opacity", 0));

    g.append("g")
      .call(d3.axisLeft(y))
      .selectAll("text")
      .attr("fill", "var(--text)")
      .attr("font-size", 11.5);

    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat((d) => `$${(d / 1e6).toFixed(0)}M`))
      .selectAll("text")
      .attr("fill", "var(--muted)")
      .attr("font-size", 10);

    g.selectAll(".domain, .tick line").attr("stroke", "var(--border)");

    // legend
    const leg = svg.append("g").attr("transform", `translate(${margin.left},${H - 10})`);
    [["var(--non-covid)","Covered"],["var(--covid)","Uncovered"]].forEach(([c,l],i) => {
      const lg = leg.append("g").attr("transform", `translate(${i * 110},0)`);
      lg.append("rect").attr("width",10).attr("height",10).attr("rx",2).attr("fill",c).attr("opacity",0.8);
      lg.append("text").attr("x",14).attr("y",9).attr("fill","var(--muted)").attr("font-size",11).text(l);
    });
  }, [data]);

  return <div ref={ref} style={{ position: "relative", width: "100%" }} />;
}

function QolsChart({ data }) {
  const ref = useRef();
  useEffect(() => {
    if (!data?.length) return;
    const sorted = [...data].sort((a, b) => b.qols - a.qols);
    const el = ref.current;
    const W  = el.clientWidth || 600;
    const H  = 220;
    const margin = { top: 20, right: 20, bottom: 60, left: 160 };
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(sorted.map((d) => d.name)).range([0, w]).padding(0.3);
    const y = d3.scaleLinear().domain([0, 1]).range([h, 0]);

    g.append("line").attr("x1",0).attr("x2",w).attr("y1",y(0.5)).attr("y2",y(0.5))
      .attr("stroke","var(--border)").attr("stroke-dasharray","4,3");

    g.selectAll("rect")
      .data(sorted)
      .join("rect")
      .attr("x", (d) => x(d.name))
      .attr("width", x.bandwidth())
      .attr("y", (d) => y(d.qols))
      .attr("height", (d) => h - y(d.qols))
      .attr("fill", (d) => d3.interpolateRdYlGn(d.qols))
      .attr("rx", 3)
      .attr("opacity", 0.85);

    g.append("g").attr("transform",`translate(0,${h})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("fill","var(--muted)").attr("font-size",10)
      .attr("transform","rotate(-30)").attr("text-anchor","end");

    g.append("g").call(d3.axisLeft(y).ticks(4).tickFormat((d) => `${(d * 100).toFixed(0)}`))
      .selectAll("text").attr("fill","var(--muted)").attr("font-size",10);

    g.selectAll(".domain, .tick line").attr("stroke","var(--border)");
  }, [data]);
  return <div ref={ref} style={{ position: "relative", width: "100%" }} />;
}

export default function Payers() {
  const { data, loading, error } = useData("/data/payers.json");
  if (loading || error) return <Loader error={error} />;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Insurance Payers</h1>
      <p className={styles.pageDesc}>
        Coverage amounts, uncovered costs, and quality-of-life scores (QOLS) for each
        insurer in the dataset. Medicare and Medicaid cover the most patients.
      </p>

      <Card title="Covered vs. Uncovered Costs" subtitle="Stacked by payer — hover for details">
        <CoverageChart data={data} />
      </Card>

      <Card title="Quality of Life Score (QOLS)" subtitle="Average QOLS per payer — 0 to 100 scale">
        <QolsChart data={data} />
      </Card>
    </div>
  );
}
