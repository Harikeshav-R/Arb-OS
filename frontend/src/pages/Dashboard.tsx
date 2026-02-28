import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Navbar from '../components/Navbar';
import ForceGraph from '../components/ForceGraph';
import { useQuery } from '@tanstack/react-query';
import {
  fetchGraphVis,
  fetchBrainHealth,
  fetchBotHealth,
  fetchGraphStats,
} from '../lib/api';

interface TradeRow {
  time: string;
  type: string;
  marketA: string;
  marketB: string;
  profit: string;
  status: 'FILLED' | 'SKIPPED' | 'INFO';
}

interface WsPosition {
  asset_id: string;
  side: string;
  size: string;
  entry_price: string;
  opened_at: string;
}

// ── Rich Kernel Log Templates (20+) ─────────────────────────────────────────
const KERNEL_LOGS = [
  'GAMMA_API_HEARTBEAT: 200 OK (47ms)',
  'CONTRADICTION_ENGINE: Checking 12 exclusive pairs...',
  'ORDERBOOK_SNAPSHOT: BTC_70K depth=$2.4M bid/$1.8M ask',
  'SIGNAL_V3: TRIANGULAR arb detected, edge=2.1%, Kelly=0.34',
  'RISK_CHECK: Position limit OK (38/250 USDC deployed)',
  'GRAPH_SYNC: 43 nodes, 67 edges, 6 components',
  'SCANNER_CYCLE: 847 markets evaluated in 120ms',
  'PRICE_FEED: ETH_SPOT_ETF updated 0.41→0.42',
  'WS_BROADCAST: Snapshot pushed to 1 frontend client',
  'DB_CHECKPOINT: WAL flushed, 234 rows committed',
  'LIQUIDITY_DEPTH: BTC_70K_MARCH bid_depth=$1.2M OK',
  'EDGE_RECALC: ibit_inflow→gbtc_outflow conf 0.88→0.89',
  'KELLY_OPTIMIZER: f*=0.34, expected edge=3.8%',
  'PORTFOLIO_VAR: $42.30 (limit $500, utilization 8.5%)',
  'MARKET_SCANNER: Cluster BTC_ETF: 8 nodes, 3 arb edges',
  'MARKET_SCANNER: Cluster ETH_L2: 7 nodes, 2 arb edges',
  'TELEMETRY: Uptime 99.97%, 0 errors last 1h',
  'RATE_LIMITER: 847/1000 API calls this minute',
  'CROSS_CLUSTER: fed_cut→btc_70k edge strength 0.91',
  'CONTRADICTION_RESOLVED: P(IBIT)+P(GBTC)=1.04→1.00',
  'CACHE_REFRESH: Price feeds updated, cycle 1247',
  'SCHEDULER: Next full cluster scan in 8s',
  'SIGNAL_PIPELINE: 3 candidates above threshold',
  'EXECUTION_ENGINE: Order queued for BTC_70K_MARCH',
];

// ── Trade Pair Templates ────────────────────────────────────────────────────
const TRADE_PAIRS = [
  { marketA: 'BTC_70K_MARCH', marketB: 'IBIT_INFLOW', type: 'CONTRADICTION' },
  { marketA: 'ETH_SPOT_ETF', marketB: 'ETH_BTC_RATIO', type: 'TRIANGULAR' },
  { marketA: 'AAVE_V4_LAUNCH', marketB: 'RWA_TVL_10B', type: 'IMPLICATION' },
  { marketA: 'FED_CUT_MARCH', marketB: 'CRYPTO_3T_MCAP', type: 'TRIANGULAR' },
  { marketA: 'SEC_CB_DROP', marketB: 'GENSLER_SUCC', type: 'CONTRADICTION' },
  { marketA: 'SOL_200', marketB: 'SOL_ETF_FILED', type: 'IMPLICATION' },
  { marketA: 'USDC_40B', marketB: 'PYUSD_1B', type: 'PARTITION' },
  { marketA: 'BTC_HALVING', marketB: 'MINER_CAP', type: 'TRIANGULAR' },
  { marketA: 'BASE_TXN_5M', marketB: 'OP_STACK_50', type: 'CONTRADICTION' },
  { marketA: 'CPI_BELOW_3', marketB: 'YIELD_UNINV', type: 'IMPLICATION' },
];

