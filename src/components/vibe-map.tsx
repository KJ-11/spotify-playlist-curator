"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import type { Cluster, ClassifiedTrack } from "@/lib/types";

const CLUSTER_COLORS = [
  "#3987e5", "#d95926", "#1baf7a", "#c98500", "#d55181",
  "#008300", "#9085e9", "#e66767", "#5DCAA5", "#F0997B",
  "#AFA9EC", "#ED93B1",
];

interface MapNode {
  track: ClassifiedTrack;
  x: number;
  y: number;
  clusterId: string;
  clusterIndex: number;
}

export function VibeMap({
  clusters,
  onMoveTrack,
}: {
  clusters: Cluster[];
  onMoveTrack: (trackId: string, fromClusterId: string, toClusterId: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusedCluster, setFocusedCluster] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    track: ClassifiedTrack;
    x: number;
    y: number;
  } | null>(null);

  const allNodes: MapNode[] = useMemo(
    () =>
      clusters.flatMap((cluster, ci) =>
        cluster.tracks.map((track) => ({
          track,
          x: track.position2d.x,
          y: track.position2d.y,
          clusterId: cluster.id,
          clusterIndex: ci,
        }))
      ),
    [clusters]
  );

  useEffect(() => {
    if (!svgRef.current || allNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll("*").remove();

    const xs = allNodes.map((n) => n.x);
    const ys = allNodes.map((n) => n.y);
    const xScale = d3
      .scaleLinear()
      .domain([Math.min(...xs) - 1, Math.max(...xs) + 1])
      .range([60, width - 60]);
    const yScale = d3
      .scaleLinear()
      .domain([Math.min(...ys) - 1, Math.max(...ys) + 1])
      .range([60, height - 60]);

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 8])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity);

    const visibleNodes = focusedCluster
      ? allNodes.filter((n) => n.clusterId === focusedCluster)
      : allNodes;

    g.selectAll("circle")
      .data(visibleNodes)
      .join("circle")
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("r", focusedCluster ? 8 : 4)
      .attr("fill", (d) => CLUSTER_COLORS[d.clusterIndex % CLUSTER_COLORS.length])
      .attr("opacity", 0.8)
      .style("cursor", "pointer")
      .style("filter", (d) => {
        const energy = d.track.vibeVector.energy;
        return `drop-shadow(0 0 ${Math.round(energy * 6)}px ${CLUSTER_COLORS[d.clusterIndex % CLUSTER_COLORS.length]}40)`;
      })
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("r", focusedCluster ? 12 : 6).attr("opacity", 1);
        setTooltip({
          track: d.track,
          x: event.offsetX,
          y: event.offsetY,
        });
      })
      .on("mouseleave", function () {
        d3.select(this).attr("r", focusedCluster ? 8 : 4).attr("opacity", 0.8);
        setTooltip(null);
      })
      .on("click", function (_, d) {
        if (!focusedCluster) {
          setFocusedCluster(d.clusterId);
        }
      });

    if (!focusedCluster) {
      const clusterCentroids = clusters.map((cluster, ci) => {
        const cTracks = allNodes.filter((n) => n.clusterId === cluster.id);
        const cx = d3.mean(cTracks, (t) => xScale(t.x)) ?? 0;
        const cy = d3.mean(cTracks, (t) => yScale(t.y)) ?? 0;
        return { cluster, cx, cy, ci };
      });

      g.selectAll("text.cluster-label")
        .data(clusterCentroids)
        .join("text")
        .attr("class", "cluster-label")
        .attr("x", (d) => d.cx)
        .attr("y", (d) => d.cy - 20)
        .attr("text-anchor", "middle")
        .attr("fill", (d) => CLUSTER_COLORS[d.ci % CLUSTER_COLORS.length])
        .attr("font-size", "13px")
        .attr("font-weight", "500")
        .attr("opacity", 0.9)
        .text((d) => d.cluster.name)
        .style("cursor", "pointer")
        .on("click", (_, d) => setFocusedCluster(d.cluster.id));
    }
  }, [allNodes, focusedCluster, clusters]);

  return (
    <div className="relative w-full rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden"
      style={{ height: "70vh" }}>
      {focusedCluster && (
        <button
          onClick={() => setFocusedCluster(null)}
          className="absolute top-4 left-4 z-10 px-3 py-1 text-sm rounded-lg
            bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition"
        >
          ← All clusters
        </button>
      )}
      <svg ref={svgRef} className="w-full h-full" />
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-zinc-800 border border-zinc-700
            rounded-lg px-3 py-2 text-sm shadow-xl z-20"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="font-medium">{tooltip.track.track.name}</p>
          <p className="text-zinc-400 text-xs">
            {tooltip.track.track.artists.map((a) => a.name).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
