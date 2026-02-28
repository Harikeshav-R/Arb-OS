import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import ProgressBar from '../components/ProgressBar';
import StepNav from '../components/StepNav';
import ForceGraph, { DEFAULT_NODES, DEFAULT_EDGES } from '../components/ForceGraph';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { useQuery } from '@tanstack/react-query';

interface ChatMessage {
  role: 'ai' | 'user';
  text: string;
}

const INITIAL_MSG: ChatMessage = {
  role: 'ai',
  text: "Welcome to ArbOS. Tell me what events or topics you're interested in monitoring. For example: 'Track everything related to 2026 Federal Reserve rate decisions' or 'Show me all US election markets'. I'll map the logical relationships and find arbitrage opportunities automatically.",
};

const AI_RESPONSE = `Great choice — Fed rate decisions are one of the most actively traded categories on Polymarket. I found 14 active markets related to Federal Reserve rate decisions in 2026. Mapping logical relationships now...

✓ Graph generated: 14 nodes, 23 edges. Detected 3 active arbitrage opportunities:

1. IMPLICATION: "June cut" (60¢) → "2026 cut" (55¢) ⚠️ VIOLATION — +5¢ spread
2. PARTITION: Monthly cut probabilities sum to 112% ⚠️ VIOLATION
3. IMPLICATION: "CPI > 3%" → "No rate cut 2026" (confidence: 0.7)

Would you like to add more markets or refine the graph?`;

export default function Graph() {
  const { data: graphData } = useQuery({
    queryKey: ['graph-vis'],
    queryFn: async () => {
      const res = await fetch('http://localhost:8000/graph/vis');
      if (!res.ok) throw new Error('Failed to fetch graph');
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Ref to track which asset IDs we've already sent to the ingestor
  const syncedAssets = useRef<Set<string>>(new Set());

  // Dynamically push loaded graph assets to the orchestrator to begin ingestion
  useEffect(() => {
    if (!graphData?.nodes) return;

    const newAssets = graphData.nodes
      .map((n: { id: string }) => n.id)
      .filter((id: string) => !syncedAssets.current.has(id));

    if (newAssets.length > 0) {
      newAssets.forEach((id: string) => syncedAssets.current.add(id));

      fetch('http://localhost:8001/api/assets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_ids: newAssets })
      }).catch(err => {
        console.error('Failed to sync new assets to orchestrator', err);
        // Remove from set so we try again later
        newAssets.forEach((id: string) => syncedAssets.current.delete(id));
      });
    }
  }, [graphData]);

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MSG]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [graphKey, setGraphKey] = useState(0);
  const hasUserSentMessage = messages.some(m => m.role === 'user');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const handleSend = () => {
    if (!input.trim() || typing) return;
    const userMsg: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      setMessages(prev => [...prev, { role: 'ai', text: AI_RESPONSE }]);
      setGraphKey(k => k + 1);
    }, 1500);
  };

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
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2.5 rounded-lg text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border-l-2 border-l-secondary text-foreground'
                      }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="bg-card border-l-2 border-l-secondary px-3 py-2.5 rounded-lg flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-typing-dot" style={{ animationDelay: '0s' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-typing-dot" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-typing-dot" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Stats */}
            <div className="shrink-0 px-4 py-2 border-t border-border">
              <div className="font-mono text-[10px] text-muted-foreground flex gap-4">
                <span>Nodes: <span className="text-primary">{graphData ? graphData.nodes.length : 14}</span></span>
                <span>Edges: <span className="text-primary">{graphData ? graphData.edges.length : 23}</span></span>
                <span>Active Arbs: <span className="text-primary">3</span></span>
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
                Try: /add crypto · /remove · /scan · /suggest
              </p>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-border hover:bg-primary/20 transition-colors" />

          {/* Right Panel — Graph */}
          <ResizablePanel defaultSize={60} minSize={30} maxSize={75} className="min-w-0 bg-background">
            <div className="w-full h-full bg-background relative flex items-center justify-center" style={{ minHeight: '400px' }}>
              {hasUserSentMessage ? (
                <>
                  {graphData ? (
                    <ForceGraph
                      key={graphKey}
                      nodes={graphData.nodes}
                      edges={graphData.edges}
                      width={700}
                      height={500}
                      animated
                    />
                  ) : (
                    <ForceGraph
                      key={graphKey}
                      nodes={DEFAULT_NODES}
                      edges={DEFAULT_EDGES}
                      width={700}
                      height={500}
                      animated
                    />
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
              Nodes: {graphData ? graphData.nodes.length : 14} · Edges: {graphData ? graphData.edges.length : 23} · Arbs: 3
            </span>
          }
        />
      </div>
    </div>
  );
}
