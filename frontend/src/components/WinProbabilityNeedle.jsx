import { useState, useEffect, useRef } from 'react';
import { getPartyColor } from '../config/partyColors';

const KEIKO_COLOR   = getPartyColor('Keiko Fujimori').primary;           // #F97316
const SANCHEZ_COLOR = getPartyColor('Roberto Sánchez Palomino').primary; // #16A34A

const CX = 220, CY = 215, R = 175;
const GAUGE_MAX = 15; // ±15pp

// ─── Math helpers ─────────────────────────────────────────────

const voteToMargin  = (pct) => 2 * pct - 100;
const marginToAngle = (m)   => (Math.max(-GAUGE_MAX, Math.min(GAUGE_MAX, m)) / GAUGE_MAX) * 90;

const angleToXY = (deg, r = R) => {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
};

const wedgePath = (a1, a2, r = R) => {
  const p1 = angleToXY(a1, r);
  const p2 = angleToXY(a2, r);
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
  const sweep = a2 > a1 ? 1 : 0;
  return `M ${CX} ${CY} L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${r} ${r} 0 ${large} ${sweep} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} Z`;
};

// ─── Sub-components ───────────────────────────────────────────

function GaugeArc() {
  const leftEnd  = angleToXY(-90);
  const center   = angleToXY(0);
  const rightEnd = angleToXY(90);
  return (
    <g opacity={0.18}>
      <path
        d={`M ${leftEnd.x.toFixed(1)} ${leftEnd.y.toFixed(1)} A ${R} ${R} 0 0 1 ${center.x.toFixed(1)} ${center.y.toFixed(1)}`}
        stroke={SANCHEZ_COLOR} strokeWidth={10} fill="none" strokeLinecap="round"
      />
      <path
        d={`M ${center.x.toFixed(1)} ${center.y.toFixed(1)} A ${R} ${R} 0 0 1 ${rightEnd.x.toFixed(1)} ${rightEnd.y.toFixed(1)}`}
        stroke={KEIKO_COLOR} strokeWidth={10} fill="none" strokeLinecap="round"
      />
    </g>
  );
}

function ConfidenceCones({ keiko, coneColor, visible }) {
  const p10 = keiko.p10, p25 = keiko.p25, p40 = keiko.p40;
  const p60 = keiko.p60, p75 = keiko.p75, p90 = keiko.p90;

  const aLow80  = marginToAngle(voteToMargin(p10));
  const aHigh80 = marginToAngle(voteToMargin(p90));
  const aLow50  = p25 != null ? marginToAngle(voteToMargin(p25)) : null;
  const aHigh50 = p75 != null ? marginToAngle(voteToMargin(p75)) : null;
  const aLow20  = p40 != null ? marginToAngle(voteToMargin(p40)) : null;
  const aHigh20 = p60 != null ? marginToAngle(voteToMargin(p60)) : null;

  return (
    <g style={{ transition: 'opacity 0.8s ease', opacity: visible ? 1 : 0 }}>
      <path d={wedgePath(aLow80, aHigh80)} fill={coneColor} opacity={0.10} />
      {aLow50 != null && aHigh50 != null && (
        <path d={wedgePath(aLow50, aHigh50)} fill={coneColor} opacity={0.18} />
      )}
      {aLow20 != null && aHigh20 != null && (
        <path d={wedgePath(aLow20, aHigh20)} fill={coneColor} opacity={0.28} />
      )}
    </g>
  );
}

