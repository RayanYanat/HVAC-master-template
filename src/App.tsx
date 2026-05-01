import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue, useAnimationFrame } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────
// Colour palette & interpolation
// ─────────────────────────────────────────────────────────────────────
// scroll 0 → 1 maps hot → cold
// We define colour stops at scroll positions 0, 0.2, 0.45, 0.7, 1.0

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

const STOPS: Array<{ pos: number; bg: string; text: string }> = [
  { pos: 0,    bg: '#1a0600', text: '#fff2e0' },
  { pos: 0.18, bg: '#1a0a00', text: '#fff0d5' },
  { pos: 0.38, bg: '#0d1218', text: '#e8f4f8' },
  { pos: 0.60, bg: '#041220', text: '#d6eeff' },
  { pos: 0.80, bg: '#030e1c', text: '#cce8ff' },
  { pos: 1.00, bg: '#020b18', text: '#c8e8ff' },
];

function interpolateStops(p: number, key: 'bg' | 'text'): string {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    if (p >= a.pos && p <= b.pos) {
      const t = (p - a.pos) / (b.pos - a.pos);
      return lerpColor(a[key], b[key], t);
    }
  }
  return STOPS[STOPS.length - 1][key];
}

// ─────────────────────────────────────────────────────────────────────
// Global scroll progress context
// ─────────────────────────────────────────────────────────────────────
function usePageScroll() {
  const { scrollYProgress } = useScroll();
  return useSpring(scrollYProgress, { stiffness: 60, damping: 20, restDelta: 0.001 });
}