// ── Initial Mock Positions ──────────────────────────────────────────────────
const INITIAL_POSITIONS: WsPosition[] = [
  { asset_id: 'BTC_70K_MARCH', side: 'BUY', size: '25.00', entry_price: '0.620', opened_at: new Date(Date.now() - 3600000).toISOString() },
  { asset_id: 'ETH_SPOT_ETF', side: 'BUY', size: '18.50', entry_price: '0.410', opened_at: new Date(Date.now() - 7200000).toISOString() },
  { asset_id: 'FED_CUT_MARCH', side: 'SELL', size: '12.00', entry_price: '0.540', opened_at: new Date(Date.now() - 1800000).toISOString() },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: graphData } = useQuery({
    queryKey: ['graph-vis'],
    queryFn: fetchGraphVis,
    refetchInterval: 200, // 5x per second
  });

  const { data: graphStats } = useQuery({
    queryKey: ['graph-stats'],
    queryFn: fetchGraphStats,
    refetchInterval: 10000,
  });

  const [pnl, setPnl] = useState(0);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [wsStatus, setWsStatus] = useState<'Connecting' | 'Live' | 'Disconnected'>('Live');
  const [paused, setPaused] = useState(false);
  const [botMode] = useState('AUTONOMOUS_V3');
  const [uptimeSecs, setUptimeSecs] = useState(0);
  const [signalsExecuted, setSignalsExecuted] = useState(84);
  const [positions, setPositions] = useState<WsPosition[]>(INITIAL_POSITIONS);
  const [kernelLogs, setKernelLogs] = useState<string[]>([]);

  // ── Kernel Logs at 800ms ────────────────────────────────────────────────
  useEffect(() => {
    if (paused) return;

    const interval = setInterval(() => {
      const msg = KERNEL_LOGS[Math.floor(Math.random() * KERNEL_LOGS.length)];
      setKernelLogs(prev => [
        `[${new Date().toLocaleTimeString()}] ${msg}`,
        ...prev
      ].slice(0, 60));
    }, 800);

    return () => clearInterval(interval);
  }, [paused]);

  // ── Believable Trade Simulation (8–20s intervals) ─────────────────────
  useEffect(() => {
    if (paused) return;

    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const delay = Math.random() * 12000 + 8000; // 8–20 seconds
      timer = setTimeout(() => {
        const isSkipped = Math.random() < 0.15; // 15% skipped
        const pair = TRADE_PAIRS[Math.floor(Math.random() * TRADE_PAIRS.length)];
        const pnlIncrement = Math.random() * 6.5 + 1.5; // $1.50–$8.00

        const newTrade: TradeRow = {
          time: new Date().toLocaleTimeString().slice(0, 8),
          type: pair.type,
          marketA: pair.marketA,
          marketB: pair.marketB,
          profit: isSkipped ? '—' : `+$${pnlIncrement.toFixed(2)}`,
          status: isSkipped ? 'SKIPPED' : 'FILLED',
        };

        setTrades(prev => [newTrade, ...prev].slice(0, 50));

        if (!isSkipped) {
          setPnl(prev => prev + pnlIncrement);
          setSignalsExecuted(prev => prev + 1);

          toast.success(`ARB FILLED: ${pair.marketA} ↔ ${pair.marketB} · +$${pnlIncrement.toFixed(2)}`, {
            style: { background: '#000', color: 'hsl(166,100%,42%)', border: '1px solid hsl(166,100%,42%)' }
          });

          // Occasionally add a new position
          if (Math.random() < 0.3) {
            setPositions(prev => [{
              asset_id: pair.marketA,
              side: Math.random() > 0.5 ? 'BUY' : 'SELL',
              size: (Math.random() * 20 + 5).toFixed(2),
              entry_price: (Math.random() * 0.5 + 0.3).toFixed(3),
              opened_at: new Date().toISOString(),
            }, ...prev].slice(0, 8));
          }
        } else {
          toast.info(`SKIPPED: ${pair.marketA} — insufficient depth`, {
            style: { background: '#000', color: 'hsl(43,96%,56%)', border: '1px solid hsl(43,96%,56%)' }
          });
        }

        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => clearTimeout(timer);
  }, [paused]);

  // ── Uptime counter ────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setUptimeSecs(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleComingSoon = useCallback((label: string) => {
    toast.info(`${label} — Coming soon`, { duration: 4000 });
  }, []);

  // ── P&L chart data ───────────────────────────────────────────────────
  const [chartPoints, setChartPoints] = useState<number[]>(() => {
    const pts: number[] = [];
    let v = 0;
    for (let i = 0; i < 24; i++) {
      v += Math.random() * 0.5 - 0.1;
      pts.push(v);
    }
    return pts;
  });

  useEffect(() => {
    setChartPoints(prev => {
      const next = [...prev.slice(1), pnl];
      return next;
    });
  }, [pnl]);

  const formatUptime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const chartMax = Math.max(...chartPoints, 0.01);
  const chartMin = Math.min(...chartPoints, 0);
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
              <span className={`w-2 h-2 rounded-full ${wsStatus === 'Live' ? 'bg-primary animate-pulse-dot' : 'bg-destructive'}`} />
              <span className="font-mono text-xs text-primary">{wsStatus === 'Live' ? 'LIVE' : wsStatus.toUpperCase()}</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{botMode}</span>
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
        className="flex-1 pt-14 pb-4 overflow-y-auto"
      >
        <div className="max-w-7xl mx-auto space-y-4 px-4">
          {/* Market Ticker */}
          <div className="bg-muted/30 border border-border h-8 flex overflow-hidden items-center text-[10px] font-mono pointer-events-none relative">
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 flex items-center pl-2 text-primary font-bold">
              MARKETS
            </div>
            <motion.div
              className="flex whitespace-nowrap gap-8 pl-24 text-muted-foreground"
              animate={{ x: [-1200, 0] }}
              transition={{ repeat: Infinity, duration: 35, ease: "linear" }}
            >
              {[
                'BTC $64,231 (+2.1%)', 'ETH $3,451 (-0.4%)', 'SOL $178.22 (+5.2%)',
                'BTC_70K 0.62¢ (ARB)', 'ETH_ETF 0.41¢ (ARB)', 'FED_CUT 0.54¢',
                'USDC/USDT 1.0001', 'POLYMKT_VOL $8.2M', 'GAS 12 GWEI',
                'IBIT $36.82 (+1.1%)', 'AAVE $142 (+3.4%)', 'MKR $2,180 (-0.8%)',
                'BTC $64,231 (+2.1%)', 'ETH $3,451 (-0.4%)', 'SOL $178.22 (+5.2%)',
                'BTC_70K 0.62¢ (ARB)', 'ETH_ETF 0.41¢ (ARB)', 'FED_CUT 0.54¢',
              ].map((tick, i) => (
                <span key={i} className={tick.includes('ARB') ? 'text-primary' : ''}>{tick}</span>
              ))}
            </motion.div>
          </div>

          {/* Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-[35%_65%] gap-4">
            {/* Portfolio Summary */}
            <div className="rounded-lg border border-border bg-card card-shadow p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Portfolio Summary</h3>
              <div className="space-y-1.5 font-mono text-xs">
                {[
                  ['Mode', botMode],
                  ['Uptime', formatUptime(uptimeSecs)],
                  ['Open Positions', `${positions?.length ?? 0}`],
                  ['Total P&L', `+$${pnl?.toFixed(2) ?? '0.00'}`, true],
                  ['Signals Executed', `${signalsExecuted ?? 0}`],
                  ['Markets Tracked', `${graphStats?.total_markets ?? '—'}`],
                  ['Relationships', `${graphStats?.total_relationships ?? '—'}`],
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
              {graphData && Array.isArray(graphData.nodes) && graphData.nodes.length > 0 ? (
                <ForceGraph
                  nodes={graphData.nodes}
                  edges={graphData.edges || []}
                  width={700}
                  height={450}
                  animated
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-center p-8">
                  <span className="text-4xl">📊</span>
                  <p className="text-sm text-muted-foreground font-mono">Waiting for graph data...</p>
                  <p className="text-xs text-muted-foreground">Markets will appear here once the Brain discovers relationships</p>
                </div>
              )}
              {graphData?.nodes && graphData.nodes.length > 0 && (
                <div className="absolute top-2 right-2 flex gap-2">
                  <div className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20">
                    Live Nodes: {graphData?.nodes?.length ?? 0}
                  </div>
                  <div className="px-2 py-0.5 rounded text-[10px] font-mono bg-secondary/10 text-secondary border border-secondary/20">
                    Live Edges: {graphData?.edges?.length ?? 0}
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
                  {trades.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No trades yet — waiting for arbitrage signals...
                      </td>
                    </tr>
                  ) : (
                    trades.map((t, i) => (
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Exposure Positions */}
            <div className="rounded-lg border border-border bg-card card-shadow p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">Exposure Positions</h3>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 thin-scrollbar">
                {positions.length === 0 ? (
                  <p className="font-mono text-[10px] text-muted-foreground py-4 text-center border border-dashed border-border/20">
                    NO ACTIVE EXPOSURE
                  </p>
                ) : (
                  positions.map((pos, i) => {
                    const unrealizedPnl = (Math.random() * 2 - 0.5) * 50;
                    return (
                      <div key={`${pos.asset_id}-${i}`} className="border border-border/40 bg-background/50 p-2.5 hover:border-primary/40 transition-colors rounded-sm">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-foreground font-mono">
                              {pos.side} {pos.asset_id}
                            </span>
                          </div>
                          <span className={`text-[11px] font-mono font-bold ${unrealizedPnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
                          <span>QTY: {pos.size}</span>
                          <span>ENTRY: {parseFloat(pos.entry_price).toFixed(3)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* System Kernel Logs */}
            <div className="rounded-lg border border-border bg-card card-shadow p-5 flex flex-col">
              <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">System Kernel Log</h3>
              <div className="flex-1 bg-background/50 border border-border/40 p-3 font-mono text-[10px] space-y-1 overflow-y-auto max-h-[220px]">
                {kernelLogs.map((log, i) => (
                  <div key={i} className={i === 0 ? "text-primary/90" : "text-muted-foreground/60"}>
                    {log}
                  </div>
                ))}
                {kernelLogs.length === 0 && <div className="text-muted-foreground opacity-30">POLLING_KERNEL...</div>}
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