function TickMarks() {
  const labeledTicks = [-15, -10, -5, 0, 5, 10, 15];
  return (
    <g>
      {Array.from({ length: 31 }, (_, i) => i - 15).map(m => {
        const angle  = marginToAngle(m);
        const isMaj  = labeledTicks.includes(m);
        const inner  = angleToXY(angle, R + (isMaj ? 6 : 3));
        const outer  = angleToXY(angle, R + (isMaj ? 16 : 8));
        return (
          <line key={m}
            x1={inner.x.toFixed(1)} y1={inner.y.toFixed(1)}
            x2={outer.x.toFixed(1)} y2={outer.y.toFixed(1)}
            stroke={m === 0 ? '#78716C' : '#D4CEC8'}
            strokeWidth={isMaj ? 1.5 : 0.8}
          />
        );
      })}
      {labeledTicks.filter(m => m !== 0).map(m => {
        const pos   = angleToXY(marginToAngle(m), R + 30);
        const color = m < 0 ? SANCHEZ_COLOR : KEIKO_COLOR;
        const label = m < 0 ? `S+${Math.abs(m)}` : `K+${m}`;
        return (
          <text key={`lbl-${m}`}
            x={pos.x.toFixed(1)} y={pos.y.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill={color} fontWeight="500"
            style={{ fontFamily: 'system-ui, sans-serif' }}
          >{label}</text>
        );
      })}
      {/* Center label */}
      {(() => {
        const p = angleToXY(0, R + 30);
        return (
          <text x={p.x.toFixed(1)} y={p.y.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill="#78716C" fontWeight="600"
            style={{ fontFamily: 'system-ui, sans-serif' }}
          >Empate</text>
        );
      })()}
    </g>
  );
}

function HistoricalLines() {
  const refs = [
    { margin: -2.90, label: "'11" },
    { margin: -0.25, label: "'16/'21" },
  ];
  return (
    <g>
      {refs.map(({ margin, label }) => {
        const angle    = marginToAngle(margin);
        const inner    = angleToXY(angle, R - 20);
        const outer    = angleToXY(angle, R + 2);
        const labelPos = angleToXY(angle, R - 36);
        return (
          <g key={label}>
            <line
              x1={inner.x.toFixed(1)} y1={inner.y.toFixed(1)}
              x2={outer.x.toFixed(1)} y2={outer.y.toFixed(1)}
              stroke="#A8A29E" strokeWidth={1} strokeDasharray="3 2"
            />
            <text x={labelPos.x.toFixed(1)} y={labelPos.y.toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="8" fill="#A8A29E"
              style={{ fontFamily: 'system-ui, sans-serif' }}
            >{label}</text>
          </g>
        );
      })}
    </g>
  );
}

// ─── Animated Needle ──────────────────────────────────────────

function AnimatedNeedle({ targetAngle, wobbleAmplitude }) {
  const [displayAngle, setDisplayAngle] = useState(0);      // starts at center
  const [entered, setEntered]           = useState(false);  // mount sweep done?
  const wobbleRef = useRef(null);
  const prevTargetRef = useRef(targetAngle);
  const enterTimerRef = useRef(null);

  // Mount: sweep from 0 → target with springy easing
  useEffect(() => {
    const t = setTimeout(() => {
      setDisplayAngle(targetAngle);
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
      enterTimerRef.current = setTimeout(() => setEntered(true), 1500);
    }, 120);
    return () => {
      clearTimeout(t);
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data update: smooth rotation to new target (no wobble during transition)
  useEffect(() => {
    if (!entered) return;
    if (targetAngle === prevTargetRef.current) return;
    prevTargetRef.current = targetAngle;
    setEntered(false);
    setDisplayAngle(targetAngle);
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    enterTimerRef.current = setTimeout(() => setEntered(true), 1500);
  }, [targetAngle, entered]);

  // Wobble: sinusoidal oscillation proportional to IC width once settled
  const [wobbleOffset, setWobbleOffset] = useState(0);
  useEffect(() => {
    if (!entered || wobbleAmplitude <= 0) {
      setWobbleOffset(0);
      return;
    }
    let frame;
    const start = Date.now();
    const tick = () => {
      const t = (Date.now() - start) / 1000;
      // Two overlapping slow sines → organic, non-repetitive feel
      const offset = wobbleAmplitude * (0.6 * Math.sin(t * 0.7) + 0.4 * Math.sin(t * 1.1 + 1.2));
      setWobbleOffset(offset);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [entered, wobbleAmplitude]);

  const angle = displayAngle + wobbleOffset;

  return (
    <g>
      {/* Needle — CSS transition handles mount sweep and data updates */}
      <g
        style={{
          transform: `rotate(${angle}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          // Spring transition only during sweep; none during wobble (rAF-driven)
          transition: entered ? 'none' : 'transform 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <polygon
          points={`${CX},${CY - R + 12} ${CX - 4.5},${CY + 4} ${CX + 4.5},${CY + 4}`}
          fill="#1C1917"
        />
      </g>
      {/* Pivot — static */}
      <circle cx={CX} cy={CY} r={7} fill="#1C1917" />
      <circle cx={CX} cy={CY} r={4} fill="#F7F4EF" />
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────

export default function WinProbabilityNeedle({ keiko, sanchez }) {
  const hasData = keiko != null && sanchez != null;

  const meanMargin     = hasData ? voteToMargin(keiko.mean) : 0;
  const targetAngle    = marginToAngle(meanMargin);
  const keikoLeads     = meanMargin >= 0;
  const leader         = keikoLeads ? keiko : sanchez;
  const leaderName     = keikoLeads ? 'Keiko Fujimori' : 'Roberto Sánchez';
  const leaderColor    = keikoLeads ? KEIKO_COLOR : SANCHEZ_COLOR;
  const coneColor      = leaderColor;

  // Wobble amplitude proportional to IC 80% range (wider IC = more tremor)
  const ic80Range = hasData
    ? Math.abs(voteToMargin(keiko.p90) - voteToMargin(keiko.p10))
    : 0;
  // Scale: range 0-30pp → amplitude 0-3.5°; cap at 3.5°
  const wobbleAmplitude = hasData ? Math.min(3.5, ic80Range * 0.12) : 0;

  // IC label helpers
  const fmtMargin = (pct) => {
    const m = voteToMargin(pct);
    return `${m >= 0 ? 'K' : 'S'}+${Math.abs(m).toFixed(1)}`;
  };

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: '20px 16px 16px' }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Margen proyectado · Votos válidos
        </div>
      </div>

      {/* Candidate flanking labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: -8, padding: '0 12px' }}>
        <div>
          <div style={{ color: SANCHEZ_COLOR, fontWeight: 700, fontSize: 13 }}>Roberto Sánchez</div>
          <div style={{ color: '#A8A29E', fontSize: 10 }}>← gana si aguja va a la izquierda</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: KEIKO_COLOR, fontWeight: 700, fontSize: 13 }}>Keiko Fujimori</div>
          <div style={{ color: '#A8A29E', fontSize: 10 }}>gana si aguja va a la derecha →</div>
        </div>
      </div>

      {/* SVG */}
      <div style={{ width: '100%', maxWidth: 460, margin: '0 auto' }}>
        <svg viewBox="0 0 440 230" style={{ width: '100%', overflow: 'visible' }}>
          <GaugeArc />
          {hasData && (
            <ConfidenceCones
              keiko={keiko}
              coneColor={coneColor}
              visible={hasData}
            />
          )}
          <TickMarks />
          <HistoricalLines />
          {hasData && (
            <AnimatedNeedle
              targetAngle={targetAngle}
              wobbleAmplitude={wobbleAmplitude}
            />
          )}
          {!hasData && (
            <>
              <circle cx={CX} cy={CY} r={7} fill="#D4CEC8" />
              <circle cx={CX} cy={CY} r={4} fill="#F7F4EF" />
            </>
          )}
        </svg>
      </div>

      {/* Bottom readout */}
      {hasData ? (
        <div style={{ textAlign: 'center', marginTop: -8 }}>
          <div style={{ color: leaderColor, fontWeight: 800, fontSize: 26, lineHeight: 1.1 }}>
            {leaderName}
          </div>
          <div style={{ color: leaderColor, fontWeight: 600, fontSize: 15, marginTop: 2 }}>
            {`${keikoLeads ? 'K' : 'S'}+${Math.abs(meanMargin).toFixed(2)}pp · ${leader.prob_win.toFixed(2)}% de probabilidad de ganar`}
          </div>
          <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
            {keiko.p25 != null ? 'IC 80%' : 'IC 95%'}: [{fmtMargin(keiko.p10)}pp, {fmtMargin(keiko.p90)}pp]
            {keiko.p25 != null && (
              <span style={{ color: '#C4BDB5' }}>
                {' · '}IC 50%: [{fmtMargin(keiko.p25)}pp, {fmtMargin(keiko.p75)}pp]
              </span>
            )}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#A8A29E', fontSize: 13, marginTop: 8 }}>
          Modelo inicializando...
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {keiko?.p40 != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 7, borderRadius: 3, background: coneColor, opacity: 0.65 }} />
            <span style={{ color: '#8C877F', fontSize: 10 }}>IC 20%</span>
          </div>
        )}
        {keiko?.p25 != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 7, borderRadius: 3, background: coneColor, opacity: 0.40 }} />
            <span style={{ color: '#8C877F', fontSize: 10 }}>IC 50%</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 18, height: 7, borderRadius: 3, background: coneColor, opacity: 0.22 }} />
          <span style={{ color: '#8C877F', fontSize: 10 }}>{keiko?.p25 != null ? 'IC 80%' : 'IC 95%'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="18" height="7">
            <line x1="0" y1="3.5" x2="18" y2="3.5" stroke="#A8A29E" strokeWidth={1} strokeDasharray="3 2" />
          </svg>
          <span style={{ color: '#8C877F', fontSize: 10 }}>Ref. histórica Keiko</span>
        </div>
        {wobbleAmplitude > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#A8A29E', fontSize: 10 }}>⟳ oscilación = incertidumbre del modelo</span>
          </div>
        )}
      </div>
    </div>
  );
}
