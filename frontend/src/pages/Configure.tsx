import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ProgressBar from '../components/ProgressBar';
import StepNav from '../components/StepNav';

export default function Configure() {
  const navigate = useNavigate();
  const [capital, setCapital] = useState(500);
  const [minProfit, setMinProfit] = useState('2.0');
  const [maxPosition, setMaxPosition] = useState('50');
  const [minLiquidity, setMinLiquidity] = useState('100');
  const [maxDuration, setMaxDuration] = useState('30');
  const [autoMode, setAutoMode] = useState(true);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="pt-14">
        <ProgressBar currentStep={3} />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 overflow-y-auto"
      >
        <h1 className="text-2xl font-bold text-foreground mb-1">Configure Your Arbitrage Agent</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Your graph: 14 markets, 23 relationships · 3 active opportunities
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Capital Allocation */}
          <div className="rounded-lg border border-border bg-card card-shadow p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Capital Allocation</h3>
            <p className="font-mono text-xs text-muted-foreground mb-3">
              Available USDC Balance: <span className="text-foreground">$1,247.50</span>
            </p>
            <input
              type="range"
              min={10}
              max={1247}
              value={capital}
              onChange={e => setCapital(Number(e.target.value))}
              className="w-full h-1.5 bg-accent rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,212,170,0.4)]"
            />
            <div className="flex items-center gap-2 mt-3">
              <span className="font-mono text-lg text-primary font-bold">${capital.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">⚠ Minimum recommended: $100 USDC</p>
            <p className="text-[10px] text-muted-foreground">⚠ Reserve ~$5 for gas fees</p>
          </div>

          {/* Risk Parameters */}
          <div className="rounded-lg border border-border bg-card card-shadow p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Risk Parameters</h3>
            <div className="space-y-3">
              {[
                { label: 'Min Profit Threshold', value: minProfit, set: setMinProfit, suffix: '%', help: 'Lower = more trades, smaller edge' },
                { label: 'Max Position Size', value: maxPosition, set: setMaxPosition, suffix: ' USDC', help: '' },
                { label: 'Min Liquidity Depth', value: minLiquidity, set: setMinLiquidity, suffix: ' USDC', help: '' },
                { label: 'Max Market Duration', value: maxDuration, set: setMaxDuration, suffix: ' days', help: '' },
              ].map(item => (
                <div key={item.label}>
                  <label className="text-xs text-muted-foreground block mb-1">{item.label}</label>
                  <input
                    type="text"
                    value={item.value}
                    onChange={e => item.set(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-muted border border-border text-foreground font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {item.help && <p className="text-[10px] text-muted-foreground mt-0.5">{item.help}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Projected Performance */}
          <div className="rounded-lg border border-border bg-card card-shadow p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Projected Performance</h3>
            <div className="space-y-2 font-mono text-xs">
              {[
                ['Active Opportunities', '3'],
                ['Avg Spread (after fees)', '3.2¢/share'],
                ['Est. Daily Opportunity', '$4.80 – $12.50'],
                ['Est. Monthly Return', '2.1% – 5.4%'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-foreground">{value}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-warning mt-3">⚠ Estimates based on current conditions.</p>
          </div>

          {/* Execution Mode */}
          <div className="rounded-lg border border-border bg-card card-shadow p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Execution Mode</h3>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setAutoMode(true)}
                className={`font-mono text-xs px-3 py-1.5 rounded-md transition-colors ${autoMode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                Auto
              </button>
              <button
                onClick={() => setAutoMode(false)}
                className={`font-mono text-xs px-3 py-1.5 rounded-md transition-colors ${!autoMode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                Confirm
              </button>
              <span className="text-[10px] text-muted-foreground">
                {autoMode ? 'Execute immediately' : 'Alert + wait for approval'}
              </span>
            </div>
            <h4 className="text-xs text-muted-foreground mb-2 font-semibold">Fee Breakdown</h4>
            <div className="space-y-1.5 font-mono text-[11px]">
              {[
                ['Polymarket Taker Fee', '0% (most) · 1.56% (crypto)'],
                ['Polygon Gas', '~$0.01–0.05/tx'],
                ['ArbOS Platform Fee', '0.5% of profit'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <StepNav
        backTo="/graph"
        backLabel="← Back to Graph"
        nextLabel="Launch Agent 🚀"
        onNext={() => setShowModal(true)}
      />

      {/* Launch Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-lg card-shadow max-w-md w-full p-6"
            >
              <h2 className="text-lg font-bold text-foreground mb-4">🚀 Launch ArbOS Agent?</h2>
              <div className="space-y-2 font-mono text-xs mb-6">
                {[
                  ['Capital allocated', `$${capital.toFixed(2)} USDC`],
                  ['Markets monitored', '14'],
                  ['Min profit threshold', `${minProfit}%`],
                  ['Execution mode', autoMode ? 'Automatic' : 'Manual Confirm'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground">{value}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mb-6">
                The agent will monitor your graph 24/7, execute trades when arb is detected, and stay within your risk parameters. You can pause or stop at any time.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-md border border-border text-muted-foreground font-mono text-xs hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-mono text-xs glow-teal hover:opacity-90 transition-opacity"
                >
                  Confirm Launch ✓
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
