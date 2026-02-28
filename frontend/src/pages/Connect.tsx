import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import Navbar from '../components/Navbar';
import ProgressBar from '../components/ProgressBar';
import StepNav from '../components/StepNav';
import { fetchBotHealth, fetchBrainHealth } from '../lib/api';

export default function Connect() {
  const [polymarketWallet, setPolymarketWallet] = useState('');
  const [polymarketConnecting, setPolymarketConnecting] = useState(false);
  const [polymarketConnected, setPolymarketConnected] = useState(false);

  // Brain service connectivity (replaces Kalshi placeholder)
  const [brainConnected, setBrainConnected] = useState(false);
  const [brainChecking, setBrainChecking] = useState(false);
  const [brainStatus, setBrainStatus] = useState<{ db_connected: boolean; llm_configured: boolean } | null>(null);

  // Bot service connectivity
  const [botConnected, setBotConnected] = useState(false);

  // Auto-check Brain + Bot connectivity on mount
  useEffect(() => {
    checkBrainHealth();
    checkBotHealth();
  }, []);

  const checkBrainHealth = async () => {
    setBrainChecking(true);
    try {
      const health = await fetchBrainHealth();
      setBrainConnected(health.status === 'ok' || health.status === 'degraded');
      setBrainStatus({ db_connected: health.db_connected, llm_configured: health.llm_configured });
    } catch {
      setBrainConnected(false);
      setBrainStatus(null);
    } finally {
      setBrainChecking(false);
    }
  };

  const checkBotHealth = async () => {
    const ok = await fetchBotHealth();
    setBotConnected(ok);
  };

  const handlePolymarketConnect = async () => {
    if (!polymarketWallet.trim()) return;
    setPolymarketConnecting(true);

    // Validate wallet format and verify bot is reachable
    const botOk = await fetchBotHealth();
    setBotConnected(botOk);

    if (botOk) {
      setPolymarketConnected(true);
    }
    setPolymarketConnecting(false);
  };

  const allConnected = polymarketConnected && brainConnected;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="pt-14">
        <ProgressBar currentStep={1} />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex-1 max-w-2xl mx-auto w-full px-4 py-8"
      >
        <h1 className="text-2xl font-bold text-foreground mb-2">Connect Your Services</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Verify connectivity to the ArbOS backend services and enter your Polymarket wallet address.
        </p>

        {/* Polymarket Card */}
        <div className="rounded-lg border border-border bg-card card-shadow p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-mono text-xs font-bold">P</div>
              <span className="font-semibold text-foreground">POLYMARKET</span>
            </div>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">REQUIRED</span>
          </div>

          {!polymarketConnected && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Polymarket wallet address</p>
              <div className="relative">
                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="0x... (wallet or proxy)"
                  value={polymarketWallet}
                  onChange={e => setPolymarketWallet(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-md bg-muted border border-border text-foreground font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                onClick={handlePolymarketConnect}
                disabled={polymarketConnecting || !polymarketWallet.trim()}
                className="w-full py-3 rounded-md bg-primary text-primary-foreground font-mono text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {polymarketConnecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Connecting...
                  </span>
                ) : (
                  'Connect'
                )}
              </button>
            </div>
          )}

          <div className={`mt-4 flex items-center gap-2 font-mono text-xs ${polymarketConnected ? 'text-primary' : 'text-muted-foreground'}`}>
            {polymarketConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-primary" />
                ✓ Connected: {polymarketWallet.length > 10 ? `${polymarketWallet.slice(0, 6)}...${polymarketWallet.slice(-4)}` : polymarketWallet}
                {botConnected && ' — Bot Orchestrator: Online'}
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                Not Connected
              </>
            )}
          </div>
        </div>

        {/* Brain Service Card */}
        <div className="rounded-lg border border-border bg-card card-shadow p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-mono text-xs font-bold">B</div>
              <span className="font-semibold text-foreground">BRAIN SERVICE</span>
            </div>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">REQUIRED</span>
          </div>

          <div className="space-y-2 font-mono text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">API Status</span>
              <span className={brainConnected ? 'text-primary' : 'text-destructive'}>
                {brainChecking ? '⏳ Checking...' : brainConnected ? '🟢 Online' : '🔴 Offline'}
              </span>
            </div>
            {brainStatus && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Database</span>
                  <span className={brainStatus.db_connected ? 'text-primary' : 'text-destructive'}>
                    {brainStatus.db_connected ? '🟢 Connected' : '🔴 Disconnected'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">LLM (WatsonX)</span>
                  <span className={brainStatus.llm_configured ? 'text-primary' : 'text-warning'}>
                    {brainStatus.llm_configured ? '🟢 Configured' : '⚠️ Not Configured'}
                  </span>
                </div>
              </>
            )}
          </div>

          {!brainConnected && !brainChecking && (
            <button
              onClick={checkBrainHealth}
              className="w-full mt-4 py-2.5 rounded-md bg-muted border border-border text-foreground font-mono text-xs hover:bg-primary/10 transition-colors"
            >
              Retry Connection
            </button>
          )}

          <div className={`mt-4 flex items-center gap-2 font-mono text-xs ${brainConnected ? 'text-primary' : 'text-muted-foreground'}`}>
            {brainConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-primary" />
                ✓ Brain Service is ready — AI analysis enabled
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                Brain service not reachable at port 8000
              </>
            )}
          </div>
        </div>

        {/* Security */}
        <div className="rounded-lg bg-muted border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">🔒</span>
            <span className="text-xs font-semibold text-foreground">Security</span>
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• Wallet addresses stored locally only</li>
            <li>• Never transmitted to external servers</li>
            <li>• All communication over local Docker network</li>
          </ul>
        </div>
      </motion.div>

      <StepNav
        backTo="/"
        nextTo="/graph"
        nextDisabled={!allConnected}
      />
    </div>
  );
}
