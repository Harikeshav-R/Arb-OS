import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import ProgressBar from '../components/ProgressBar';
import StepNav from '../components/StepNav';
import ForceGraph from '../components/ForceGraph';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { useQuery } from '@tanstack/react-query';
import { fetchGraphVis, fetchGraphStats, sendChatMessage, type ChatMessage as ApiChatMessage } from '../lib/api';

interface ChatMessage {
  role: 'ai' | 'user';
  text: string;
}

const INITIAL_MSG: ChatMessage = {
  role: 'ai',
  text: "Welcome to ArbOS. Tell me what events or topics you're interested in monitoring. For example: 'Track everything related to Bitcoin ETFs and derivatives' or 'Show me DeFi and stablecoin markets'. I'll map the logical relationships and find arbitrage opportunities automatically.",
};

// ── Flowing Terminal Log Messages ────────────────────────────────────────────
const IDLE_LOGS = [
  'GAMMA_API_POLL: 847 active markets (200 OK, 47ms)',
  'ORDERBOOK_SNAPSHOT: BTC_70K depth=$2.4M bid/$1.8M ask',
  'CONTRADICTION_ENGINE: Scanning 12 exclusive pairs...',
  'GRAPH_INTEGRITY: Checksumming adjacency matrix...',
  'SIGNAL_PIPELINE: Waiting for edge threshold breach...',
  'RISK_MODULE: Portfolio VaR=$42.30 (limit=$500)',
  'WS_HEARTBEAT: Bot orchestrator alive (RTT 3ms)',
  'MARKET_SCANNER: Monitoring 6 cluster sectors',
  'CACHE_SYNC: Refreshing price feeds (cycle 847)',
  'LIQUIDITY_DEPTH: Aggregating across 3 venues',
  'SCHEDULER: Next full scan in 12s',
  'TELEMETRY: Uptime 99.97%, 0 errors last 1h',
];

const ACTIVE_LOGS = [
  'LLM_INFERENCE: Tokenizing query (granite-3.1-8b)...',
  'GAMMA_FETCH: Pulling orderbook for matched markets...',
  'EDGE_WEIGHT: Computing conditional probabilities...',
  'GRAPH_REBUILD: Recomputing adjacency matrix...',
  'CONTRADICTION_SCAN: Checking P(A)+P(B)≤1 constraints...',
  'KELLY_SIZING: Optimal allocation f*=0.34...',
  'CROSS_VALIDATE: Verifying against 3 data sources...',
  'SIGNAL_EMIT: Packaging vectors for downstream...',
  'DB_WRITE: Persisting new relationships...',
  'ORDERBOOK_DEPTH: Checking slippage tolerance...',
];

// ── Richer Typing Stages ─────────────────────────────────────────────────────
const typingStages = [
  'PARSING_TOKENS',
  'FETCHING_ORDERBOOK_DEPTH',
  'WEIGHTING_EDGE_PROBABILITIES',
  'RESOLVING_CONTRADICTIONS',
  'COMPUTING_KELLY_SIZING',
  'CROSS_VALIDATING_SOURCES',
  'COORDINATING_MULTI_EXCHANGE',
  'LOCKING_VECTORS',
];

