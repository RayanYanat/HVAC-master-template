import {
  useEffect, useRef, useState, useMemo, useCallback,
} from 'react';
import {
  motion, useScroll, useTransform, useSpring,
  useAnimationFrame, useMotionValue,
} from 'framer-motion';

// ─── Colour system ────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `rgb(${Math.round(ar+(br-ar)*t)},${Math.round(ag+(bg-ag)*t)},${Math.round(ab+(bb-ab)*t)})`;
}
function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

const BG_STOPS = [
  { p: 0.00, c: '#120800' },
  { p: 0.15, c: '#160a02' },
  { p: 0.35, c: '#0a1018' },
  { p: 0.55, c: '#050e1c' },
  { p: 0.75, c: '#040c1a' },
  { p: 1.00, c: '#030b18' },
];
function bgAt(p: number): string {
  for (let i = 0; i < BG_STOPS.length - 1; i++) {
    const a = BG_STOPS[i], b = BG_STOPS[i + 1];
    if (p <= b.p) return lerpHex(a.c, b.c, (p - a.p) / (b.p - a.p));
  }
  return BG_STOPS[BG_STOPS.length - 1].c;
}

// ─── Global scroll hook ───────────────────────────────────────────────
function usePageScroll() {
  const { scrollYProgress } = useScroll();
  return useSpring(scrollYProgress, { stiffness: 55, damping: 22, restDelta: 0.001 });
}

// ─── Scroll velocity hook (for motion blur) ───────────────────────────
function useScrollVelocity() {
  const vel = useMotionValue(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const now = performance.now();
      const dy = window.scrollY - lastY.current;
      const dt = now - lastT.current || 16;
      vel.set(dy / dt); // px/ms
      lastY.current = window.scrollY;
      lastT.current = now;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [vel]);
  return vel;
}

// ─── Fixed background driven by scroll ───────────────────────────────
function ScrollBg({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    return progress.on('change', (v) => {
      if (ref.current) ref.current.style.background = bgAt(v);
    });
  }, [progress]);
  return <div ref={ref} className="fixed inset-0 -z-20" style={{ background: bgAt(0) }} />;
}

// ─── Ambient gradient orb ─────────────────────────────────────────────
const ORB = [
  { p: 0.00, r: 160, g: 60,  b: 0   },
  { p: 0.20, r: 140, g: 40,  b: 0   },
  { p: 0.45, r: 10,  g: 90,  b: 130 },
  { p: 0.70, r: 8,   g: 95,  b: 165 },
  { p: 1.00, r: 10,  g: 90,  b: 170 },
];
function orbAt(p: number, alpha: number): string {
  for (let i = 0; i < ORB.length - 1; i++) {
    const a = ORB[i], b = ORB[i + 1];
    if (p <= b.p) {
      const t = (p - a.p) / (b.p - a.p);
      const r = Math.round(a.r + (b.r - a.r) * t);
      const g = Math.round(a.g + (b.g - a.g) * t);
      const bl = Math.round(a.b + (b.b - a.b) * t);
      return `radial-gradient(circle, rgba(${r},${g},${bl},${alpha}) 0%, transparent 70%)`;
    }
  }
  const last = ORB[ORB.length - 1];
  return `radial-gradient(circle, rgba(${last.r},${last.g},${last.b},${alpha}) 0%, transparent 70%)`;
}

