import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import type { VaultFile } from "../../lib/types";
import { buildGraph, NODE_COLORS, type GraphNode } from "../../lib/vault/graph";

interface Props {
  files: VaultFile[];
  onSelectFile: (file: VaultFile) => void;
}

// D3 simulation node (extends GraphNode with x/y/fx/fy)
interface SimNode extends GraphNode, d3.SimulationNodeDatum {}
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  weight: number;
}

export default function VaultGraph({ files, onSelectFile }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimEdge> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    node: GraphNode;
  } | null>(null);

  // File lookup for click navigation
  const fileMap = useRef(new Map<string, VaultFile>());
  useEffect(() => {
    fileMap.current.clear();
    for (const f of files) fileMap.current.set(f.path, f);
  }, [files]);

  const renderGraph = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container || files.length === 0) return;

    const { width, height } = container.getBoundingClientRect();
    const graph = buildGraph(files);

    // Clear previous
    d3.select(svg).selectAll("*").remove();
    simulationRef.current?.stop();

    // Prepare simulation data
    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const edges: SimEdge[] = graph.edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!,
        weight: e.weight,
      }));

    // Node radius: scale by character count (min 6, max 28)
    const sizeExtent = d3.extent(nodes, (n) => n.size) as [number, number];
    const radiusScale = d3
      .scaleSqrt()
      .domain(sizeExtent[0] === sizeExtent[1] ? [0, sizeExtent[1]] : sizeExtent)
      .range([6, 28]);

    // Edge width scale
    const maxWeight = Math.max(1, ...edges.map((e) => e.weight));
    const edgeWidthScale = d3.scaleLinear().domain([1, maxWeight]).range([1, 4]);

    // SVG setup with zoom
    const svgSel = d3
      .select(svg)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height]);

    // Defs for glow filter
    const defs = svgSel.append("defs");
    const filter = defs.append("filter").attr("id", "glow");
    filter
      .append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const g = svgSel.append("g");

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svgSel.call(zoom);

    // Center initial view
    svgSel.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2));

    // Draw edges
    const edgeGroup = g
      .append("g")
      .attr("class", "edges")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", "#78716c")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-width", (d) => edgeWidthScale(d.weight));

    // Draw nodes
    const nodeGroup = g
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .style("opacity", 0)
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on("start", (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d) => {
            if (!event.active) simulation.alphaTarget(0.002);
            d.fx = null;
            d.fy = null;
          })
      );

    // Fade in nodes
    nodeGroup
      .transition()
      .duration(800)
      .delay((_, i) => i * 30)
      .style("opacity", 1);

    // Circle
    nodeGroup
      .append("circle")
      .attr("r", (d) => radiusScale(d.size))
      .attr("fill", (d) => NODE_COLORS[d.type])
      .attr("fill-opacity", 0.85)
      .attr("stroke", (d) => NODE_COLORS[d.type])
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.4)
      .attr("filter", "url(#glow)");

    // Labels (only for nodes above median size)
    const medianSize = d3.median(nodes, (n) => n.size) ?? 0;
    nodeGroup
      .filter((d) => d.size >= medianSize || nodes.length <= 15)
      .append("text")
      .text((d) => d.name)
      .attr("dy", (d) => radiusScale(d.size) + 14)
      .attr("text-anchor", "middle")
      .attr("fill", "#e7e5e4")
      .attr("font-size", "10px")
      .attr("font-weight", "500")
      .attr("pointer-events", "none")
      .style("text-shadow", "0 1px 3px rgba(0,0,0,0.8)");

    // Hover & click
    nodeGroup
      .on("mouseenter", function (event, d) {
        d3.select(this)
          .select("circle")
          .transition()
          .duration(200)
          .attr("fill-opacity", 1)
          .attr("stroke-width", 3)
          .attr("stroke-opacity", 0.8);

        // Highlight connected edges
        edgeGroup
          .attr("stroke-opacity", (e: SimEdge) =>
            (e.source as SimNode).id === d.id || (e.target as SimNode).id === d.id
              ? 0.8
              : 0.1
          )
          .attr("stroke", (e: SimEdge) =>
            (e.source as SimNode).id === d.id || (e.target as SimNode).id === d.id
              ? NODE_COLORS[d.type]
              : "#78716c"
          );

        const rect = container!.getBoundingClientRect();
        const svgPoint = svg!.createSVGPoint();
        svgPoint.x = event.clientX;
        svgPoint.y = event.clientY;
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          node: d,
        });
      })
      .on("mouseleave", function () {
        d3.select(this)
          .select("circle")
          .transition()
          .duration(200)
          .attr("fill-opacity", 0.85)
          .attr("stroke-width", 2)
          .attr("stroke-opacity", 0.4);

        edgeGroup
          .attr("stroke-opacity", 0.3)
          .attr("stroke", "#78716c");

        setTooltip(null);
      })
      .on("click", (_, d) => {
        const file = fileMap.current.get(d.id);
        if (file) onSelectFile(file);
      });

    // Force simulation
    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimEdge>(edges)
          .id((d) => d.id)
          .distance(80)
          .strength((d) => 0.3 + d.weight * 0.1)
      )
      .force("charge", d3.forceManyBody().strength(-120).distanceMax(400))
      .force("center", d3.forceCenter(0, 0).strength(0.05))
      .force("collision", d3.forceCollide<SimNode>().radius((d) => radiusScale(d.size) + 8))
      .force("x", d3.forceX(0).strength(0.02))
      .force("y", d3.forceY(0).strength(0.02))
      .alphaDecay(0.02)
      .alphaMin(0.001)
      .velocityDecay(0.4)
      .on("tick", () => {
        edgeGroup
          .attr("x1", (d) => (d.source as SimNode).x!)
          .attr("y1", (d) => (d.source as SimNode).y!)
          .attr("x2", (d) => (d.target as SimNode).x!)
          .attr("y2", (d) => (d.target as SimNode).y!);

        nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    // Gentle breathing — keep simulation alive at very low alpha
    simulation.on("end", () => {
      simulation.alphaTarget(0.002).restart();
    });

    simulationRef.current = simulation;
  }, [files, onSelectFile]);

  useEffect(() => {
    renderGraph();
    const handleResize = () => renderGraph();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      simulationRef.current?.stop();
    };
  }, [renderGraph]);

  // Search highlight
  useEffect(() => {
    if (!svgRef.current) return;
    const query = searchQuery.toLowerCase().trim();

    d3.select(svgRef.current)
      .selectAll<SVGGElement, SimNode>(".nodes g")
      .transition()
      .duration(300)
      .style("opacity", (d) =>
        !query || d.name.toLowerCase().includes(query) || d.id.toLowerCase().includes(query)
          ? 1
          : 0.15
      )
      .select("circle")
      .attr("stroke-width", (d) =>
        query && (d.name.toLowerCase().includes(query) || d.id.toLowerCase().includes(query))
          ? 4
          : 2
      );
  }, [searchQuery]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-anchor-bg overflow-hidden">
      {/* Search bar */}
      <div className="absolute top-3 left-3 z-10">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search nodes..."
          className="bg-anchor-surface/90 backdrop-blur border border-anchor-border rounded-lg px-3 py-1.5 text-sm text-anchor-text placeholder-anchor-muted focus:outline-none focus:border-anchor-accent w-48"
        />
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-anchor-surface/80 backdrop-blur border border-anchor-border rounded-lg px-3 py-2 text-xs space-y-1">
        {(Object.entries(NODE_COLORS) as [GraphNode["type"], string][]).map(([type, color]) => (
          <div key={type} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: color }}
            />
            <span className="text-anchor-muted capitalize">{type}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none bg-anchor-surface border border-anchor-border rounded-lg shadow-xl px-3 py-2 max-w-xs"
          style={{
            left: tooltip.x + 16,
            top: tooltip.y - 8,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: NODE_COLORS[tooltip.node.type] }}
            />
            <span className="text-sm font-medium text-anchor-text">{tooltip.node.name}</span>
            <span className="text-xs text-anchor-muted capitalize">({tooltip.node.type})</span>
          </div>
          <p className="text-xs text-anchor-muted leading-relaxed">
            {tooltip.node.content.slice(0, 120).trim()}
            {tooltip.node.content.length > 120 ? "…" : ""}
          </p>
        </div>
      )}

      {/* SVG canvas */}
      <svg ref={svgRef} className="w-full h-full" />

      {/* Empty state */}
      {files.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-anchor-muted">
          No files in vault yet
        </div>
      )}
    </div>
  );
}
