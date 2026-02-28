import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import WebGLCanvas from '../components/WebGLCanvas';
import { useQuery } from '@tanstack/react-query';
import { fetchGraphStats, fetchBotStatus } from '../lib/api';

const stagger = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: 'easeOut' },
  }),
};

export default function Landing() {
  const { data: graphStats } = useQuery({
    queryKey: ['graph-stats'],
    queryFn: fetchGraphStats,
    retry: 1,
    staleTime: 30000,
  });

  const { data: botStatus } = useQuery({
    queryKey: ['bot-status'],
    queryFn: fetchBotStatus,
    retry: 1,
    staleTime: 30000,
  });

  const pnl = botStatus ? `$${parseFloat(botStatus.cumulative_pnl).toFixed(2)} P&L` : 'Arbitrage Engine';
  const relationships = graphStats ? `${graphStats.total_relationships} relationships mapped` : 'AI-powered analysis';
  const signals = botStatus ? `${botStatus.signals_executed} signals executed` : 'Real-time detection';

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <WebGLCanvas />
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        <motion.div
          className="flex flex-col items-center text-center"
          initial="hidden"
          animate="visible"
        >
          {/* Badge */}
          <motion.div
            custom={0}
            variants={stagger}
            className="mb-8 px-3 py-1.5 rounded-md border border-primary bg-card font-mono text-[11px] tracking-wider text-primary"
          >
            ⚡ PREDICTION MARKET ARBITRAGE ENGINE
          </motion.div>

          {/* Main headline */}
          <motion.h1
            custom={1}
            variants={stagger}
            className="text-4xl sm:text-5xl md:text-7xl font-bold font-mono tracking-tight text-primary leading-none"
          >
            ArbOS
          </motion.h1>

          {/* Subtext */}
          <motion.p
            custom={2}
            variants={stagger}
            className="mt-6 text-base sm:text-lg text-muted-foreground max-w-[560px]"
          >
            The market is wrong.
            <br />
            Profit from it.
          </motion.p>

          {/* Buttons */}
          <motion.div
            custom={3}
            variants={stagger}
            className="flex gap-3 mt-8"
          >
            <Link
              to="/connect"
              className="font-mono text-sm px-6 py-3 rounded-md bg-primary text-primary-foreground glow-teal hover:opacity-90 transition-opacity"
            >
              Get Started →
            </Link>
            <Link
              to="/guide"
              className="font-mono text-sm px-6 py-3 rounded-md border border-primary text-primary hover:bg-primary/10 transition-colors"
            >
              Read Strategy
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div
            custom={4}
            variants={stagger}
            className="flex flex-col sm:flex-row gap-3 mt-10"
          >
            {[pnl, relationships, signals].map((label) => (
              <div
                key={label}
                className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-card border-l-2 border-l-primary font-mono text-xs text-foreground card-shadow"
              >
                {label}
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
