import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import Navbar from '../components/Navbar';
import ProgressBar from '../components/ProgressBar';
import StepNav from '../components/StepNav';

export default function Connect() {
  const [polymarketWallet, setPolymarketWallet] = useState('');
  const [kalshiWallet, setKalshiWallet] = useState('');
  const [polymarketConnecting, setPolymarketConnecting] = useState(false);
  const [kalshiConnecting, setKalshiConnecting] = useState(false);
  const [polymarketConnected, setPolymarketConnected] = useState(false);
  const [kalshiConnected, setKalshiConnected] = useState(false);

  const handlePolymarketConnect = () => {
    if (!polymarketWallet.trim()) return;
    setPolymarketConnecting(true);
    setTimeout(() => {
      setPolymarketConnecting(false);
      setPolymarketConnected(true);
    }, 1500);
  };

  const handleKalshiConnect = () => {
    if (!kalshiWallet.trim()) return;
    setKalshiConnecting(true);
    setTimeout(() => {
      setKalshiConnecting(false);
      setKalshiConnected(true);
    }, 1500);
  };

  const bothConnected = polymarketConnected && kalshiConnected;

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
        <h1 className="text-2xl font-bold text-foreground mb-2">Connect Your Trading Accounts</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Enter your wallet addresses for each platform. ArbOS will use these to place trades on your behalf.
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
              <p className="text-xs text-muted-foreground">Polymarket wallet</p>
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
                ✓ Connected: {polymarketWallet.length > 10 ? `${polymarketWallet.slice(0, 6)}...${polymarketWallet.slice(-4)}` : polymarketWallet} — Balance: 247.50 USDC
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                Not Connected
              </>
            )}
          </div>
        </div>

        {/* Kalshi Card */}
        <div className="rounded-lg border border-border bg-card card-shadow p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-mono text-xs font-bold">K</div>
              <span className="font-semibold text-foreground">KALSHI</span>
            </div>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">REQUIRED</span>
          </div>

          {!kalshiConnected && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Kalshi wallet</p>
              <div className="relative">
                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="0x... (wallet or proxy)"
                  value={kalshiWallet}
                  onChange={e => setKalshiWallet(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-md bg-muted border border-border text-foreground font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                onClick={handleKalshiConnect}
                disabled={kalshiConnecting || !kalshiWallet.trim()}
                className="w-full py-3 rounded-md bg-primary text-primary-foreground font-mono text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {kalshiConnecting ? (
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

          <div className={`mt-4 flex items-center gap-2 font-mono text-xs ${kalshiConnected ? 'text-primary' : 'text-muted-foreground'}`}>
            {kalshiConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-primary" />
                ✓ Connected: {kalshiWallet.length > 10 ? `${kalshiWallet.slice(0, 6)}...${kalshiWallet.slice(-4)}` : kalshiWallet} — Balance: 1,250.00 USD
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                Not Connected
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
            <li>• Never transmitted to our servers</li>
            <li>• Revoke access anytime</li>
          </ul>
        </div>
      </motion.div>

      <StepNav
        backTo="/"
        nextTo="/graph"
        nextDisabled={!bothConnected}
      />
    </div>
  );
}
