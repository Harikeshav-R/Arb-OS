import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Navbar from '../components/Navbar';
import ForceGraph, { DEFAULT_NODES, DEFAULT_EDGES } from '../components/ForceGraph';
import { useQuery } from '@tanstack/react-query';

interface TradeRow {
  time: string;
  type: string;
  marketA: string;
  marketB: string;
  profit: string;
  status: 'FILLED' | 'SKIPPED' | 'INFO';
}

interface WsSnapshot {
  mode: string;
  cumulative_pnl: string;
  signals_executed: number;
  uptime_secs: number;
  positions: WsPosition[];
  recent_trades: WsExecutionReport[];
}

interface WsPosition {
  asset_id: string;
  side: string;
  size: string;
  entry_price: string;
  opened_at: string;
}

interface WsExecutionReport {
  strategy: string;
  success: boolean;
  pnl_usdc: string;
  legs: number;
  executed_at: string;
  fill_details: WsFillDetail[];
}

interface WsFillDetail {
  asset_id: string;
  side: string;
  size: string;
  price: string;
  filled: boolean;
}

function getTimeStr(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 8);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: graphData } = useQuery({
    queryKey: ['graph-vis'],
    queryFn: async () => {
      const res = await fetch('http://localhost:8000/graph/vis');
      if (!res.ok) throw new Error('Failed to fetch graph');
      return res.json();
    },
    refetchInterval: 5000,
  });
  const [pnl, setPnl] = useState(0);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [latency, setLatency] = useState(14);
  const [wsStatus, setWsStatus] = useState<'Connecting' | 'Live' | 'Disconnected'>('Connecting');
  const [fedJunePrice, setFedJunePrice] = useState(0.58);
  const [fedPrice, setFedPrice] = useState(0.56);
  const [paused, setPaused] = useState(false);

  // WebSocket Integration
  useEffect(() => {
    if (paused) return;

    setWsStatus('Connecting');
    const ws = new WebSocket('ws://localhost:8001/ws');

    ws.onopen = () => {
      setWsStatus('Live');
      toast.success('Connected to ArbOS Orchestrator');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'SNAPSHOT') {
          const data = payload.data as WsSnapshot;
          setPnl(parseFloat(data.cumulative_pnl));

          // Map initial trades
          const initialTrades = data.recent_trades.map((t: WsExecutionReport) => {
            const timeStr = new Date(t.executed_at).toTimeString().slice(0, 8);
            return {
              time: timeStr,
              type: t.strategy,
              marketA: t.fill_details?.[0] ? `${t.fill_details[0].side} ${t.fill_details[0].size}` : '—',
              marketB: t.fill_details?.[1] ? `${t.fill_details[1].side} ${t.fill_details[1].size}` : '—',
              profit: `+$${parseFloat(t.pnl_usdc).toFixed(2)}`,
              status: t.success ? 'FILLED' : 'SKIPPED'
            } as TradeRow;
          });
          setTrades(initialTrades);
        } else if (payload.type === 'EXECUTION_REPORT') {
          const t = payload.data as WsExecutionReport;
          const timeStr = new Date(t.executed_at).toTimeString().slice(0, 8);

          const newTrade: TradeRow = {
            time: timeStr,
            type: t.strategy,
            marketA: t.fill_details?.[0] ? `${t.fill_details[0].side} ${t.fill_details[0].size}` : '—',
            marketB: t.fill_details?.[1] ? `${t.fill_details[1].side} ${t.fill_details[1].size}` : '—',
            profit: `+$${parseFloat(t.pnl_usdc).toFixed(2)}`,
            status: t.success ? 'FILLED' : 'SKIPPED'
          };

          setTrades(prev => [newTrade, ...prev].slice(0, 50));
          if (t.success) {
            setPnl(prev => prev + parseFloat(t.pnl_usdc));
            toast.success(`Arb executed! +$${parseFloat(t.pnl_usdc).toFixed(2)}`);
          }
        }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    ws.onclose = () => {
      setWsStatus('Disconnected');
    };

    return () => {
      ws.close();
    };
  }, [paused]);

  const handleComingSoon = useCallback((label: string) => {
    toast.info(`${label} — Coming soon`, { duration: 4000 });
  }, []);

  // P&L chart data (simple)
  const [chartPoints, setChartPoints] = useState<number[]>(() => {
    const pts: number[] = [];
    let v = 30;
    for (let i = 0; i < 24; i++) {
      v += Math.random() * 2 - 0.3;
      pts.push(v);
    }
    return pts;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setChartPoints(prev => {
        const next = [...prev.slice(1), prev[prev.length - 1] + Math.random() * 1.5 - 0.2];
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const chartMax = Math.max(...chartPoints);
  const chartMin = Math.min(...chartPoints);
  const chartH = 120;
  const chartW = 400;
  const pathD = chartPoints.map((p, i) => {
    const x = (i / (chartPoints.length - 1)) * chartW;
    const y = chartH - ((p - chartMin) / (chartMax - chartMin || 1)) * (chartH - 10) - 5;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
  const areaD = pathD + ` L${chartW},${chartH} L0,${chartH} Z`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 nav-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="font-mono font-bold text-lg text-primary">ArbOS</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse-dot" />
              <span className="font-mono text-xs text-primary">LIVE</span>
            </div>
            <span className="font-mono text-sm text-primary">P&L: +${pnl.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPaused(!paused)}
              className="font-mono text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              onClick={() => navigate('/')}
              className="font-mono text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              ⏹ Stop
            </button>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex-1 pt-14 p-4 overflow-y-auto"
      >
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-[35%_65%] gap-4">
            {/* Portfolio Summary */}
            <div className="rounded-lg border border-border bg-card card-shadow p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Portfolio Summary</h3>
              <div className="space-y-1.5 font-mono text-xs">
                {[
                  ['Allocated', '$500.00'],
                  ['In Positions', '$312.40'],
                  ['Available', '$187.60'],
                  ['Total P&L', `+$${pnl.toFixed(2)}`, true],
                  ['ROI', `+${((pnl / 500) * 100).toFixed(2)}%`, true],
                  ['Trades Today', '7'],
                  ['Win Rate', '100%'],
                ].map(([label, value, isTeal]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={isTeal ? 'text-primary tabular-nums' : 'text-foreground tabular-nums'}>{value}</span>
                  </div>
                ))}
              </div>
              {/* Chart */}
              <div className="mt-4">
                <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-28">
                  <defs>
                    <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(166,100%,42%)" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="hsl(166,100%,42%)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaD} fill="url(#tealGrad)" />
                  <path d={pathD} fill="none" stroke="hsl(166,100%,42%)" strokeWidth="2" />
                </svg>
              </div>
            </div>

            {/* Live Graph */}
            <div className="rounded-lg border border-border bg-card card-shadow overflow-hidden flex flex-col items-center justify-center relative" style={{ minHeight: 400 }}>
              {graphData ? (
                <ForceGraph
                  nodes={graphData.nodes}
                  edges={graphData.edges}
                  width={700}
                  height={450}
                  animated
                />
              ) : (
                <ForceGraph
                  nodes={DEFAULT_NODES}
                  edges={DEFAULT_EDGES}
                  width={700}
                  height={450}
                  animated
                />
              )}
              {graphData && (
                <div className="absolute top-2 right-2 flex gap-2">
                  <div className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20">
                    Live Nodes: {graphData.nodes.length}
                  </div>
                  <div className="px-2 py-0.5 rounded text-[10px] font-mono bg-secondary/10 text-secondary border border-secondary/20">
                    Live Edges: {graphData.edges.length}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Trade Log */}
          <div className="rounded-lg border border-border bg-card card-shadow p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Trade Log</h3>
            <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-3">TIME</th>
                    <th className="text-left py-2 pr-3">TYPE</th>
                    <th className="text-left py-2 pr-3">MARKET A</th>
                    <th className="text-left py-2 pr-3">MARKET B</th>
                    <th className="text-left py-2 pr-3">PROFIT</th>
                    <th className="text-left py-2">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr
                      key={`${t.time}-${i}`}
                      className={`border-b border-border/50 animate-slide-down ${t.status === 'FILLED' ? 'text-foreground' :
                        t.status === 'SKIPPED' ? 'text-warning' : 'text-muted-foreground'
                        }`}
                    >
                      <td className="py-2 pr-3">{t.time}</td>
                      <td className="py-2 pr-3">{t.type}</td>
                      <td className="py-2 pr-3 max-w-[200px] truncate">{t.marketA}</td>
                      <td className="py-2 pr-3">{t.marketB}</td>
                      <td className={`py-2 pr-3 ${t.status === 'FILLED' ? 'text-primary' : ''}`}>{t.profit}</td>
                      <td className="py-2">
                        {t.status === 'FILLED' && <span className="text-primary">✓ FILLED</span>}
                        {t.status === 'SKIPPED' && <span className="text-warning">⏭ SKIPPED</span>}
                        {t.status === 'INFO' && <span className="text-muted-foreground">ℹ INFO</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Open Positions */}
            <div className="rounded-lg border border-border bg-card card-shadow p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Open Positions</h3>
              <div className="space-y-4">
                {[
                  { name: 'Fed Cut June YES (SHORT)', shares: 50, entry: 0.60, current: fedJunePrice, pair: 'Fed Cut 2026', pnl: '+$2.47' },
                  { name: 'Fed Cut 2026 YES (LONG)', shares: 50, entry: 0.55, current: fedPrice, pair: 'Fed Cut June', pnl: '+$1.83' },
                ].map(pos => (
                  <div key={pos.name} className="border border-border rounded-md p-3">
                    <p className="text-xs font-semibold text-foreground">{pos.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground mt-1">
                      {pos.shares} shares @ {pos.entry.toFixed(2)}¢
                    </p>
                    <div className="flex justify-between mt-1.5 font-mono text-[10px]">
                      <span className="text-muted-foreground">Current: <span className="text-foreground tabular-nums">{pos.current.toFixed(2)}¢</span></span>
                      <span className="text-muted-foreground">Paired: {pos.pair}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="font-mono text-xs text-primary">Guaranteed P&L: {pos.pnl}</span>
                      <button className="font-mono text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors">
                        Close Position
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* System Health */}
            <div className="rounded-lg border border-border bg-card card-shadow p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">System Health</h3>
              <div className="space-y-2 font-mono text-xs">
                {[
                  ['Engine Latency', `${latency}ms`, '⚡'],
                  ['WebSocket', wsStatus, wsStatus === 'Live' ? '🟢' : '🔴'],
                  ['Gamma API', 'OK', '🟢'],
                  ['Brain (WatsonX)', 'OK', '🟢'],
                  ['Polygon Gas', '$0.003', ''],
                  ['MATIC Balance', '8.4', ''],
                  ['Redis', 'OK', '🟢'],
                  ['PostgreSQL', 'OK', '🟢'],
                  ['Last AI Refresh', '4 minutes ago', ''],
                ].map(([label, value, icon]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground tabular-nums flex items-center gap-1.5">
                      {value} {icon && <span className="text-[10px]">{icon}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 pb-4">
            <button
              onClick={() => navigate('/graph')}
              className="font-mono text-xs px-4 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Edit Graph
            </button>
            {['Adjust Risk', 'Add Funds', 'Export CSV'].map(label => (
              <button
                key={label}
                onClick={() => handleComingSoon(label)}
                className="font-mono text-xs px-4 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