function AmbientOrb({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const ref = useRef<HTMLDivElement>(null);
  const top = useTransform(progress, [0, 1], ['5%', '72%']);
  const left = useTransform(progress, [0, 0.5, 1], ['18%', '55%', '68%']);
  useEffect(() => {
    return progress.on('change', (v) => {
      if (ref.current) ref.current.style.background = orbAt(v, 0.18);
    });
  }, [progress]);
  return (
    <motion.div ref={ref} className="fixed -z-10 rounded-full pointer-events-none"
      style={{ width: 800, height: 800, top, left, translateX: '-50%', translateY: '-50%',
               filter: 'blur(80px)', background: orbAt(0, 0.18) }} />
  );
}

// ─── Brownian heat particles ──────────────────────────────────────────
interface HotParticle {
  id: number; x: number; y: number; size: number;
  delay: number; dur: number; cls: 'a' | 'b' | 'c';
  color: string;
}
const HOT_COLORS = ['rgba(251,146,60,0.7)', 'rgba(234,88,12,0.6)', 'rgba(253,186,116,0.5)', 'rgba(254,215,170,0.4)'];

function HeatParticles({ visible }: { visible: boolean }) {
  const items: HotParticle[] = useMemo(() =>
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 80,
      y: 60 + Math.random() * 30,
      size: 1.5 + Math.random() * 2.5,
      delay: Math.random() * 7,
      dur: 6 + Math.random() * 5,
      cls: (['a', 'b', 'c'] as const)[i % 3],
      color: HOT_COLORS[Math.floor(Math.random() * HOT_COLORS.length)],
    })), []);

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 1.2s ease' }}>
      {items.map((p) => (
        <div key={p.id}
          className={`particle-hot ${p.cls}`}
          style={{
            left: `${p.x}%`, bottom: `${100 - p.y}%`,
            width: p.size, height: p.size,
            background: p.color,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            animation: `brownian${p.cls.toUpperCase()} ${p.dur}s ${p.delay}s ease-out infinite, particleFade ${p.dur}s ${p.delay}s ease-out infinite`,
          }} />
      ))}
    </div>
  );
}