export default function Graph() {
  const { data: graphData } = useQuery({
    queryKey: ['graph-vis'],
    queryFn: fetchGraphVis,
    refetchInterval: 200, // 5 updates/second
  });

  const { data: statsData } = useQuery({
    queryKey: ['graph-stats'],
    queryFn: fetchGraphStats,
    refetchInterval: 5000,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MSG]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [typingStage, setTypingStage] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [graphKey, setGraphKey] = useState(0);
  const hasUserSentMessage = messages.some(m => m.role === 'user');

  // ── Flowing terminal logs ─────────────────────────────────────────────────
  const [termLogs, setTermLogs] = useState<string[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const pool = typing ? ACTIVE_LOGS : IDLE_LOGS;
      const msg = pool[Math.floor(Math.random() * pool.length)];
      setTermLogs(prev => [
        `[${new Date().toLocaleTimeString()}] ${msg}`,
        ...prev,
      ].slice(0, 40));
    }, typing ? 500 : 2000);
    return () => clearInterval(interval);
  }, [typing]);

  // ── Typing stage animation ────────────────────────────────────────────────
  useEffect(() => {
    if (typing) {
      let stage = 0;
      const interval = setInterval(() => {
        stage = (stage + 1) % typingStages.length;
        setTypingStage(stage);
      }, 500);
      return () => clearInterval(interval);
    }
  }, [typing]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const handleSend = async () => {
    if (!input.trim() || typing) return;
    const userMsg: ChatMessage = { role: 'user', text: input };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setTyping(true);

    try {
      const history: ApiChatMessage[] = updatedMessages
        .slice(1)
        .map(m => ({ role: m.role, text: m.text }));

      const response = await sendChatMessage(input, history);

      setMessages(prev => [...prev, { role: 'ai', text: response.response }]);
      setGraphKey(k => k + 1);
    } catch (err) {
      console.error('Chat API error:', err);
      setMessages(prev => [...prev, {
        role: 'ai',
        text: 'ERROR: Failed to reach ArbOS Brain. Check backend on port 8000.',
      }]);
    } finally {
      setTyping(false);
    }
  };

  const nodeCount = (graphData && Array.isArray(graphData.nodes)) ? graphData.nodes.length : (statsData?.total_markets ?? 0);
  const edgeCount = (graphData && Array.isArray(graphData.edges)) ? graphData.edges.length : (statsData?.total_relationships ?? 0);
  const arbCount = statsData?.total_implies ?? 0;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Navbar />
      <div className="pt-14 shrink-0">
        <ProgressBar currentStep={2} />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex-1 min-h-0 flex overflow-hidden"
      >
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={40} minSize={25} maxSize={70} className="flex flex-col min-w-0 bg-muted">
            {/* Chat Header */}
            <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">ArbOS Brain</span>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-secondary/20 text-secondary border border-secondary/30">
                IBM WatsonX · Granite
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-black/40 font-mono">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[90%] px-3 py-1.5 text-[13px] leading-relaxed border ${msg.role === 'user'
                      ? 'bg-muted/50 border-foreground text-foreground'
                      : 'bg-black border-primary text-primary'
                      }`}
                  >
                    <span className="opacity-50 mr-2">{msg.role === 'user' ? 'USER>' : 'SYS>'}</span>
                    {msg.text}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="text-primary text-[13px] font-bold border border-primary px-3 py-1.5 bg-primary/5">
                    <span className="animate-pulse">{typingStages[typingStage]}...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Stats */}
            <div className="shrink-0 px-4 py-2 border-t border-border">
              <div className="font-mono text-[10px] text-muted-foreground flex gap-4">
                <span>Nodes: <span className="text-primary">{nodeCount}</span></span>
                <span>Edges: <span className="text-primary">{edgeCount}</span></span>
                <span>Implications: <span className="text-primary">{arbCount}</span></span>
              </div>
            </div>

            {/* Flowing Terminal Log */}
            <div className="shrink-0 border-t border-border bg-black/60 max-h-[120px] overflow-y-auto">
              <div className="px-3 py-1.5 font-mono text-[9px] space-y-0.5">
                {termLogs.slice(0, 15).map((log, i) => (
                  <div key={i} className={i === 0 ? 'text-primary/80' : 'text-muted-foreground/50'}>
                    {log}
                  </div>
                ))}
                {termLogs.length === 0 && <div className="text-muted-foreground/30">KERNEL_INIT...</div>}
              </div>
            </div>

            {/* Input */}
            <div className="shrink-0 p-3 border-t border-border">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Ask ArbOS anything..."
                  className="flex-1 px-3 py-2.5 rounded-md bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || typing}
                  className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground font-mono text-xs hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Send ↑
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
                Try: "Track Bitcoin ETF markets" · "Show DeFi and stablecoins" · "Analyze crypto regulation"
              </p>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-border hover:bg-primary/20 transition-colors" />

          {/* Right Panel — Graph */}
          <ResizablePanel defaultSize={60} minSize={30} maxSize={75} className="min-w-0 bg-background">
            <div className="w-full h-full bg-background relative flex items-center justify-center" style={{ minHeight: '400px' }}>
              {hasUserSentMessage ? (
                <>
                  {graphData?.nodes && graphData.nodes.length > 0 ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      {typing && (
                        <div className="absolute inset-0 z-30 bg-background/60 backdrop-blur-md flex flex-col items-center justify-center border border-primary/20">
                          <div className="text-primary font-mono text-xl tracking-[0.3em] font-bold animate-pulse mb-4">DECODING_HEURISTIC_ALPHA</div>
                          <div className="w-64 h-1 bg-muted overflow-hidden">
                            <motion.div
                              className="h-full bg-primary"
                              animate={{ x: [-256, 256] }}
                              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                            />
                          </div>
                          <div className="mt-4 font-mono text-[11px] text-primary/60">LAYER_{typingStages[typingStage]}_RESOLVING...</div>
                          <div className="mt-2 font-mono text-[9px] text-muted-foreground/40 max-w-xs text-center">
                            Processing {nodeCount} nodes across {statsData?.connected_components ?? 6} cluster sectors
                          </div>
                        </div>
                      )}
                      <ForceGraph
                        key={graphKey}
                        nodes={graphData.nodes}
                        edges={graphData.edges}
                        width={1200}
                        height={800}
                        animated
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-center p-8">
                      {typing ? (
                        <>
                          <div className="text-primary font-mono text-xl tracking-[0.3em] font-bold animate-pulse">MAPPING_VECTORS</div>
                          <div className="w-48 h-1 bg-muted overflow-hidden mt-2">
                            <motion.div
                              className="h-full bg-primary"
                              animate={{ x: [-192, 192] }}
                              transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground font-mono mt-2">First scan — building relationship graph...</p>
                        </>
                      ) : (
                        <>
                          <span className="text-4xl">🧠</span>
                          <p className="text-sm text-muted-foreground font-mono">No graph data yet</p>
                          <p className="text-xs text-muted-foreground">Ask ArbOS to track markets to build this graph</p>
                        </>
                      )}
                    </div>
                  )}
                  {/* Legend */}
                  <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur border border-border rounded-md px-3 py-2 text-[10px] font-mono text-muted-foreground space-y-1">
                    <div>── IMPLIES &nbsp; -- EXCLUSIVE &nbsp; ·· PARTITION</div>
                    <div>
                      <span className="text-primary">●</span> Active Arb &nbsp;
                      <span className="text-muted-foreground">●</span> Monitored &nbsp;
                      <span className="text-destructive">●</span> Low Liquidity
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground font-mono">
                  Type something in the chat to build your graph
                </p>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </motion.div>

      <div className="shrink-0">
        <StepNav
          backTo="/connect"
          backLabel="← Back"
          nextTo="/configure"
          nextLabel="Finalize Graph →"
          centerContent={
            <span className="font-mono text-xs text-muted-foreground">
              Nodes: {nodeCount} · Edges: {edgeCount} · Implications: {arbCount}
            </span>
          }
        />
      </div>
    </div>
  );
}