// ─────────────────────────────────────────────────────────────────────
// Fixed full-page background — reacts to scroll colour
// ─────────────────────────────────────────────────────────────────────
function ScrollBackground({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const [color, setColor] = useState(STOPS[0].bg);

  useEffect(() => {
    return progress.on('change', (v) => setColor(interpolateStops(v, 'bg')));
  }, [progress]);

  return (
    <div
      className="fixed inset-0 -z-10 transition-none"
      style={{ background: color }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Ambient orb — huge blurred blob that drifts with scroll colour
// ─────────────────────────────────────────────────────────────────────
const ORB_COLORS = [
  { pos: 0,    color: 'rgba(255,90,0,0.22)' },
  { pos: 0.2,  color: 'rgba(200,60,0,0.18)' },
  { pos: 0.45, color: 'rgba(0,100,140,0.15)' },
  { pos: 0.7,  color: 'rgba(0,120,200,0.18)' },
  { pos: 1.0,  color: 'rgba(14,120,220,0.20)' },
];
function interpolateOrb(p: number): string {
  for (let i = 0; i < ORB_COLORS.length - 1; i++) {
    const a = ORB_COLORS[i], b = ORB_COLORS[i + 1];
    if (p >= a.pos && p <= b.pos) {
      const t = (p - a.pos) / (b.pos - a.pos);
      return lerpColor(a.color.replace(/rgba?\(/,'rgb(').replace(/,[^,)]+\)/,')'),
                       b.color.replace(/rgba?\(/,'rgb(').replace(/,[^,)]+\)/,')'), t);
    }
  }
  return ORB_COLORS[ORB_COLORS.length - 1].color;
}

function AmbientOrb({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const y = useTransform(progress, [0, 1], ['10%', '75%']);
  const x = useTransform(progress, [0, 0.5, 1], ['20%', '50%', '65%']);
  const [orbColor, setOrbColor] = useState('rgba(255,90,0,0.22)');

  useEffect(() => {
    return progress.on('change', (v) => setOrbColor(interpolateOrb(v)));
  }, [progress]);

  return (
    <motion.div
      className="fixed -z-10 rounded-full pointer-events-none blur-3xl"
      style={{
        width: 700, height: 700,
        top: y, left: x,
        translateX: '-50%', translateY: '-50%',
        background: `radial-gradient(circle, ${orbColor} 0%, transparent 70%)`,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Particles — rendered once, direction & colour morph via progress
// ─────────────────────────────────────────────────────────────────────
interface PData { id: number; cx: number; cy: number; size: number; delay: number; dur: number; tx: number; ty: number; }

function Particles({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const count = 28;
  const items: PData[] = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    cx: Math.random() * 100,
    cy: 30 + Math.random() * 40,
    size: 2 + Math.random() * 3,
    delay: Math.random() * 6,
    dur: 5 + Math.random() * 6,
    tx: (Math.random() - 0.5) * 200,
    ty: -(60 + Math.random() * 120),
  })), []);

  const [opacity, setOpacity] = useState(0);
  const [colorProgress, setColorProgress] = useState(0);

  useEffect(() => {
    return progress.on('change', (v) => {
      // particles fully visible between 0.25 and 0.75
      const fade = v < 0.2 ? 0 : v < 0.35 ? (v - 0.2) / 0.15 : v > 0.8 ? 0 : 1;
      setOpacity(fade);
      setColorProgress(v);
    });
  }, [progress]);

  const particleColor = colorProgress < 0.5
    ? lerpColor('#f97316', '#94a3b8', colorProgress * 2)
    : lerpColor('#94a3b8', '#38bdf8', (colorProgress - 0.5) * 2);

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none" style={{ opacity }}>
      {items.map((p) => (
        <div
          key={p.id}
          className="particle absolute rounded-full"
          style={{
            left: `${p.cx}%`, top: `${p.cy}%`,
            width: p.size, height: p.size,
            background: particleColor,
            filter: 'blur(0.5px)',
            '--tx': `${p.tx}px`, '--ty': `${p.ty}px`,
            '--dur': `${p.dur}s`, '--delay': `${p.delay}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Wave SVG — undulates, shifts colour with scroll
// ─────────────────────────────────────────────────────────────────────
function WaveLayer({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const phase = useMotionValue(0);
  const [opacity, setOpacity] = useState(0);

  useAnimationFrame((t) => { phase.set(t / 1200); });

  useEffect(() => {
    return progress.on('change', (v) => {
      const fade = v < 0.3 ? 0 : v < 0.5 ? (v - 0.3) / 0.2 : v > 0.85 ? 0 : 1;
      setOpacity(fade * 0.35);
    });
  }, [progress]);

  const [d, setD] = useState('');
  useAnimationFrame((t) => {
    const p = t / 1200;
    const pts = Array.from({ length: 32 }, (_, i) => {
      const x = (i / 31) * 1600;
      const y = 60 + Math.sin(i * 0.5 + p) * 22 + Math.sin(i * 0.3 + p * 1.4) * 14;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    setD(pts.join(' '));
  });

  const stroke = useTransform(progress, [0.25, 0.75], ['#fb923c', '#38bdf8']);
  const [strokeColor, setStrokeColor] = useState('#fb923c');
  useEffect(() => stroke.on('change', setStrokeColor), [stroke]);

  return (
    <div className="fixed inset-x-0 top-1/2 -translate-y-1/2 -z-10 pointer-events-none" style={{ opacity }}>
      <svg viewBox="0 0 1600 120" preserveAspectRatio="none" className="w-full h-24">
        <path d={d} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeOpacity="0.6" />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────────────
function Nav({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    return progress.on('change', (v) => setScrolled(v > 0.04));
  }, [progress]);

  return (
    <motion.nav
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12 py-6 transition-all duration-500"
      animate={{ background: scrolled ? 'rgba(2,8,16,0.7)' : 'transparent', backdropFilter: scrolled ? 'blur(16px)' : 'blur(0px)' }}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        className="font-syne font-bold text-sm tracking-[0.2em] text-white/70 uppercase">
        Airform
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
        className="hidden md:flex items-center gap-10">
        {['Experience', 'Services', 'Contact'].map((l) => (
          <a key={l} href={`#${l.toLowerCase()}`}
            className="font-inter text-[11px] tracking-[0.18em] text-white/35 uppercase hover:text-white/75 transition-colors duration-300">
            {l}
          </a>
        ))}
      </motion.div>
      <motion.a initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
        href="#contact"
        className="font-inter text-[11px] tracking-[0.18em] uppercase px-5 py-2.5 rounded-full border border-white/15 text-white/50 hover:border-white/35 hover:text-white/90 transition-all duration-300">
        Get a quote
      </motion.a>
    </motion.nav>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SECTION REVEAL — wraps any section content with a scroll-reveal
// ─────────────────────────────────────────────────────────────────────
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, filter: 'blur(8px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 1. HERO — heat
// ─────────────────────────────────────────────────────────────────────
function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y   = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);
  const op  = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section ref={ref} className="relative h-screen flex flex-col items-center justify-center overflow-hidden">

      {/* Heat haze overlay */}
      <div className="heat-shimmer absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(255,80,0,0.18) 0%, transparent 60%)' }} />

      {/* Horizon glow */}
      <motion.div className="absolute inset-x-0 bottom-0 h-64 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(200,50,0,0.25), transparent)' }}
        animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 5, repeat: Infinity }} />

      {/* Temperature readout */}
      <motion.div className="absolute top-28 right-8 md:right-16 font-syne text-right select-none"
        initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1, delay: 1.2 }}>
        <div className="text-6xl md:text-8xl font-bold leading-none"
          style={{ color: '#fb923c', textShadow: '0 0 80px rgba(255,100,0,0.6)' }}>38°</div>
        <div className="font-inter text-xs tracking-[0.3em] text-orange-500/50 uppercase mt-1">Outdoor</div>
      </motion.div>

      <motion.div className="relative z-10 text-center px-6 max-w-4xl" style={{ y, opacity: op }}>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="font-inter text-xs tracking-[0.35em] text-orange-400/55 uppercase mb-8">
          Climate Engineering
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 40, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1.3, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="font-syne font-bold mb-8 leading-[1.06]"
          style={{ fontSize: 'clamp(46px, 9vw, 110px)', color: '#fdf2e5', textShadow: '0 0 120px rgba(255,100,0,0.2)' }}>
          Too hot to live
          <br />
          <span style={{ color: '#fb923c', textShadow: '0 0 60px rgba(251,113,33,0.6)' }}>comfortably?</span>
        </motion.h1>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.9 }}
          className="font-inter text-base md:text-lg text-white/30 mb-12 max-w-sm mx-auto leading-relaxed">
          Your indoor environment, completely reimagined.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.1 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <motion.a href="#experience"
            whileHover={{ scale: 1.04, boxShadow: '0 0 40px rgba(251,113,33,0.4)' }}
            whileTap={{ scale: 0.97 }}
            className="px-8 py-4 rounded-full font-inter text-sm tracking-[0.15em] uppercase text-white transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', border: '1px solid rgba(251,113,33,0.3)' }}>
            Fix your indoor climate
          </motion.a>
          <a href="#services"
            className="font-inter text-[12px] tracking-[0.2em] text-white/30 uppercase hover:text-white/60 transition-colors duration-300">
            See how it works ↓
          </a>
        </motion.div>
      </motion.div>

      {/* Bottom fade */}
      <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, #1a0600)' }} />

      {/* Scroll indicator */}
      <motion.div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2, duration: 1 }}>
        <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="w-px h-14 bg-gradient-to-b from-orange-500/50 to-transparent" />
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 2. TRANSITION — the world cools
// ─────────────────────────────────────────────────────────────────────
function TransitionSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const blurVal = useTransform(scrollYProgress, [0, 0.4, 0.7], [6, 2, 0]);
  const filter  = useTransform(blurVal, (v) => `blur(${v}px)`);

  return (
    <section ref={ref} id="experience" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Separator gradient */}
      <div className="absolute inset-x-0 top-0 h-48 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, #1a0600, transparent)' }} />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center py-32">
        <Reveal>
          <motion.div style={{ filter, color: 'rgba(200,160,100,0.5)', letterSpacing: '0.3em' }}
            className="font-inter text-xs tracking-[0.35em] uppercase mb-8">
            The transformation begins
          </motion.div>
        </Reveal>

        <Reveal delay={0.15}>
          <h2 className="font-syne font-bold leading-[1.07] mb-10"
            style={{ fontSize: 'clamp(38px, 7vw, 84px)', color: '#f5ece0' }}>
            We bring balance
            <br />
            <span style={{ color: 'rgba(180,200,220,0.85)' }}>back to your space.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.3}>
          <p className="font-inter text-base text-white/30 max-w-md mx-auto leading-relaxed">
            Precision-engineered air systems that dissolve the heat and replace it with something your body recognises as perfect.
          </p>
        </Reveal>

        {/* Three floating values */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
          {[
            { num: '01', label: 'Assess', desc: 'We study your space, its sun exposure and heat load.' },
            { num: '02', label: 'Engineer', desc: 'Every system is designed specifically for your building.' },
            { num: '03', label: 'Transform', desc: 'Your environment changes completely, permanently.' },
          ].map((item, i) => (
            <Reveal key={item.num} delay={0.1 * i}>
              <div className="p-7 rounded-2xl text-left"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="font-inter text-xs tracking-[0.3em] mb-5" style={{ color: 'rgba(180,160,100,0.45)' }}>{item.num}</div>
                <div className="font-syne font-bold text-2xl text-white/80 mb-3">{item.label}</div>
                <div className="font-inter text-sm text-white/35 leading-relaxed">{item.desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 3. AIRFLOW EXPERIENCE
// ─────────────────────────────────────────────────────────────────────
function AirflowSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const timeRef   = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    const N = 6;
    const lines = Array.from({ length: N }, (_, i) => ({
      yBase: (canvas.height * (i + 1)) / (N + 1),
      phase: (i / N) * Math.PI * 2,
      amp: 24 + i * 8,
      freq: 0.003 + i * 0.0008,
      speed: 0.3 + i * 0.06,
    }));

    const draw = (ts: number) => {
      const dt = ts - timeRef.current;
      timeRef.current = ts;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      lines.forEach((l, li) => {
        const alpha = 0.08 + li * 0.03;
        const hue = 190 + li * 8;
        ctx.beginPath();
        for (let x = 0; x <= canvas.width; x += 4) {
          const y = l.yBase + Math.sin(x * l.freq + ts * 0.0005 * l.speed + l.phase) * l.amp
                             + Math.sin(x * l.freq * 1.7 + ts * 0.0004 + l.phase * 1.3) * (l.amp * 0.4);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${hue}, 80%, 70%, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Canvas airflow */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Cool atmosphere overlay */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(14,120,200,0.09) 0%, transparent 70%)' }} />

      <div className="relative z-10 max-w-5xl mx-auto px-6 w-full py-32">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <Reveal>
              <div className="font-inter text-xs tracking-[0.35em] uppercase mb-7"
                style={{ color: 'rgba(100,180,220,0.5)', letterSpacing: '0.3em' }}>
                Air in motion
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="font-syne font-bold leading-[1.06] mb-8"
                style={{ fontSize: 'clamp(36px, 6vw, 72px)', color: '#e0f0ff' }}>
                Feel the
                <br />
                <span style={{ color: '#38bdf8', textShadow: '0 0 60px rgba(56,189,248,0.35)' }}>air shift.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="font-inter text-sm text-white/35 leading-relaxed max-w-sm">
                Precision airflow delivery — every cubic metre of your space reaches the exact temperature you set. Silently. Continuously.
              </p>
            </Reveal>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { value: '0.1°', label: 'Precision', unit: 'temperature accuracy' },
              { value: '19dB', label: 'Near-silent', unit: 'operating noise' },
              { value: 'A+++', label: 'Efficiency', unit: 'energy rating' },
              { value: '<4h', label: 'Installed', unit: 'typical fit time' },
            ].map((s, i) => (
              <Reveal key={s.value} delay={i * 0.08}>
                <div className="p-6 rounded-2xl"
                  style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.12)' }}>
                  <div className="font-syne font-bold text-3xl mb-1"
                    style={{ color: '#7dd3fc', textShadow: '0 0 30px rgba(56,189,248,0.3)' }}>
                    {s.value}
                  </div>
                  <div className="font-inter font-medium text-sm text-white/60 mb-0.5">{s.label}</div>
                  <div className="font-inter text-xs text-white/25">{s.unit}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 4. COOL COMFORT
// ─────────────────────────────────────────────────────────────────────
function CoolSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Cool orb */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(14,165,233,0.14) 0%, transparent 65%)' }} />

      <div className="relative z-10 text-center px-6 max-w-5xl mx-auto py-32">
        {/* Large temp reading */}
        <Reveal>
          <div className="font-syne font-bold mb-4 select-none"
            style={{
              fontSize: 'clamp(100px, 22vw, 240px)', lineHeight: 1,
              color: 'transparent',
              WebkitTextStroke: '1px rgba(56,189,248,0.25)',
              textShadow: '0 0 120px rgba(14,165,233,0.12)',
            }}>
            21°
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <h2 className="font-syne font-bold leading-[1.06] mb-8"
            style={{ fontSize: 'clamp(36px, 6.5vw, 80px)', color: '#dff2ff' }}>
            Perfect temperature.
            <br />
            <span style={{ color: '#38bdf8', textShadow: '0 0 60px rgba(56,189,248,0.4)' }}>Perfect comfort.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.25}>
          <p className="font-inter text-base text-white/30 max-w-md mx-auto leading-relaxed mb-16">
            The moment your system reaches its target, the world becomes quieter. Cleaner. Yours.
          </p>
        </Reveal>

        {/* Testimonial */}
        <Reveal delay={0.35}>
          <div className="mx-auto max-w-lg p-8 rounded-3xl"
            style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.12)' }}>
            <p className="font-inter text-sm text-white/50 italic leading-relaxed mb-5">
              "The first night after the install, I slept eight hours straight for the first time in three summers."
            </p>
            <div className="flex items-center gap-3 justify-center">
              <div className="w-8 h-8 rounded-full" style={{ background: 'rgba(56,189,248,0.2)' }} />
              <div className="text-left">
                <div className="font-inter text-xs text-white/50 font-medium">Claire M.</div>
                <div className="font-inter text-[10px] text-white/25">Paris, 6th arrondissement</div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 5. SERVICES
// ─────────────────────────────────────────────────────────────────────
const SERVICES = [
  {
    label: 'Installation',
    desc: 'Full system design and installation. We handle everything from load assessment to commissioning.',
    detail: 'Split, multi-split, ducted, heat pump',
    color: '#38bdf8',
  },
  {
    label: 'Repair',
    desc: 'Rapid diagnostics and same-day repairs. Certified engineers with all major brand parts.',
    detail: 'Same-day availability',
    color: '#34d399',
  },
  {
    label: 'Maintenance',
    desc: 'Annual servicing contracts that double system lifespan and keep energy use at its minimum.',
    detail: 'Annual contracts from €180',
    color: '#a78bfa',
  },
];

function ServicesSection() {
  return (
    <section id="services" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 40% 50%, rgba(14,120,180,0.07) 0%, transparent 70%)' }} />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <Reveal>
          <div className="font-inter text-xs tracking-[0.35em] uppercase mb-5" style={{ color: 'rgba(100,180,220,0.45)' }}>
            Services
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-syne font-bold mb-16"
            style={{ fontSize: 'clamp(34px, 6vw, 72px)', lineHeight: 1.07, color: '#ddeeff' }}>
            Everything your
            <br />space needs.
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-5">
          {SERVICES.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.12}>
              <motion.div
                whileHover={{ scale: 1.025, borderColor: `${s.color}40` }}
                className="group p-8 rounded-2xl cursor-default transition-all duration-400"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-6"
                  style={{ background: `${s.color}15`, border: `1px solid ${s.color}25` }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }} />
                </div>
                <h3 className="font-syne font-bold text-2xl text-white/80 mb-4 group-hover:text-white/95 transition-colors">{s.label}</h3>
                <p className="font-inter text-sm text-white/35 leading-relaxed mb-6">{s.desc}</p>
                <div className="font-inter text-[11px] tracking-[0.15em] uppercase"
                  style={{ color: `${s.color}70` }}>
                  {s.detail}
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>

        {/* Guarantees */}
        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { v: '5yr', l: 'Parts warranty' },
            { v: '4.9★', l: '180+ reviews' },
            { v: 'RGE', l: 'Certified' },
            { v: '24h', l: 'Emergency response' },
          ].map((g, i) => (
            <Reveal key={g.v} delay={i * 0.07}>
              <div className="text-center py-5 px-4 rounded-xl"
                style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)' }}>
                <div className="font-syne font-bold text-2xl text-sky-400/80 mb-1">{g.v}</div>
                <div className="font-inter text-xs text-white/30">{g.l}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 6. FINAL CTA
// ─────────────────────────────────────────────────────────────────────
function CTASection() {
  return (
    <section id="contact" className="relative py-40 md:py-56 overflow-hidden">
      {/* Deep cool atmosphere */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(14,120,220,0.18) 0%, transparent 65%)' }} />

      {/* Rings */}
      {[500, 780, 1060].map((r, i) => (
        <motion.div key={r} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          animate={{ scale: [1, 1.03 + i * 0.01, 1], opacity: [0.12 - i * 0.03, 0.22 - i * 0.03, 0.12 - i * 0.03] }}
          transition={{ duration: 6 + i * 2.5, repeat: Infinity, delay: i * 1.2 }}
          style={{ width: r, height: r, border: '1px solid rgba(56,189,248,0.18)' }} />
      ))}

      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2.5 mb-8 px-4 py-2 rounded-full"
            style={{ background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.18)' }}>
            <motion.div className="w-1.5 h-1.5 rounded-full bg-sky-400"
              animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} />
            <span className="font-inter text-xs tracking-[0.2em] uppercase" style={{ color: 'rgba(125,210,248,0.65)' }}>
              Available today
            </span>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <h2 className="font-syne font-bold leading-[1.05] mb-7"
            style={{ fontSize: 'clamp(42px, 8vw, 92px)', color: '#dff2ff' }}>
            Upgrade your
            <br />
            <motion.span
              style={{ color: '#38bdf8', display: 'inline-block' }}
              animate={{ textShadow: ['0 0 40px rgba(56,189,248,0.3)', '0 0 80px rgba(56,189,248,0.55)', '0 0 40px rgba(56,189,248,0.3)'] }}
              transition={{ duration: 5, repeat: Infinity }}>
              comfort today.
            </motion.span>
          </h2>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="font-inter text-sm text-white/35 max-w-sm mx-auto leading-relaxed mb-12">
            Free site survey. No obligation. We'll tell you exactly what your space needs.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.a href="tel:+33123456789"
              whileHover={{ scale: 1.05, boxShadow: '0 0 60px rgba(56,189,248,0.35)' }}
              whileTap={{ scale: 0.97 }}
              className="px-10 py-5 rounded-full font-inter text-sm tracking-[0.15em] uppercase text-slate-950 font-medium transition-all duration-300"
              style={{ background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)' }}>
              Get a free quote
            </motion.a>
            <a href="tel:+33123456789"
              className="font-inter text-sm text-white/35 tracking-wider hover:text-white/65 transition-colors">
              or call 01 23 45 67 89
            </a>
          </div>
        </Reveal>

        <Reveal delay={0.45}>
          <div className="mt-14 flex flex-wrap justify-center gap-8">
            {['RGE Certified', '5-Year Warranty', 'Same-day repair', '4.9★ Google'].map((b) => (
              <div key={b} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-sky-400/40" />
                <span className="font-inter text-xs text-white/25 tracking-[0.12em]">{b}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="relative py-12 px-6" style={{ borderTop: '1px solid rgba(56,189,248,0.06)', background: '#010509' }}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="font-syne font-bold text-sm tracking-[0.2em] text-white/20 uppercase">Airform</div>
        <p className="font-inter text-xs text-white/20">© 2025 Airform Climate Engineering. All rights reserved.</p>
        <p className="font-inter text-xs text-white/15">RGE Certified · Lic. HV-448821</p>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────
export default function App() {
  const progress = usePageScroll();

  return (
    <>
      {/* Fixed environmental layers */}
      <ScrollBackground progress={progress} />
      <AmbientOrb progress={progress} />
      <Particles progress={progress} />
      <WaveLayer progress={progress} />

      {/* Page */}
      <div className="relative">
        <Nav progress={progress} />
        <Hero />
        <TransitionSection />
        <AirflowSection />
        <CoolSection />
        <ServicesSection />
        <CTASection />
        <Footer />
      </div>
    </>
  );
}
