import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

export interface GraphNode {
  id: string;
  label: string;
  price: number;
  status: 'arb' | 'normal' | 'illiquid';
  volume: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'IMPLIES' | 'EXCLUSIVE' | 'PARTITION';
  label?: string;
  confidence: number;
  isArb?: boolean;
}

interface ForceGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
  animated?: boolean;
}

export const DEFAULT_NODES: GraphNode[] = [
  { id: '1', label: 'Fed Cut June 2026', price: 0.60, status: 'arb', volume: 450000 },
  { id: '2', label: 'Fed Cut 2026', price: 0.55, status: 'arb', volume: 500000 },
  { id: '3', label: 'Fed Cut Q1', price: 0.22, status: 'normal', volume: 120000 },
  { id: '4', label: 'Fed Cut Q2', price: 0.31, status: 'normal', volume: 180000 },
  { id: '5', label: 'Fed Cut Q3', price: 0.28, status: 'normal', volume: 150000 },
  { id: '6', label: 'No Rate Cut 2026', price: 0.38, status: 'normal', volume: 200000 },
  { id: '7', label: 'Rate Hike 2026', price: 0.12, status: 'illiquid', volume: 50000 },
  { id: '8', label: 'Inflation > 3%', price: 0.45, status: 'normal', volume: 280000 },
  { id: '9', label: 'BTC > $100K', price: 0.41, status: 'normal', volume: 350000 },
  { id: '10', label: 'BTC ETF Approval', price: 0.67, status: 'normal', volume: 400000 },
  { id: '11', label: 'Trump Wins Iowa', price: 0.72, status: 'normal', volume: 320000 },
  { id: '12', label: 'Trump Wins Nom.', price: 0.81, status: 'normal', volume: 380000 },
];

export const DEFAULT_EDGES: GraphEdge[] = [
  { source: '1', target: '2', type: 'IMPLIES', label: '+5.0¢', confidence: 0.98, isArb: true },
  { source: '3', target: '6', type: 'PARTITION', confidence: 0.95 },
  { source: '4', target: '6', type: 'PARTITION', confidence: 0.95 },
  { source: '5', target: '6', type: 'PARTITION', confidence: 0.95 },
  { source: '8', target: '6', type: 'IMPLIES', label: '0.7', confidence: 0.7 },
  { source: '11', target: '12', type: 'IMPLIES', confidence: 0.85 },
  { source: '10', target: '9', type: 'IMPLIES', confidence: 0.6 },
];

export default function ForceGraph({ nodes, edges, width = 700, height = 500, animated = false }: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, undefined> | null>(null);

  const getNodeColor = useCallback((status: string) => {
    switch (status) {
      case 'arb': return '#00D4AA';
      case 'illiquid': return '#FF6B6B';
      default: return '#6B7280';
    }
  }, []);

  const getEdgeStyle = useCallback((type: string) => {
    switch (type) {
      case 'IMPLIES': return '';
      case 'EXCLUSIVE': return '8,4';
      case 'PARTITION': return '2,4';
      default: return '';
    }
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    
    // Arrow marker
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 25)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', '#6B7280');

    // Glow filter
    const glow = defs.append('filter').attr('id', 'glow');
    glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    glow.append('feMerge').selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .join('feMergeNode')
      .attr('in', d => d);

    const g = svg.append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    const nodesCopy = nodes.map(d => ({ ...d }));
    const edgesCopy = edges.map(d => ({ ...d }));

    const simulation = d3.forceSimulation(nodesCopy)
      .force('link', d3.forceLink(edgesCopy).id((d: any) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    simulationRef.current = simulation;

    // Edges
    const link = g.append('g')
      .selectAll('line')
      .data(edgesCopy)
      .join('line')
      .attr('stroke', (d: any) => d.isArb ? '#00FF88' : d.type === 'IMPLIES' ? '#FBBF24' : '#4B5563')
      .attr('stroke-width', (d: any) => d.isArb ? 2 : 1)
      .attr('stroke-dasharray', (d: any) => getEdgeStyle(d.type))
      .attr('marker-end', (d: any) => d.type === 'IMPLIES' ? 'url(#arrow)' : '')
      .attr('filter', (d: any) => d.isArb ? 'url(#glow)' : '');

    // Edge labels
    const edgeLabel = g.append('g')
      .selectAll('text')
      .data(edgesCopy.filter((d: any) => d.label))
      .join('text')
      .attr('font-family', 'JetBrains Mono')
      .attr('font-size', '9px')
      .attr('fill', '#94A3B8')
      .attr('text-anchor', 'middle')
      .text((d: any) => d.label);

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodesCopy)
      .join('g')
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x; d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }) as any);

    node.append('rect')
      .attr('width', 120)
      .attr('height', 44)
      .attr('x', -60)
      .attr('y', -22)
      .attr('rx', 6)
      .attr('fill', '#16213E')
      .attr('stroke', d => getNodeColor(d.status))
      .attr('stroke-width', d => d.status === 'arb' ? 2 : 1);

    node.append('text')
      .attr('fill', '#F8FAFC')
      .attr('font-size', '10px')
      .attr('font-family', 'Inter')
      .attr('text-anchor', 'middle')
      .attr('y', -4)
      .text(d => d.label.length > 18 ? d.label.slice(0, 18) + '…' : d.label);

    node.append('text')
      .attr('fill', '#00D4AA')
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono')
      .attr('text-anchor', 'middle')
      .attr('y', 12)
      .text(d => `YES: ${d.price.toFixed(2)}`);

    // Tooltip
    node.append('title')
      .text(d => `${d.label}\nPrice: ${d.price.toFixed(2)}\nVolume: $${(d.volume/1000).toFixed(0)}K\nStatus: ${d.status}`);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      edgeLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 6);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Flash arb edges periodically
    if (animated) {
      const flashInterval = setInterval(() => {
        const arbEdges = edgesCopy.filter((d: any) => d.isArb);
        if (arbEdges.length > 0) {
          const idx = Math.floor(Math.random() * arbEdges.length);
          link.filter((_: any, i: number) => edgesCopy[i] === arbEdges[idx])
            .attr('stroke', '#00FF88')
            .attr('stroke-width', 4)
            .transition()
            .duration(800)
            .attr('stroke-width', 2);
        }
      }, 3000);
      return () => {
        clearInterval(flashInterval);
        simulation.stop();
      };
    }

    return () => { simulation.stop(); };
  }, [nodes, edges, width, height, animated, getNodeColor, getEdgeStyle]);

  return (
    <svg ref={svgRef} width={width} height={height} className="w-full h-full" viewBox={`0 0 ${width} ${height}`}>
    </svg>
  );
}
