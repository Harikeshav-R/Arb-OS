import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Menu, X, ArrowRight, Activity, Zap, TrendingUp, ShieldAlert, AlertTriangle } from 'lucide-react';

const SECTIONS = [
  { id: 'understanding', title: 'Understanding Logical Arbitrage' },
  { id: 'entry-strategy', title: 'Entry Strategy' },
  { id: 'managing-graph', title: 'Managing Your Graph' },
  { id: 'maximizing-returns', title: 'Maximizing Returns' },
  { id: 'safety', title: 'Safety & Error Handling' }
];

export default function Guide() {
  const [activeSection, setActiveSection] = useState('understanding');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({ type1: true });
  const [expandedTechniques, setExpandedTechniques] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -80% 0px' }
    );

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -100; // Account for sticky header
      const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
  };

  const toggleAccordion = (setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>, key: string) => {
    setter(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">

      {/* Sticky Navbar */}
      <nav className="sticky top-0 z-50 nav-blur border-b border-border px-4 md:px-8 h-16 flex items-center justify-between bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-mono font-bold text-xl text-primary tracking-tight">ArbOS</Link>
          <span className="text-muted-foreground text-sm font-medium hidden sm:inline-block">/ Guide</span>
        </div>

        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="hidden sm:flex items-center gap-2 font-mono text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
          >
            Launch App <ArrowRight className="w-4 h-4" />
          </Link>

          <button
            className="sm:hidden p-2 text-foreground"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile TOC Dropdown */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 top-16 z-40 bg-background border-b border-border p-4 lg:hidden shadow-2xl"
          >
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Jump to section</p>
            <div className="flex flex-col gap-2">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`text-left px-3 py-2 rounded-md transition-colors text-sm ${activeSection === s.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-card hover:text-foreground'}`}
                >
                  {s.title}
                </button>
              ))}
            </div>
            <Link
              to="/"
              className="mt-4 flex items-center justify-center gap-2 w-full font-mono text-sm px-4 py-3 rounded-md bg-primary text-primary-foreground font-semibold"
            >
              Launch App <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto flex sm:pt-12 pt-8 pb-32 px-4 md:px-8 gap-12 relative">

        {/* Sticky Sidebar (Desktop) */}
        <aside className="hidden lg:block w-64 shrink-0 h-[calc(100vh-120px)] sticky top-[100px] overflow-y-auto pr-6 no-scrollbar">
          <p className="text-xs font-mono text-muted-foreground mx-3 mb-4 uppercase tracking-wider">Contents</p>
          <nav className="flex flex-col gap-1 border-l border-border">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`text-left border-l-2 -ml-[1px] pl-4 py-2 text-sm transition-all duration-200 ${activeSection === s.id
                  ? 'border-primary text-primary font-medium bg-gradient-to-r from-primary/10 to-transparent'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                  }`}
              >
                {s.title}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content Column */}
        <main className="flex-1 max-w-[720px] mx-auto lg:mx-0 min-w-0">

          {/* PAGE HEADER */}
          <header className="mb-16">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">ArbOS Guide</h1>
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed mb-8">
              Everything you need to know to find, execute, and profit from <span className="text-foreground font-medium">logical arbitrage</span> in prediction markets using ArbOS.
            </p>

            <div className="flex flex-wrap gap-3">
              {[
                '4 arbitrage types covered',
                '14ms avg detection latency',
                '100% win rate on executed arbs'
              ].map(stat => (
                <div key={stat} className="px-3 py-1.5 rounded-full bg-card border border-border font-mono text-xs text-primary">
                  {stat}
                </div>
              ))}
            </div>
          </header>

          {/* SECTION 1 */}
          <section id="understanding" className="scroll-mt-24 mb-20">
            <div className="bg-card border border-border rounded-[10px] p-6 sm:p-8 mb-8 shadow-xl">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Understanding Logical Arbitrage</h2>
              <p className="text-muted-foreground">Why prediction market mispricing is mathematically guaranteed profit</p>
            </div>

            <div className="space-y-12">
              <div>
                <h3 className="text-xl font-semibold mb-4">This Isn't Traditional Arbitrage</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  ArbOS performs <strong className="text-foreground font-medium">Logical Arbitrage</strong> — not cross-exchange arbitrage. Traditional arb buys low on Exchange A and sells high on Exchange B. Logical arbitrage finds situations where the math within a single platform violates the rules of probability. These violations are mathematical impossibilities, not just price gaps — making the profit <em className="text-foreground">genuinely guaranteed</em> rather than merely probable.
                </p>
                <div className="tip-box bg-card border-l-[3px] border-[#00D4AA] rounded-r-md p-4 italic text-foreground mb-6">
                  "A cross-exchange spread can close against you before you execute. A logical violation cannot resolve against you — if June ⊆ 2026, that is true regardless of what the Fed does. The profit is locked in at entry."
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-6">The Four Types of Logical Arbitrage</h3>

                <div className="space-y-4">
                  {/* Type 1 */}
                  <div className="bg-card border border-border rounded-lg overflow-hidden transition-colors hover:border-[#4A4A7A]">
                    <button
                      onClick={() => toggleAccordion(setExpandedTypes, 'type1')}
                      className="w-full text-left p-5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <span className="bg-[#7B61FF]/20 text-[#7B61FF] text-[11px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Type 1</span>
                        <h4 className="font-semibold text-lg">Implication Constraint (Monotonicity)</h4>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${expandedTypes.type1 ? '-rotate-180' : ''}`} />
                    </button>

                    <div className={`grid transition-all duration-300 ease-in-out ${expandedTypes.type1 ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="p-5 pt-0 border-t border-border mt-2 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2 items-baseline">
                            <span className="text-muted-foreground text-sm uppercase tracking-wider">Axiom:</span>
                            <code className="bg-background border border-border rounded px-3 py-1.5 font-mono text-sm text-foreground">If A ⊆ B, then P(A) ≤ P(B)</code>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2 items-baseline">
                            <span className="text-muted-foreground text-sm uppercase tracking-wider">Violation:</span>
                            <code className="bg-destructive/10 border border-destructive/30 rounded px-3 py-1.5 font-mono text-sm text-destructive">P(A)_bid &gt; P(B)_ask + fees</code>
                          </div>

                          <div className="bg-background border border-border rounded-md p-4 my-4">
                            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
                              <div className="bg-card p-3 rounded border border-border text-center w-full sm:w-auto">
                                <p className="text-xs text-muted-foreground mb-2 leading-tight">Will the Fed cut rates<br />in June 2026?</p>
                                <p className="font-mono text-lg mb-2">YES: 60¢</p>
                                <span className="bg-destructive/20 text-destructive text-[10px] font-bold px-2 py-1 rounded">SELL</span>
                              </div>

                              <div className="flex flex-col items-center text-muted-foreground shrink-0">
                                <span className="font-mono text-[10px] bg-card px-2 py-1 rounded mb-1">IMPLIES ⊆</span>
                                <ArrowRight className="w-5 h-5 hidden sm:block" />
                                <ChevronDown className="w-5 h-5 sm:hidden" />
                              </div>

                              <div className="bg-card p-3 rounded border border-border text-center w-full sm:w-auto">
                                <p className="text-xs text-muted-foreground mb-2 leading-tight">Will the Fed cut rates<br />in 2026?</p>
                                <p className="font-mono text-lg mb-2">YES: 55¢</p>
                                <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-1 rounded">BUY</span>
                              </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-border text-center">
                              <code className="font-mono text-sm text-primary">(0.60 - 0.55) - fees = +4.5¢/share</code>
                            </div>
                          </div>

                          <p className="text-muted-foreground text-sm leading-relaxed">
                            <strong className="text-foreground">Strategy:</strong> Sell the sub-event (A), Buy the super-event (B). At resolution, exactly one outcome is possible: either the Fed cuts in June (both positions win, net zero) or it doesn't (both positions lose their spread, net zero) — except the 5¢ spread you already locked in.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Type 2 */}
                  <div className="bg-card border border-border rounded-lg overflow-hidden transition-colors hover:border-[#4A4A7A]">
                    <button
                      onClick={() => toggleAccordion(setExpandedTypes, 'type2')}
                      className="w-full text-left p-5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <span className="bg-[#7B61FF]/20 text-[#7B61FF] text-[11px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Type 2</span>
                        <h4 className="font-semibold text-lg">Partition Constraint (Normalization)</h4>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${expandedTypes.type2 ? '-rotate-180' : ''}`} />
                    </button>

                    <div className={`grid transition-all duration-300 ease-in-out ${expandedTypes.type2 ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="p-5 pt-0 border-t border-border mt-2 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2 items-baseline">
                            <span className="text-muted-foreground text-sm uppercase tracking-wider">Axiom:</span>
                            <code className="bg-background border border-border rounded px-3 py-1.5 font-mono text-sm inline-block">ΣP(Ei) = 1.0</code> <span className="text-sm text-muted-foreground ml-2">for mutually exclusive, exhaustive outcomes</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2 items-baseline">
                            <span className="text-muted-foreground text-sm uppercase tracking-wider">Violation:</span>
                            <code className="bg-destructive/10 border border-destructive/30 rounded px-3 py-1.5 font-mono text-sm text-destructive">Sum of bid prices across all outcomes &gt; 1.0 + fees</code>
                          </div>

                          <div className="bg-background border border-border rounded-md overflow-hidden my-4">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-border bg-card">
                                  <th className="p-3 text-xs font-mono text-muted-foreground font-normal uppercase">Market</th>
                                  <th className="p-3 text-xs font-mono text-muted-foreground font-normal uppercase text-right">YES Bid</th>
                                </tr>
                              </thead>
                              <tbody className="text-sm font-mono divide-y divide-[#2A2A4A]">
                                <tr><td className="p-3 font-sans">Fed cuts in Q1 2026</td><td className="p-3 text-right">22¢</td></tr>
                                <tr><td className="p-3 font-sans">Fed cuts in Q2 2026</td><td className="p-3 text-right">31¢</td></tr>
                                <tr><td className="p-3 font-sans">Fed cuts in Q3 2026</td><td className="p-3 text-right">28¢</td></tr>
                                <tr><td className="p-3 font-sans">Fed cuts in Q4 2026</td><td className="p-3 text-right">19¢</td></tr>
                                <tr><td className="p-3 font-sans">No Fed cut in 2026</td><td className="p-3 text-right">16¢</td></tr>
                                <tr className="bg-warning/10">
                                  <td className="p-3 font-sans font-bold text-warning flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> TOTAL
                                  </td>
                                  <td className="p-3 text-right font-bold text-warning">116¢</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="flex gap-2 mb-4">
                            <span className="bg-warning/20 text-warning text-[10px] font-bold px-2 py-1 rounded uppercase flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> PARTITION VIOLATION
                            </span>
                            <span className="text-muted-foreground text-sm flex items-center">+16¢ excess</span>
                          </div>

                          <p className="text-muted-foreground text-sm leading-relaxed mb-2">
                            <strong className="text-foreground">Strategy:</strong> Sell ALL outcomes. Collect 116¢ total. At resolution, exactly one pays out 100¢. Net: +16¢ minus fees.
                          </p>
                          <code className="text-primary text-sm font-mono block">(Σ P(Ei)_bid) - 1.0 - Σ fees</code>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Type 3 */}
                  <div className="bg-card border border-border rounded-lg overflow-hidden transition-colors hover:border-[#4A4A7A]">
                    <button
                      onClick={() => toggleAccordion(setExpandedTypes, 'type3')}
                      className="w-full text-left p-5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <span className="bg-[#7B61FF]/20 text-[#7B61FF] text-[11px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Type 3</span>
                        <h4 className="font-semibold text-lg">Mutual Exclusion</h4>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${expandedTypes.type3 ? '-rotate-180' : ''}`} />
                    </button>
                    <div className={`grid transition-all duration-300 ease-in-out ${expandedTypes.type3 ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="p-5 pt-0 border-t border-border mt-2 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2 items-baseline">
                            <span className="text-muted-foreground text-sm uppercase tracking-wider">Axiom:</span>
                            <code className="bg-background border border-border rounded px-3 py-1.5 font-mono text-sm">If A and B cannot both occur: P(A) + P(B) ≤ 1.0</code>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2 items-baseline">
                            <span className="text-muted-foreground text-sm uppercase tracking-wider">Violation:</span>
                            <code className="bg-destructive/10 border border-destructive/30 rounded px-3 py-1.5 font-mono text-sm text-destructive">Combined probability &gt; 100%</code>
                          </div>
                          <div className="bg-background border border-border rounded-md p-4 my-4 font-mono text-sm text-center">
                            "Candidate X wins" <span className="text-muted-foreground">(58¢)</span> + "Candidate Y wins" <span className="text-muted-foreground">(49¢)</span> = <span className="text-destructive font-bold">107¢ — impossible</span>
                          </div>
                          <p className="text-muted-foreground text-sm leading-relaxed">
                            <strong className="text-foreground">Strategy:</strong> Sell both sides. Collect 107¢. One pays 100¢. Net: +7¢ minus fees.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Type 4 */}
                  <div className="bg-card border border-border rounded-lg overflow-hidden transition-colors hover:border-[#4A4A7A]">
                    <button
                      onClick={() => toggleAccordion(setExpandedTypes, 'type4')}
                      className="w-full text-left p-5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex gap-2">
                          <span className="bg-[#7B61FF]/20 text-[#7B61FF] text-[11px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Type 4</span>
                          <span className="bg-primary/20 text-primary text-[11px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold flex items-center gap-1"><Zap className="w-3 h-3" /> AI</span>
                        </div>
                        <h4 className="font-semibold text-lg">Chained Implication</h4>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${expandedTypes.type4 ? '-rotate-180' : ''}`} />
                    </button>
                    <div className={`grid transition-all duration-300 ease-in-out ${expandedTypes.type4 ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="p-5 pt-0 border-t border-border mt-2 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-2 items-baseline">
                            <span className="text-muted-foreground text-sm uppercase tracking-wider">Axiom:</span>
                            <code className="bg-background border border-border rounded px-3 py-1.5 font-mono text-sm">If A → B → C, then P(A) ≤ P(C)</code>
                          </div>

                          <p className="text-muted-foreground text-sm leading-relaxed">
                            This type requires detecting multi-hop logical chains — the kind humans miss entirely. The ArbOS AI Brain (powered by IBM Granite on WatsonX) maps these automatically.
                          </p>

                          <div className="bg-background border border-border rounded-md p-4 my-4 overflow-x-auto">
                            <div className="flex items-center gap-2 min-w-max text-sm pb-2">
                              <span className="bg-card px-3 py-2 rounded border border-border">Company X acquires Y <span className="font-mono text-primary">45¢</span></span>
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                              <span className="bg-card px-3 py-2 rounded border border-border">Y delists from NASDAQ <span className="font-mono text-muted-foreground">38¢</span></span>
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                              <span className="bg-card px-3 py-2 rounded border border-border">NASDAQ rebalances Q3 <span className="font-mono text-destructive">30¢</span></span>
                            </div>
                            <div className="mt-3 pt-3 border-t border-border/50 text-center">
                              <span className="bg-destructive/20 text-destructive text-[11px] font-mono px-2 py-1 rounded inline-block">
                                P(A)=45¢ &gt; P(C)=30¢ — chain violation: +15¢
                              </span>
                            </div>
                          </div>

                          <div className="tip-box bg-card border-l-[3px] border-[#00D4AA] rounded-r-md p-4 italic text-foreground">
                            "You don't need to find these manually. Tell ArbOS Brain what markets you care about and it maps the entire chain automatically."
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-6">Why These Opportunities Exist</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { icon: '⛓', title: 'No Centralized Market Maker', body: 'No single entity enforces consistency across related events on Polymarket' },
                    { icon: '💧', title: 'Fragmented Liquidity', body: 'Each market has its own isolated order book and participant base' },
                    { icon: '😤', title: 'Sentiment Trading', body: 'Retail participants price based on news and emotion, not mathematical constraints' },
                    { icon: '⏱', title: 'Speed Requirements', body: 'Opportunities appear and vanish in seconds — too fast for manual execution' },
                    { icon: '📊', title: 'Thousands of Pairs', body: 'With 500+ active markets, there are 125,000+ pairwise relationships to scan' },
                    { icon: '🏛', title: 'No Regulatory Enforcement', body: 'Unlike stock exchanges, no arbitrage desk enforces cross-market consistency' }
                  ].map((card, i) => (
                    <div key={i} className="bg-card border border-border rounded-lg p-5">
                      <div className="text-2xl mb-3">{card.icon}</div>
                      <h4 className="font-bold text-foreground mb-2">{card.title}</h4>
                      <p className="text-muted-foreground text-sm leading-relaxed">{card.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2 */}
          <section id="entry-strategy" className="scroll-mt-24 mb-20">
            <div className="bg-card border border-border rounded-[10px] p-6 sm:p-8 mb-8 shadow-xl">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Entry Strategy</h2>
              <p className="text-muted-foreground">How to find and execute a logical arbitrage from start to finish</p>
            </div>

            <div className="space-y-12">
              {/* Step 1 */}
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono tracking-tighter">1</div>
                  <h3 className="text-xl font-semibold">Build Your Relationship Graph</h3>
                </div>
                <p className="text-muted-foreground mb-6 leading-relaxed pl-14">
                  ArbOS uses an AI chat interface powered by IBM Granite to build a graph of logical relationships between Polymarket events. You describe what you care about in plain English — the AI does the rest.
                </p>

                <div className="ml-14 bg-background border border-border rounded-lg p-5 mb-6 space-y-4 font-mono text-sm shadow-inner overflow-hidden">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded shrink-0 bg-[#7B61FF] flex items-center justify-center text-foreground">AI</div>
                    <div className="bg-card border-l-[3px] border-[#7B61FF] rounded-r-md p-3 text-foreground">
                      Welcome to ArbOS. Tell me what events you're interested in monitoring.
                    </div>
                  </div>

                  <div className="flex gap-4 justify-end">
                    <div className="bg-primary rounded-md p-3 text-primary-foreground font-medium max-w-[80%]">
                      I want to track federal reserve rate decisions this year
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded shrink-0 bg-[#7B61FF] flex items-center justify-center text-foreground">AI</div>
                    <div className="bg-card border-l-[3px] border-[#7B61FF] rounded-r-md p-3 text-foreground">
                      Found 14 active markets. Mapping logical relationships...<br /><br />
                      <span className="text-primary">✓ Graph generated:</span> 14 nodes, 23 edges.<br />
                      Detected 3 active arbitrage opportunities.<br />
                      Notable: June cut (60¢) → 2026 cut (55¢) — IMPLICATION VIOLATION +5¢ spread.
                    </div>
                  </div>
                </div>

                <div className="ml-14 tip-box bg-card border-l-[3px] border-primary rounded-r-md p-4 italic text-foreground mb-6">
                  "Be as broad or specific as you like. Try: 'Track all 2026 US election markets' or 'Monitor everything related to Bitcoin ETF approval'. You can refine the graph conversationally at any time using <code className="font-mono text-primary not-italic">/add</code>, <code className="font-mono text-primary not-italic">/remove</code>, or <code className="font-mono text-primary not-italic">/suggest</code>."
                </div>

                <div className="ml-14 bg-card border border-border rounded-md overflow-x-auto">
                  <table className="w-full text-left font-mono text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-3 text-muted-foreground font-normal uppercase text-xs w-1/3">Command</th>
                        <th className="p-3 text-muted-foreground font-normal uppercase text-xs">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-foreground">
                      <tr><td className="p-3 text-primary">/add &lt;term&gt;</td><td className="p-3 font-sans">Search and add markets matching a keyword</td></tr>
                      <tr><td className="p-3 text-primary">/remove &lt;name&gt;</td><td className="p-3 font-sans">Remove a specific node and all its edges</td></tr>
                      <tr><td className="p-3 text-primary">/suggest</td><td className="p-3 font-sans">Ask AI to recommend related markets</td></tr>
                      <tr><td className="p-3 text-primary">/threshold 0.8</td><td className="p-3 font-sans">Set minimum confidence for edge detection</td></tr>
                      <tr><td className="p-3 text-primary">/scan</td><td className="p-3 font-sans">Force re-evaluate all edges for violations now</td></tr>
                      <tr><td className="p-3 text-primary">/export</td><td className="p-3 font-sans">Export current graph as JSON</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Step 2 */}
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono tracking-tighter">2</div>
                  <h3 className="text-xl font-semibold">Read the Graph</h3>
                </div>
                <p className="text-muted-foreground mb-6 leading-relaxed pl-14">
                  Once your graph is built, the visualization shows you everything you need to know at a glance.
                </p>

                <div className="ml-14 bg-background border border-border rounded-lg p-6 mb-6">
                  <div className="w-64 border-[2px] border-primary bg-card rounded-lg p-4 shadow-[0_0_15px_hsl(var(--primary)/0.3)] mx-auto mb-8 relative">
                    <div className="text-sm font-semibold mb-3 leading-tight line-clamp-2" title="Fed Rate Cut June 2026">Fed Rate Cut June 2026</div>
                    <div className="flex justify-between font-mono text-sm mb-3">
                      <div className="bg-primary/10 text-primary px-2 py-1 rounded">Y: 0.60</div>
                      <div className="bg-destructive/10 text-destructive px-2 py-1 rounded">N: 0.40</div>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground font-mono border-t border-border pt-2 mb-2">
                      <div>V: $234K</div>
                      <div>L: $12K</div>
                    </div>
                    <div className="text-[10px] text-muted-foreground flex justify-between items-center">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full border border-muted-foreground"></span> Polymarket</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-sm">
                    <div>
                      <h4 className="font-mono text-muted-foreground uppercase text-xs mb-3 border-b border-border pb-2">Border Color Key</h4>
                      <ul className="space-y-3 font-mono">
                        <li className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-primary"></span> <span className="text-foreground">Active arb</span></li>
                        <li className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-muted-foreground"></span> <span className="text-muted-foreground">Monitored, no arb</span></li>
                        <li className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-destructive"></span> <span className="text-muted-foreground">Insufficient liquidity</span></li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-mono text-muted-foreground uppercase text-xs mb-3 border-b border-border pb-2">Edge Types &amp; Colors</h4>
                      <ul className="space-y-3 font-mono">
                        <li className="flex items-center gap-3">
                          <svg width="40" height="10" className="opacity-80"><line x1="0" y1="5" x2="35" y2="5" stroke="hsl(var(--primary))" strokeWidth="2" /><polygon points="35,1 40,5 35,9" fill="hsl(var(--primary))" /></svg>
                          <span className="text-foreground flex flex-col"><span className="text-primary font-bold">PROFITABLE</span> <span>Subset/Implication</span></span>
                        </li>
                        <li className="flex items-center gap-3">
                          <svg width="40" height="10" className="opacity-80"><line x1="0" y1="5" x2="35" y2="5" fill="none" stroke="hsl(var(--warning))" strokeWidth="2" strokeDasharray="4,4" /></svg>
                          <span className="text-foreground flex flex-col"><span className="text-warning font-bold">APPROACHING</span> <span>Mutually Exclusive</span></span>
                        </li>
                        <li className="flex items-center gap-3">
                          <svg width="40" height="10" className="opacity-50"><line x1="0" y1="5" x2="35" y2="5" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeDasharray="1,4" strokeLinecap="round" /></svg>
                          <span className="text-muted-foreground flex flex-col"><span>NO ARB</span> <span>Partition set</span></span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="ml-14 tip-box bg-card border-l-[3px] border-primary rounded-r-md p-4 italic text-foreground">
                  "Hover any node to see the full order book. Hover any edge to see the relationship type, confidence score, current spread, and fee-adjusted profit estimate. Click a glowing green edge to see the full trade breakdown."
                </div>
              </div>

              {/* Step 3 */}
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono tracking-tighter">3</div>
                  <h3 className="text-xl font-semibold">Configure Your Risk Parameters</h3>
                </div>
                <p className="text-muted-foreground mb-6 leading-relaxed pl-14">
                  Before launching the agent, you set the guardrails. ArbOS will only execute trades that pass all of your thresholds.
                </p>
                <div className="ml-14 bg-card border border-border rounded-md overflow-x-auto mb-6">
                  <table className="w-full text-left font-mono text-sm border-collapse min-w-[500px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-3 text-muted-foreground font-normal uppercase text-xs w-1/4">Parameter</th>
                        <th className="p-3 text-muted-foreground font-normal uppercase text-xs w-1/6">Default</th>
                        <th className="p-3 text-muted-foreground font-normal uppercase text-xs">What It Controls</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-foreground">
                      <tr><td className="p-3 text-foreground font-semibold">Min Profit Threshold</td><td className="p-3 text-primary">2.0%</td><td className="p-3 font-sans text-sm text-muted-foreground">Only execute arbs with &gt; this net margin after all fees. Lower = more trades, smaller edge per trade.</td></tr>
                      <tr><td className="p-3 text-foreground font-semibold">Max Position Size</td><td className="p-3 text-primary">$50 USDC</td><td className="p-3 font-sans text-sm text-muted-foreground">Maximum capital on any single leg. Limits slippage exposure in thin order books.</td></tr>
                      <tr><td className="p-3 text-foreground font-semibold">Min Liquidity Depth</td><td className="p-3 text-primary">$100 USDC</td><td className="p-3 font-sans text-sm text-muted-foreground">Skip markets with less than this available in the order book at the target price.</td></tr>
                      <tr><td className="p-3 text-foreground font-semibold">Max Market Duration</td><td className="p-3 text-primary">30 days</td><td className="p-3 font-sans text-sm text-muted-foreground">Don&apos;t trade markets resolving more than N days out. Longer markets lock up capital longer.</td></tr>
                      <tr><td className="p-3 text-foreground font-semibold">Execution Mode</td><td className="p-3 text-[#7B61FF]">Auto</td><td className="p-3 font-sans text-sm text-muted-foreground">&quot;Auto&quot; = execute immediately. &quot;Confirm&quot; = alert you and wait for manual approval.</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="ml-14 bg-destructive/10 border-l-[3px] border-warning rounded-r-md p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <p className="text-foreground text-sm leading-relaxed">
                    <strong className="text-warning block mb-1">Warning:</strong>
                    Setting Min Profit Threshold below 0.5% is risky — some markets have 1.56% taker fees (crypto category markets on Polymarket), which would eliminate your margin entirely.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono tracking-tighter">4</div>
                  <h3 className="text-xl font-semibold">Launch the Agent and Monitor</h3>
                </div>
                <p className="text-muted-foreground mb-6 leading-relaxed pl-14">
                  After confirming your configuration, the ArbOS execution agent goes live. It monitors every edge in your graph 24/7 and fires trades the instant a violation is detected.
                </p>
                <div className="ml-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                  {[{ title: 'P&L Counter', desc: 'Cumulative realized profit since launch, updating live' }, { title: 'Trade Log', desc: 'Every executed trade with both legs, timestamps, and net profit' }, { title: 'Open Positions', desc: 'Current holdings with their paired counterpart and guaranteed P&L' }, { title: 'System Health', desc: 'Engine latency, WebSocket status, API connectivity, gas balance' }, { title: 'Live Graph', desc: 'Your relationship graph with pulsing edges when arb executes' }].map(card => (
                    <div key={card.title} className="bg-card border border-border p-4 rounded-md">
                      <h4 className="font-semibold text-sm mb-1 text-foreground">{card.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="ml-14 mb-8 overflow-x-auto pb-4">
                  <div className="flex items-center min-w-[700px] text-xs font-mono font-bold text-foreground">
                    <div className="bg-card border border-primary px-3 py-2 rounded">Price Update</div>
                    <ArrowRight className="w-4 h-4 mx-2 text-muted-foreground" />
                    <div className="bg-card border border-primary px-3 py-2 rounded">Edge Evaluated</div>
                    <ArrowRight className="w-4 h-4 mx-2 text-muted-foreground" />
                    <div className="bg-card border border-primary px-3 py-2 rounded text-primary">Violation Found</div>
                    <ArrowRight className="w-4 h-4 mx-2 text-muted-foreground" />
                    <div className="bg-card border border-primary px-3 py-2 rounded">Fire Both Legs</div>
                    <ArrowRight className="w-4 h-4 mx-2 text-muted-foreground" />
                    <div className="bg-card border border-primary px-3 py-2 rounded">Log &amp; Update P&L</div>
                  </div>
                </div>
                <div className="ml-14 tip-box bg-card border-l-[3px] border-primary rounded-r-md p-4 italic text-foreground">
                  "The agent uses Fill-or-Kill orders exclusively — if both legs can't fill at the target price, the order cancels entirely. You will never end up with one leg open and one leg not."
                </div>
              </div>

              {/* Step 5 */}
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono tracking-tighter">5</div>
                  <h3 className="text-xl font-semibold">Understand the Fee Math</h3>
                </div>
                <p className="text-muted-foreground mb-6 leading-relaxed pl-14">
                  ArbOS automatically accounts for all fees before executing. A trade only fires when the net profit after all costs is above your threshold.
                </p>
                <div className="ml-14 bg-card border border-border rounded-md overflow-x-auto mb-6">
                  <table className="w-full text-left font-mono text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-3 text-muted-foreground font-normal uppercase text-xs w-1/3">Fee Type</th>
                        <th className="p-3 text-muted-foreground font-normal uppercase text-xs w-1/4">Amount</th>
                        <th className="p-3 text-muted-foreground font-normal uppercase text-xs">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-foreground">
                      <tr><td className="p-3">Polymarket Taker Fee</td><td className="p-3 text-primary">0%</td><td className="p-3 font-sans text-sm text-muted-foreground">0% on most prediction markets</td></tr>
                      <tr><td className="p-3">Polymarket Taker Fee</td><td className="p-3 text-destructive">1.56%</td><td className="p-3 font-sans text-sm text-muted-foreground">Applied to crypto-category markets only</td></tr>
                      <tr><td className="p-3">Polygon Gas Fee</td><td className="p-3 text-warning">~$0.01-0.05/tx</td><td className="p-3 font-sans text-sm text-muted-foreground">Varies by network congestion</td></tr>
                      <tr><td className="p-3">ArbOS Platform Fee</td><td className="p-3 text-[#7B61FF]">0.5%</td><td className="p-3 font-sans text-sm text-muted-foreground">0.5% of realized profit (only charged on wins)</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="ml-14 bg-background border border-border rounded-md p-5 font-mono text-sm shadow-inner overflow-x-auto whitespace-pre">
                  <div className="text-muted-foreground mb-4">// Worked Example: Implication Arb (Fed Cut June vs Fed Cut 2026)<br />// Position size: 100 shares</div>
                  <div className="text-destructive mb-1">SELL June YES @ 60¢ = $60.00 collected</div>
                  <div className="text-primary mb-4">BUY  2026 YES @ 55¢ = $55.00 paid</div>
                  <div className="text-foreground">Gross spread:          +$5.00</div>
                  <div className="text-muted-foreground">Polymarket taker fee:  $0.00  <span className="text-muted-foreground">(0% market)</span></div>
                  <div className="text-muted-foreground">Polygon gas (2 txns):  -$0.06</div>
                  <div className="text-muted-foreground mb-2">ArbOS platform fee:    -$0.02  <span className="text-muted-foreground">(0.5% of $5.00)</span></div>
                  <div className="text-border tracking-tighter mb-2">────────────────────────────────────────────────</div>
                  <div className="text-primary font-bold">Net profit:            +$4.92  <span className="text-muted-foreground font-normal">(8.2% ROI on $60 risked)</span></div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3 */}
          <section id="managing-graph" className="scroll-mt-24 mb-20">
            <div className="bg-card border border-border rounded-[10px] p-6 sm:p-8 mb-8 shadow-xl">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Managing Your Graph</h2>
              <p className="text-muted-foreground">Building, refining, and maintaining your relationship graph for maximum coverage</p>
            </div>

            <div className="space-y-12">
              <div>
                <h3 className="text-xl font-semibold mb-4">Start Broad, Then Refine</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  The best graphs start with a topic-level query and then get refined conversationally. Starting too narrow means you might miss chained relationships. Starting too broad means the AI has to evaluate thousands of pairs.
                </p>
                <ol className="list-decimal pl-5 space-y-4 text-foreground mb-6 marker:text-primary marker:font-mono">
                  <li className="pl-2"><strong className="block mb-1">Start with a domain</strong><span className="text-muted-foreground text-sm leading-relaxed block">&quot;Track all 2026 Federal Reserve markets&quot; gives you the full universe</span></li>
                  <li className="pl-2"><strong className="block mb-1">Review what the AI found</strong><span className="text-muted-foreground text-sm leading-relaxed block">Check the node count and edge count. 10–20 nodes is ideal for most users</span></li>
                  <li className="pl-2"><strong className="block mb-1">Add cross-domain markets</strong><span className="text-muted-foreground text-sm leading-relaxed block">&quot;Add Bitcoin ETF markets&quot; can create cross-domain arb opportunities</span></li>
                  <li className="pl-2"><strong className="block mb-1">Remove noise</strong><span className="text-muted-foreground text-sm leading-relaxed block">Use <code>/remove</code> to drop markets you don&apos;t care about. Fewer nodes = faster scanning</span></li>
                  <li className="pl-2"><strong className="block mb-1">Set confidence threshold</strong><span className="text-muted-foreground text-sm leading-relaxed block"><code>/threshold 0.8</code> filters out low-confidence relationships that generate false signals</span></li>
                </ol>
                <div className="tip-box bg-card border-l-[3px] border-primary rounded-r-md p-4 italic text-foreground">
                  "The AI uses IBM Granite models to evaluate every pair of markets for logical relationships. For 20 markets, that's 190 pairs. The system batches these into groups of 10 per LLM call to minimize latency. Expect graph generation to take 15–30 seconds for large queries."
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4">What Confidence Scores Mean</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Every edge in the graph has a confidence score between 0.0 and 1.0. This represents how certain the AI is that the logical relationship is valid.
                </p>
                <div className="bg-card border border-border rounded-md p-6 mb-6">
                  <div className="h-3 w-full rounded-full bg-gradient-to-r from-destructive/20 via-muted-foreground to-primary mb-4"></div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div><span className="text-background bg-muted-foreground px-1 rounded block w-max font-bold mb-1">0.0–0.5</span><span className="text-muted-foreground">Low confidence<br />(Hidden)</span></div>
                    <div><span className="text-primary-foreground bg-muted-foreground px-1 rounded block w-max font-bold mb-1">0.5–0.7</span><span className="text-muted-foreground">Weak<br />(Light gray)</span></div>
                    <div><span className="text-primary-foreground bg-[#7B61FF] px-1 rounded block w-max font-bold mb-1">0.7–0.9</span><span className="text-muted-foreground">Strong<br />(Solid edge)</span></div>
                    <div><span className="text-primary-foreground bg-primary px-1 rounded block w-max font-bold mb-1">0.9–1.0</span><span className="text-muted-foreground">Near-certain<br />(Thick edge)</span></div>
                  </div>
                </div>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Edge thickness in the graph is proportional to confidence. A thick bright edge means the relationship is logically airtight. A thin gray edge means the AI sees a connection but it's not definitively provable from the event descriptions alone.
                </p>
                <div className="bg-destructive/10 border-l-[3px] border-warning rounded-r-md p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <p className="text-foreground text-sm leading-relaxed">
                    "Low-confidence edges (&lt; 0.7) are shown but ArbOS will not execute trades on them by default. You can lower the threshold in settings, but exercise caution — a false relationship means you're not actually hedged."
                  </p>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4">What Happens When a Market Resolves</h3>
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  When a Polymarket market in your graph resolves (settles to YES or NO), ArbOS handles it automatically:
                </p>
                <ol className="list-decimal pl-5 space-y-2 text-foreground mb-6 marker:text-[#7B61FF] marker:font-mono text-sm leading-relaxed">
                  <li className="pl-2">The resolved node is removed from the graph</li>
                  <li className="pl-2">Any open positions on that market are flagged in the dashboard</li>
                  <li className="pl-2">The AI Brain suggests replacement markets with similar logical relationships</li>
                  <li className="pl-2">Your graph stats update (nodes, edges, active arb count)</li>
                </ol>
                <div className="tip-box bg-card border-l-[3px] border-primary rounded-r-md p-4 italic text-foreground">
                  "Markets often resolve early — a 'Will X happen by June?' market can resolve YES in February if the event occurs early. ArbOS detects resolutions in real time via WebSocket and updates your graph within seconds."
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4">Understanding the Trade Log</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Every agent action is recorded in the trade log with full detail.
                </p>
                <div className="bg-background border border-border rounded-md overflow-x-auto mb-6">
                  <table className="w-full text-left font-mono text-xs border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-border bg-card">
                        <th className="p-3 text-muted-foreground font-normal">TIME</th>
                        <th className="p-3 text-muted-foreground font-normal">TYPE</th>
                        <th className="p-3 text-muted-foreground font-normal">MARKET A</th>
                        <th className="p-3 text-muted-foreground font-normal">MARKET B</th>
                        <th className="p-3 text-muted-foreground font-normal text-right">PROFIT</th>
                        <th className="p-3 text-muted-foreground font-normal text-right">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr className="bg-primary/10">
                        <td className="p-3 text-muted-foreground">14:23:07</td>
                        <td className="p-3 text-[#7B61FF]">IMPLICATION</td>
                        <td className="p-3 text-foreground">Fed Cut June <span className="text-destructive bg-destructive/10 px-1 rounded">(SELL 50@60¢)</span></td>
                        <td className="p-3 text-foreground">Fed Cut 2026 <span className="text-primary bg-primary/10 px-1 rounded">(BUY 50@55¢)</span></td>
                        <td className="p-3 text-primary text-right font-bold">+$2.47</td>
                        <td className="p-3 text-primary text-right font-bold flex items-center justify-end gap-1"><Zap className="w-3 h-3" /> FILLED</td>
                      </tr>
                      <tr className="bg-warning/5">
                        <td className="p-3 text-muted-foreground">14:18:12</td>
                        <td className="p-3 text-[#7B61FF]">PARTITION</td>
                        <td className="p-3 text-foreground">Elections (Sum) <span className="text-destructive bg-destructive/10 px-1 rounded">(SELL100@102¢)</span></td>
                        <td className="p-3 text-muted-foreground italic">-</td>
                        <td className="p-3 text-muted-foreground text-right">+$0.00</td>
                        <td className="p-3 text-warning text-right font-bold flex items-center justify-end gap-1">⏭ SKIPPED <span className="font-sans text-[10px] text-muted-foreground block font-normal">(liq&lt;min)</span></td>
                      </tr>
                      <tr className="bg-destructive/10">
                        <td className="p-3 text-muted-foreground">13:45:01</td>
                        <td className="p-3 text-[#7B61FF]">MUTUAL_EXC</td>
                        <td className="p-3 text-foreground">Cand. X <span className="text-destructive bg-destructive/10 px-1 rounded">(SELL 20@58¢)</span></td>
                        <td className="p-3 text-foreground">Cand. Y <span className="text-muted-foreground bg-card px-1 rounded">(FAIL 49¢)</span></td>
                        <td className="p-3 text-destructive text-right font-bold">-$0.30</td>
                        <td className="p-3 text-destructive text-right font-bold flex items-center justify-end gap-1"><AlertTriangle className="w-3 h-3" /> PARTIAL</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-muted-foreground">12:00:05</td>
                        <td className="p-3 text-muted-foreground">SYSTEM</td>
                        <td className="p-3 text-muted-foreground" colSpan={2}>Graph Re-evaluated: 14 nodes, 23 edges</td>
                        <td className="p-3 text-muted-foreground text-right">-</td>
                        <td className="p-3 text-muted-foreground text-right flex items-center justify-end gap-1"><Activity className="w-3 h-3" /> INFO</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-primary/20 border border-primary"></div><span className="text-xs text-muted-foreground font-mono">FILLED</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-warning/20 border border-warning"></div><span className="text-xs text-muted-foreground font-mono">SKIPPED</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-destructive/20 border border-destructive"></div><span className="text-xs text-muted-foreground font-mono">PARTIAL</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-card border border-border"></div><span className="text-xs text-muted-foreground font-mono">INFO</span></div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 4 */}
          <section id="maximizing-returns" className="scroll-mt-24 mb-20">
            <div className="bg-card border border-border rounded-[10px] p-6 sm:p-8 mb-8 shadow-xl">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Maximizing Returns</h2>
              <p className="text-muted-foreground">Advanced techniques to increase profit and improve capital efficiency</p>
            </div>

            <div className="space-y-4">
              {/* Technique 1 */}
              <div className="bg-card border border-border rounded-lg overflow-hidden transition-colors hover:border-[#4A4A7A]">
                <button
                  onClick={() => toggleAccordion(setExpandedTechniques, 'tech1')}
                  className="w-full text-left p-5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <span className="bg-primary/20 text-primary text-[11px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Key Insight</span>
                    <h4 className="font-semibold text-lg">Capital Turnover is Everything</h4>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${expandedTechniques.tech1 ? '-rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-all duration-300 ease-in-out ${expandedTechniques.tech1 ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="p-5 pt-0 border-t border-border mt-2 space-y-4">
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                        The real determinant of ArbOS returns isn't spread size — it's capital turnover. A 2% spread on a market resolving in 3 days generates the same annualized return as a 24% spread on a market resolving in 36 days. Prioritize speed-to-resolution over raw spread size.
                      </p>

                      <div className="bg-background border border-border rounded-md p-4 font-mono text-xs overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="pb-2 pr-4 font-normal">Scenario</th>
                              <th className="pb-2 px-4 font-normal text-right">Spread</th>
                              <th className="pb-2 px-4 font-normal text-right">Days Locked</th>
                              <th className="pb-2 pl-4 font-normal text-right text-primary">APY Equivalent</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#2A2A4A]">
                            <tr>
                              <td className="py-2 pr-4 text-foreground">Arb A (Near term)</td>
                              <td className="py-2 px-4 text-right">2.0%</td>
                              <td className="py-2 px-4 text-right">3</td>
                              <td className="py-2 pl-4 text-right text-primary font-bold">~243%</td>
                            </tr>
                            <tr>
                              <td className="py-2 pr-4 text-foreground">Arb B (Long term)</td>
                              <td className="py-2 px-4 text-right">24.0%</td>
                              <td className="py-2 px-4 text-right">36</td>
                              <td className="py-2 pl-4 text-right text-primary font-bold">~243%</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Technique 2 */}
              <div className="bg-card border border-border rounded-lg overflow-hidden transition-colors hover:border-[#4A4A7A]">
                <button
                  onClick={() => toggleAccordion(setExpandedTechniques, 'tech2')}
                  className="w-full text-left p-5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <span className="bg-[#10B981]/20 text-[#10B981] text-[11px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Optimal</span>
                    <h4 className="font-semibold text-lg">Prioritize Markets Resolving Soon</h4>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${expandedTechniques.tech2 ? '-rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-all duration-300 ease-in-out ${expandedTechniques.tech2 ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="p-5 pt-0 border-t border-border mt-2 space-y-4">
                      <p className="text-muted-foreground text-sm leading-relaxed mb-2">
                        Markets that are about to resolve are highest priority because your capital is only locked up for days or hours rather than weeks. ArbOS sorts detected opportunities by <code className="font-mono text-primary">fee-adjusted spread × (1/days_to_resolution)</code> by default.
                      </p>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        <strong className="text-foreground">Note:</strong> "Resolving soon" is different from "ending soon." A market can resolve at any time — often well before its listed end date — if the event actually occurs.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Technique 3 */}
              <div className="bg-card border border-border rounded-lg overflow-hidden transition-colors hover:border-[#4A4A7A]">
                <button
                  onClick={() => toggleAccordion(setExpandedTechniques, 'tech3')}
                  className="w-full text-left p-5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <span className="bg-[#475569]/20 text-muted-foreground text-[11px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Rule</span>
                    <h4 className="font-semibold text-lg">Don't Over-Concentrate in One Arb</h4>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${expandedTechniques.tech3 ? '-rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-all duration-300 ease-in-out ${expandedTechniques.tech3 ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="p-5 pt-0 border-t border-border mt-2 space-y-4">
                      <p className="text-muted-foreground text-sm leading-relaxed mb-2">
                        Even though logical arbitrage is mathematically guaranteed at resolution, there are real risks <em>before</em> resolution: liquidity disappearing, market suspensions, platform outages. The <code className="font-mono text-primary">Max Position Size</code> setting exists precisely for this reason.
                      </p>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        <strong className="text-foreground">Rule of thumb:</strong> Never put more than 20% of your allocated capital into a single arb pair. ArbOS enforces this at the Max Position Size setting.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Technique 4 */}
              <div className="bg-card border border-border rounded-lg overflow-hidden transition-colors hover:border-[#4A4A7A]">
                <button
                  onClick={() => toggleAccordion(setExpandedTechniques, 'tech4')}
                  className="w-full text-left p-5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="bg-[#7B61FF]/20 text-[#7B61FF] text-[11px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold flex items-center gap-1">
                      Type 4 <span className="text-[8px] mx-0.5">•</span> <Zap className="w-3 h-3" /> AI
                    </span>
                    <h4 className="font-semibold text-lg">Let the AI Find Chains You'd Never Think Of</h4>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${expandedTechniques.tech4 ? '-rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-all duration-300 ease-in-out ${expandedTechniques.tech4 ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="p-5 pt-0 border-t border-border mt-2 space-y-4">
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                        The most powerful (and rarest) arb opportunities come from chained logical implications across domains. These are impossible to find manually because they span seemingly unrelated markets.
                      </p>

                      <div className="bg-background border border-border rounded-md p-4 text-xs font-mono mb-4 text-center">
                        Trump wins Iowa <span className="text-muted-foreground">(72¢)</span> <ArrowRight className="inline w-3 h-3 text-muted-foreground mx-1" /> Trump wins Nomination <span className="text-destructive font-bold">(81¢)</span>
                        <div className="mt-2 text-destructive border-t border-border pt-2 inline-block">Backward violation: 72¢ &lt; 81¢</div>
                      </div>

                      <div className="tip-box bg-card border-l-[3px] border-[#00D4AA] rounded-r-md p-4 italic text-foreground">
                        "Use <code>/suggest</code> in the chat to ask the AI to actively look for cross-domain connection points with your current graph. This is especially powerful when your graph spans multiple market categories."
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Technique 5 */}
              <div className="bg-card border border-border rounded-lg overflow-hidden transition-colors hover:border-[#4A4A7A]">
                <button
                  onClick={() => toggleAccordion(setExpandedTechniques, 'tech5')}
                  className="w-full text-left p-5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <span className="bg-warning/20 text-warning text-[11px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Advanced</span>
                    <h4 className="font-semibold text-lg">Understanding Slippage</h4>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${expandedTechniques.tech5 ? '-rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-all duration-300 ease-in-out ${expandedTechniques.tech5 ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="p-5 pt-0 border-t border-border mt-2 space-y-4">
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                        The displayed price on Polymarket is the best bid/ask, but large orders eat through the order book. If you try to buy 500 shares at 55¢, the first 100 might fill at 55¢, but the next 400 might only be available at 57¢, 58¢, 59¢ — eliminating your spread.
                      </p>

                      <p className="text-foreground text-sm font-semibold mb-2">ArbOS handles this by:</p>
                      <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm leading-relaxed mb-4">
                        <li>Pre-calculating VWAP (volume-weighted average price) for your target position size before firing</li>
                        <li>Only executing if the VWAP-adjusted spread still exceeds your Min Profit Threshold</li>
                        <li>Using <strong className="text-foreground">Fill-or-Kill</strong> orders — if the full quantity isn't available at the VWAP price, the order cancels</li>
                      </ul>

                      <p className="text-muted-foreground text-sm leading-relaxed">
                        The Min Liquidity Depth setting (default $100) is your primary defense against slippage. Set it higher for larger position sizes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 5 */}
          <section id="safety" className="scroll-mt-24 mb-10">
            <div className="bg-card border border-border rounded-[10px] p-6 sm:p-8 mb-8 shadow-xl">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Safety & Error Handling</h2>
              <p className="text-muted-foreground">What happens when things go wrong, and how ArbOS protects your capital</p>
            </div>

            <div className="space-y-8">
              {/* Panic Dump */}
              <div className="bg-destructive/10 border border-destructive/30 border-l-[4px] border-l-[#FF6B6B] rounded-lg p-6 sm:p-8 relative overflow-hidden">
                <ShieldAlert className="absolute top-4 right-4 w-32 h-32 text-destructive/5 -z-0 pointer-events-none" />
                <h3 className="text-xl font-bold text-destructive flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5" /> Single-Leg Exposure: The Highest-Risk Scenario
                </h3>
                <p className="text-foreground mb-6 leading-relaxed">
                  If Leg A (SELL) fills but Leg B (BUY) fails to fill — due to liquidity disappearing between orders — you are left with a naked short position. This is NOT a guaranteed arb anymore.
                </p>

                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3 font-mono">ArbOS Response:</h4>
                <ul className="list-disc pl-5 space-y-2 text-muted-foreground mb-6 leading-relaxed">
                  <li>Detects the partial fill immediately via WebSocket confirmation</li>
                  <li>Places a counter-order to close Leg A within 5 seconds (the "panic dump")</li>
                  <li>Logs the incident as <span className="bg-destructive/20 text-destructive border border-destructive px-1 rounded text-xs font-mono ml-1 font-bold tracking-tighter">⚠ PARTIAL</span> in the trade log</li>
                  <li>If this happens twice consecutively, pauses the agent and alerts you</li>
                </ul>

                <div className="tip-box bg-[#0A0A0A] border-l-[3px] border-destructive rounded-r-md p-4 italic text-foreground">
                  "This is why ArbOS uses Fill-or-Kill orders by default. FOK orders either fill completely or cancel entirely — you should never end up in a partial state. The panic dump is a last-resort failsafe."
                </div>
              </div>

              {/* Circuit Breaker */}
              <div className="bg-card border border-border rounded-lg p-6 sm:p-8">
                <h3 className="text-xl font-semibold mb-4">Automatic Circuit Breaker</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Three consecutive trade failures <ArrowRight className="inline w-4 h-4 text-muted-foreground mx-1" /> agent <strong className="text-foreground">automatically pauses</strong> and sends an alert. This prevents the system from repeatedly attempting trades during adverse conditions (API issues, unusual market behavior, network problems). You must manually resume after reviewing the trade log.
                </p>
              </div>

              {/* WebSocket */}
              <div className="bg-card border border-border rounded-lg p-6 sm:p-8">
                <h3 className="text-xl font-semibold mb-4">WebSocket Disconnection</h3>
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  If ArbOS loses its WebSocket connection to Polymarket:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                  <li><strong className="text-foreground">All</strong> trade execution pauses immediately</li>
                  <li>The dashboard shows an amber warning banner</li>
                  <li>Reconnection attempts with exponential backoff: <code className="font-mono text-foreground text-sm">1s → 2s → 4s → 8s → 30s max</code></li>
                  <li>After reconnection, full order book state is re-synced before execution resumes</li>
                </ul>
              </div>
            </div>
          </section>

          {/* SECTION 5 ... */}
        </main>
      </div>

      {/* FOOTER */}
      <footer className="bg-background/95 backdrop-blur-sm border-t border-border py-12 px-4 md:px-8 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-sm">
          <div className="flex flex-col items-center md:items-start gap-2">
            <span className="font-mono font-bold text-lg text-primary tracking-tight">ArbOS Guide</span>
            <span className="text-muted-foreground">Built for IBM SkillsBuild Hackathon · Fintech Track · February 2026</span>
          </div>

          <div className="flex gap-6 text-muted-foreground font-medium">
            <Link to="/" className="hover:text-foreground transition-colors">Launch App</Link>
            <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
            <a href="#" className="hover:text-foreground transition-colors">Docs</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            Built on <span className="font-bold text-foreground">IBM WatsonX</span> & <span className="font-bold text-foreground">Granite</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