// ─── Laminar flow canvas (cold zone) ─────────────────────────────────
function LaminarCanvas({ opacity }: { opacity: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    // N horizontal laminar lines, each slightly different y-speed
    const N = 40;
    const lines = Array.from({ length: N }, (_, i) => ({
      y: (canvas.height / N) * i + canvas.height / N / 2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.18 + Math.random() * 0.12,
      alpha: 0.03 + Math.random() * 0.04,
    }));

    const draw = (ts: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const t = ts * 0.001;
      lines.forEach((l) => {
        // Each line is a very thin horizontal gradient — 1px
        const offset = Math.sin(t * l.speed + l.phase) * 6;
        const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        grad.addColorStop(0, `rgba(125,210,248,0)`);
        grad.addColorStop(0.1 + Math.sin(t * 0.2 + l.phase) * 0.05, `rgba(125,210,248,${l.alpha})`);
        grad.addColorStop(0.9 + Math.cos(t * 0.15 + l.phase) * 0.05, `rgba(160,220,255,${l.alpha})`);
        grad.addColorStop(1, `rgba(125,210,248,0)`);
        ctx.beginPath();
        ctx.moveTo(0, l.y + offset);
        ctx.lineTo(canvas.width, l.y + offset);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <canvas ref={canvasRef} className="fixed inset-0 -z-10 w-full h-full pointer-events-none"
      style={{ opacity, transition: 'opacity 1.4s ease' }} />
  );
}

// ─── Motion blur wrapper — applies vertical blur on fast scroll ───────
function ScrollBlur({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const vel = useScrollVelocity();
  useAnimationFrame(() => {
    const v = Math.abs(vel.get());
    // blur ramps from 0 at v=0 to max 3px at v=2 px/ms
    const blur = Math.min(3, v * 1.4).toFixed(2);
    const scaleY = 1 + Math.min(0.008, v * 0.003);
    if (ref.current) {
      ref.current.style.filter = `blur(0px) blur(${blur}px)`;
      ref.current.style.transform = `scaleY(${scaleY})`;
    }
  });
  return <div ref={ref} className={className} style={{ willChange: 'filter, transform' }}>{children}</div>;
}

// ─── Reveal ───────────────────────────────────────────────────────────
function Reveal({ children, className = '', delay = 0, y = 40 }: {
  children: React.ReactNode; className?: string; delay?: number; y?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-8%' }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}>
      {children}
    </motion.div>
  );
}

// ─── Image wrapper with luminosity + zone tint ────────────────────────
function ZonedImage({ src, alt, tintColor, className = '' }: {
  src: string; alt: string; tintColor: string; className?: string;
}) {
  return (
    <div className={`img-luminosity ${className}`}>
      <img src={src} alt={alt} loading="lazy" />
      <div className="tint" style={{ background: tintColor }} />
    </div>
  );
}

// ─── NAV ──────────────────────────────────────────────────────────────
function Nav({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => progress.on('change', (v) => setScrolled(v > 0.03)), [progress]);

  return (
    <motion.nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-14 py-7"
      animate={{
        background: scrolled ? 'rgba(8,5,2,0.75)' : 'transparent',
        backdropFilter: scrolled ? 'blur(18px)' : 'blur(0px)',
      }}
      transition={{ duration: 0.6 }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
        className="font-playfair text-base tracking-[0.18em] text-white/60 italic">
        Airform
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
        className="hidden md:flex items-center gap-10">
        {['Experience', 'Services', 'Contact'].map((l) => (
          <a key={l} href={`#${l.toLowerCase()}`}
            className="font-inter text-[10px] tracking-[0.22em] text-white/30 uppercase hover:text-white/65
                       transition-colors duration-400">
            {l}
          </a>
        ))}
      </motion.div>
      <motion.a initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
        href="#contact"
        className="font-inter text-[10px] tracking-[0.2em] uppercase px-5 py-2.5 border border-white/15
                   text-white/40 hover:border-white/30 hover:text-white/75 transition-all duration-400">
        Quote
      </motion.a>
    </motion.nav>
  );
}

// ─── HERO ─────────────────────────────────────────────────────────────
function Hero({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y  = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const op = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const [hotVisible, setHotVisible] = useState(true);
  useEffect(() => progress.on('change', (v) => setHotVisible(v < 0.28)), [progress]);

  return (
    <section ref={ref} className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
      <HeatParticles visible={hotVisible} />

      {/* Radiant horizon */}
      <motion.div className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
        animate={{ opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(180,55,0,0.22) 0%, transparent 65%)' }} />

      {/* Temperature data — right side */}
      <motion.div className="absolute top-28 right-8 md:right-16 text-right select-none"
        initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1.2, delay: 1.4 }}>
        <ScrollBlur>
          <div className="font-playfair font-bold leading-none" style={{ fontSize: 'clamp(64px,10vw,96px)',
            color: '#c85a10', filter: 'drop-shadow(0 4px 12px rgba(160,50,0,0.3))' }}>
            38°
          </div>
        </ScrollBlur>
        <div className="font-inter text-[10px] tracking-[0.3em] uppercase mt-2"
          style={{ color: 'rgba(200,100,30,0.45)' }}>
          Outdoor
        </div>
      </motion.div>

      {/* Main content */}
      <motion.div className="relative z-10 text-center px-6 max-w-4xl" style={{ y, opacity: op }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="font-inter text-[10px] tracking-[0.4em] uppercase mb-9"
          style={{ color: 'rgba(200,120,40,0.5)' }}>
          Climate Engineering
        </motion.div>

        <ScrollBlur>
          <motion.h1 initial={{ opacity: 0, y: 36, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.4, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="heat-distort font-playfair font-bold leading-[1.06] mb-9"
            style={{ fontSize: 'clamp(48px, 9.5vw, 112px)', color: '#f0e0cc',
                     filter: 'drop-shadow(0 6px 24px rgba(120,40,0,0.25))' }}>
            Too hot to live
            <br />
            <em style={{ color: '#c85a10', fontStyle: 'italic' }}>comfortably?</em>
          </motion.h1>
        </ScrollBlur>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 1 }}
          className="font-inter text-sm text-white/28 mb-14 max-w-xs mx-auto leading-relaxed tracking-wide">
          Your indoor environment, completely reimagined.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="#experience"
            className="px-8 py-4 font-inter text-[11px] tracking-[0.22em] uppercase text-white/80
                       border border-white/20 hover:border-white/45 hover:text-white transition-all duration-500
                       hover:bg-white/5">
            Fix your indoor climate
          </a>
          <a href="#services"
            className="font-inter text-[10px] tracking-[0.22em] text-white/25 uppercase
                       hover:text-white/55 transition-colors duration-400">
            See how it works ↓
          </a>
        </motion.div>
      </motion.div>

      {/* Bottom vignette */}
      <div className="absolute inset-x-0 bottom-0 h-48 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, #120800)' }} />

      {/* Scroll cue */}
      <motion.div className="absolute bottom-9 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }}>
        <motion.div animate={{ scaleY: [1, 1.4, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="w-px h-12 mx-auto"
          style={{ background: 'linear-gradient(to bottom, rgba(200,100,30,0.5), transparent)' }} />
      </motion.div>
    </section>
  );
}

// ─── TRANSITION — heat dissolves ──────────────────────────────────────
function TransitionSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const blur = useTransform(scrollYProgress, [0, 0.45, 0.75], [8, 2, 0]);
  const blurStr = useTransform(blur, (v) => `blur(${v.toFixed(1)}px)`);

  return (
    <section ref={ref} id="experience" className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-56 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, #120800, transparent)' }} />

      <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-14 py-36 w-full">
        <div className="grid md:grid-cols-2 gap-20 items-center">

          {/* Left — text */}
          <div>
            <Reveal>
              <motion.div style={{ filter: blurStr, color: 'rgba(190,150,90,0.45)' }}
                className="font-inter text-[10px] tracking-[0.38em] uppercase mb-8">
                The transformation begins
              </motion.div>
            </Reveal>
            <Reveal delay={0.12}>
              <ScrollBlur>
                <h2 className="font-playfair font-bold leading-[1.07] mb-8"
                  style={{ fontSize: 'clamp(38px, 6vw, 78px)', color: '#ede0cc',
                           filter: 'drop-shadow(0 4px 16px rgba(60,30,5,0.2))' }}>
                  We bring balance
                  <br />
                  <em className="font-playfair italic" style={{ color: '#8ab8cc' }}>back to your space.</em>
                </h2>
              </ScrollBlur>
            </Reveal>
            <Reveal delay={0.24}>
              <p className="font-inter text-sm leading-relaxed max-w-sm"
                style={{ color: 'rgba(220,200,175,0.38)' }}>
                Precision-engineered air systems that dissolve the heat and replace it with something your body recognises as perfect.
              </p>
            </Reveal>
          </div>

          {/* Right — image with luminosity treatment */}
          <Reveal delay={0.18} y={30}>
            <ZonedImage
              src="https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=900&q=85&auto=format"
              alt="HVAC installation"
              tintColor="rgba(180,90,20,0.35)"
              className="aspect-[4/5] rounded-sm"
            />
          </Reveal>
        </div>

        {/* Process cards */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { num: '01', label: 'Assess', desc: 'We study your space, its orientation and thermal load.' },
            { num: '02', label: 'Engineer', desc: 'Every system is specified for your exact building.' },
            { num: '03', label: 'Transform', desc: 'Your environment changes. Completely. Permanently.' },
          ].map((item, i) => (
            <Reveal key={item.num} delay={0.1 * i}>
              <div className="p-7 border-t border-white/8 group hover:border-white/16 transition-colors duration-500">
                <div className="font-inter text-[10px] tracking-[0.3em] mb-5"
                  style={{ color: 'rgba(180,140,80,0.4)' }}>{item.num}</div>
                <div className="font-playfair font-bold text-xl mb-3"
                  style={{ color: '#e8d8c0' }}>{item.label}</div>
                <div className="font-inter text-sm leading-relaxed"
                  style={{ color: 'rgba(210,190,160,0.38)' }}>{item.desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── AIRFLOW — laminar canvas ─────────────────────────────────────────
function AirflowSection({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const [laminarOpacity, setLaminarOpacity] = useState(0);
  useEffect(() => {
    return progress.on('change', (v) => {
      const fade = v < 0.38 ? 0 : v < 0.55 ? (v - 0.38) / 0.17 : v > 0.82 ? (0.82 - v) / 0.1 : 1;
      setLaminarOpacity(clamp01(fade) * 0.9);
    });
  }, [progress]);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <LaminarCanvas opacity={laminarOpacity} />

      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-14 py-36 w-full">
        <div className="grid md:grid-cols-2 gap-20 items-center">

          {/* Stats col */}
          <div className="grid grid-cols-2 gap-4 order-2 md:order-1">
            {[
              { value: '0.1°C', label: 'Precision',    note: 'temperature accuracy' },
              { value: '19 dB', label: 'Near-silent',  note: 'operating noise floor' },
              { value: 'A+++',  label: 'Efficiency',   note: 'EU energy classification' },
              { value: '< 4h',  label: 'Installed',    note: 'average fit duration' },
            ].map((s, i) => (
              <Reveal key={s.value} delay={i * 0.09}>
                <div className="p-6 border border-white/7 hover:border-white/14 transition-colors duration-500">
                  <ScrollBlur>
                    <div className="font-playfair font-bold mb-1"
                      style={{ fontSize: 'clamp(26px,3.5vw,34px)', color: '#a8c8d8',
                               filter: 'drop-shadow(0 2px 8px rgba(10,80,120,0.25))' }}>
                      {s.value}
                    </div>
                  </ScrollBlur>
                  <div className="font-inter text-xs font-medium mb-0.5" style={{ color: 'rgba(185,215,230,0.6)' }}>
                    {s.label}
                  </div>
                  <div className="font-inter text-[10px]" style={{ color: 'rgba(160,195,215,0.3)' }}>
                    {s.note}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Text col */}
          <div className="order-1 md:order-2">
            <Reveal>
              <div className="font-inter text-[10px] tracking-[0.38em] uppercase mb-7"
                style={{ color: 'rgba(100,165,200,0.45)' }}>
                Air in motion
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <ScrollBlur>
                <h2 className="font-playfair font-bold leading-[1.06] mb-8"
                  style={{ fontSize: 'clamp(36px, 5.5vw, 68px)', color: '#d8eaf4',
                           filter: 'drop-shadow(0 4px 18px rgba(8,70,110,0.2))' }}>
                  Feel the
                  <br />
                  <em className="font-playfair italic" style={{ color: '#7db8d0' }}>air shift.</em>
                </h2>
              </ScrollBlur>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="font-inter text-sm leading-relaxed max-w-sm"
                style={{ color: 'rgba(190,220,235,0.38)' }}>
                Precision laminar flow — every cubic metre of your space reaches the exact temperature you set. Silently. Continuously.
              </p>
            </Reveal>

            {/* Image — steel blue tint */}
            <Reveal delay={0.3} y={20}>
              <ZonedImage
                src="https://images.unsplash.com/photo-1631367075396-c8e1b9c0dfd7?w=800&q=85&auto=format"
                alt="Heat pump unit"
                tintColor="rgba(20,80,130,0.45)"
                className="mt-10 aspect-video rounded-sm"
              />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── COOL COMFORT ─────────────────────────────────────────────────────
function CoolSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Soft cool atmosphere */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(10,90,150,0.12) 0%, transparent 65%)' }} />

      <div className="relative z-10 text-center px-6 max-w-5xl mx-auto py-36">
        <Reveal>
          {/* Ghost temperature numeral — steel stroke only */}
          <ScrollBlur>
            <div className="font-playfair font-bold select-none leading-none mb-6"
              style={{
                fontSize: 'clamp(110px, 22vw, 240px)',
                color: 'transparent',
                WebkitTextStroke: '1px rgba(80,160,200,0.18)',
                filter: 'drop-shadow(0 8px 40px rgba(10,80,140,0.08))',
              }}>
              21°
            </div>
          </ScrollBlur>
        </Reveal>

        <Reveal delay={0.15}>
          <ScrollBlur>
            <h2 className="font-playfair font-bold leading-[1.06] mb-8"
              style={{ fontSize: 'clamp(36px, 6vw, 76px)', color: '#d0e8f5',
                       filter: 'drop-shadow(0 4px 20px rgba(8,60,100,0.18))' }}>
              Perfect temperature.
              <br />
              <em className="italic" style={{ color: '#7ab4cc' }}>Perfect comfort.</em>
            </h2>
          </ScrollBlur>
        </Reveal>

        <Reveal delay={0.25}>
          <p className="font-inter text-sm leading-relaxed max-w-md mx-auto mb-16"
            style={{ color: 'rgba(175,210,230,0.38)' }}>
            The moment your system reaches its target, the world becomes quieter. Cleaner. Yours.
          </p>
        </Reveal>

        {/* Testimonial — mat card, no glow */}
        <Reveal delay={0.35}>
          <div className="mx-auto max-w-lg p-9 border border-white/7"
            style={{ background: 'rgba(255,255,255,0.025)' }}>
            <p className="font-playfair italic text-base leading-relaxed mb-6"
              style={{ color: 'rgba(195,225,240,0.55)' }}>
              "The first night after the install, I slept eight hours straight — for the first time in three summers."
            </p>
            <div className="flex items-center gap-3 justify-center">
              <div className="w-8 h-8 rounded-full border border-white/10"
                style={{ background: 'rgba(60,120,160,0.2)' }} />
              <div className="text-left">
                <div className="font-inter text-xs" style={{ color: 'rgba(190,220,235,0.5)' }}>Claire M.</div>
                <div className="font-inter text-[10px]" style={{ color: 'rgba(160,200,220,0.25)' }}>Paris, 6th arrondissement</div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── SERVICES ─────────────────────────────────────────────────────────
const SERVICES = [
  { label: 'Installation', desc: 'Full system design and installation. Load assessment to commissioning.', detail: 'Split · Multi-split · Ducted · Heat pump', accent: '#8ab0c0' },
  { label: 'Repair',       desc: 'Rapid diagnostics and same-day repairs. Certified engineers, all major brands.', detail: 'Same-day availability', accent: '#90b8a0' },
  { label: 'Maintenance',  desc: 'Annual servicing contracts that double system lifespan, minimise energy draw.', detail: 'Annual contracts from €180', accent: '#a090b8' },
];

function ServicesSection() {
  return (
    <section id="services" className="relative py-32 md:py-44 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 md:px-14">
        <Reveal>
          <div className="font-inter text-[10px] tracking-[0.38em] uppercase mb-5"
            style={{ color: 'rgba(120,175,200,0.4)' }}>Services</div>
        </Reveal>
        <Reveal delay={0.1}>
          <ScrollBlur>
            <h2 className="font-playfair font-bold mb-20"
              style={{ fontSize: 'clamp(34px, 5.5vw, 68px)', lineHeight: 1.06, color: '#d8ecf8',
                       filter: 'drop-shadow(0 4px 18px rgba(8,55,90,0.15))' }}>
              Everything your
              <br /><em className="italic">space needs.</em>
            </h2>
          </ScrollBlur>
        </Reveal>

        {/* Service rows — horizontal divider style */}
        <div className="space-y-0">
          {SERVICES.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.1}>
              <div className="group py-9 border-t border-white/7 hover:border-white/14 transition-colors duration-500
                              grid md:grid-cols-[1fr_2fr_1fr] gap-8 items-start">
                <div>
                  <div className="font-inter text-[10px] tracking-[0.3em] mb-3"
                    style={{ color: 'rgba(160,185,200,0.35)' }}>0{i + 1}</div>
                  <div className="font-playfair font-bold text-2xl"
                    style={{ color: s.accent }}>{s.label}</div>
                </div>
                <div className="font-inter text-sm leading-relaxed"
                  style={{ color: 'rgba(200,220,235,0.38)' }}>{s.desc}</div>
                <div className="font-inter text-[10px] tracking-[0.18em] uppercase text-right"
                  style={{ color: 'rgba(160,190,210,0.3)' }}>{s.detail}</div>
              </div>
            </Reveal>
          ))}
          <div className="border-t border-white/7" />
        </div>

        {/* Guarantees */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-5">
          {[
            { v: '5 yr',  l: 'Parts warranty' },
            { v: '4.9',   l: '180+ verified reviews' },
            { v: 'RGE',   l: 'Certified installer' },
            { v: '< 4h',  l: 'Emergency response' },
          ].map((g, i) => (
            <Reveal key={g.v} delay={i * 0.07}>
              <div className="py-6 px-5 border border-white/6 text-center hover:border-white/12 transition-colors duration-500">
                <div className="font-playfair font-bold text-xl mb-1"
                  style={{ color: '#8ab8cc' }}>{g.v}</div>
                <div className="font-inter text-[10px] tracking-wide"
                  style={{ color: 'rgba(160,200,220,0.3)' }}>{g.l}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FINAL CTA ────────────────────────────────────────────────────────
function CTASection() {
  return (
    <section id="contact" className="relative py-44 md:py-60 overflow-hidden">
      {/* Subtle deep pool */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(10,75,140,0.14) 0%, transparent 65%)' }} />

      {/* Hairline rings — mat, no glow */}
      {[440, 680, 920].map((r, i) => (
        <motion.div key={r}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          animate={{ opacity: [0.06 + i * 0.01, 0.12 + i * 0.01, 0.06 + i * 0.01] }}
          transition={{ duration: 7 + i * 2, repeat: Infinity, delay: i * 1.5 }}
          style={{ width: r, height: r, border: '1px solid rgba(100,170,210,0.2)' }} />
      ))}

      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2.5 mb-9 px-5 py-2.5 border border-white/10"
            style={{ background: 'rgba(255,255,255,0.025)' }}>
            <motion.div className="w-1.5 h-1.5 rounded-full"
              style={{ background: '#7ab4cc' }}
              animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 2.5, repeat: Infinity }} />
            <span className="font-inter text-[10px] tracking-[0.28em] uppercase"
              style={{ color: 'rgba(140,195,220,0.6)' }}>
              Available today
            </span>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <ScrollBlur>
            <h2 className="font-playfair font-bold leading-[1.05] mb-7"
              style={{ fontSize: 'clamp(44px, 8vw, 90px)', color: '#d0e8f5',
                       filter: 'drop-shadow(0 6px 28px rgba(8,55,100,0.18))' }}>
              Upgrade your
              <br />
              <em className="italic" style={{ color: '#7ab4cc' }}>comfort today.</em>
            </h2>
          </ScrollBlur>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="font-inter text-sm leading-relaxed max-w-xs mx-auto mb-12"
            style={{ color: 'rgba(180,215,232,0.38)' }}>
            Free site survey. No obligation. We'll tell you exactly what your space needs.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.a href="tel:+33123456789"
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="px-10 py-5 font-inter text-[11px] tracking-[0.22em] uppercase
                         transition-all duration-500 text-slate-950"
              style={{ background: 'rgba(175,215,235,0.95)',
                       boxShadow: '0 4px 24px rgba(10,70,120,0.2)' }}>
              Get a free quote
            </motion.a>
            <a href="tel:+33123456789"
              className="font-inter text-[10px] tracking-[0.2em] uppercase
                         transition-colors duration-400"
              style={{ color: 'rgba(160,200,220,0.4)' }}>
              or call 01 23 45 67 89
            </a>
          </div>
        </Reveal>

        <Reveal delay={0.45}>
          <div className="mt-14 flex flex-wrap justify-center gap-8">
            {['RGE Certified', '5-Year Warranty', 'Same-day repair', '4.9 Google'].map((b) => (
              <div key={b} className="flex items-center gap-2">
                <div className="w-px h-3" style={{ background: 'rgba(120,180,210,0.25)' }} />
                <span className="font-inter text-[10px] tracking-[0.15em]"
                  style={{ color: 'rgba(160,205,225,0.28)' }}>{b}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── FOOTER ───────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="relative py-10 px-6 md:px-14"
      style={{ borderTop: '1px solid rgba(100,160,200,0.07)', background: '#020810' }}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="font-playfair italic text-sm" style={{ color: 'rgba(140,180,205,0.25)' }}>Airform</div>
        <p className="font-inter text-[10px]" style={{ color: 'rgba(140,175,200,0.2)' }}>
          © 2025 Airform Climate Engineering. All rights reserved.
        </p>
        <p className="font-inter text-[10px]" style={{ color: 'rgba(120,160,185,0.15)' }}>
          RGE Certified · Lic. HV-448821
        </p>
      </div>
    </footer>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────
export default function App() {
  const progress = usePageScroll();

  return (
    <>
      <ScrollBg progress={progress} />
      <AmbientOrb progress={progress} />

      <div className="relative">
        <Nav progress={progress} />
        <Hero progress={progress} />
        <TransitionSection />
        <AirflowSection progress={progress} />
        <CoolSection />
        <ServicesSection />
        <CTASection />
        <Footer />
      </div>
    </>
  );
}
