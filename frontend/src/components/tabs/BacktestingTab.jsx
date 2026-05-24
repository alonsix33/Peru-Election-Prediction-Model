import { useState } from 'react';
import { getPartyColor } from '../../config/partyColors';
import { History, BarChart3, CheckCircle, XCircle, TrendingUp, Info, ChevronDown, ChevronUp } from 'lucide-react';
import TermTooltip from '../TermTooltip';

// ─── Análisis detallado por encuestadora · R1 2026 ────────────────────────────
// Última encuesta pre-veda de cada casa, convertida a votos válidos.
// Todas las fechas son de campo (field); publicadas entre el 3 y 5 de abril de 2026.
// Normalización:
//   IEP 28-30 mar   → pool candidatos listados (sum=56.6%) ≈ 100−B/N(21.8%)−NS/NP(22.7%)=55.5%
//   Ipsos 3-4 abr   → 100−B/N(11%)−NS/NP(16%)=73%  (intención de voto)
//   Datum 1-4 abr   → v.v. publicados por Datum (excluye NS/NP=16.8%; sin B/N explícito)
//   CPI 3-4 abr     → 100−B/N(14.7%)−NS/NP(13.9%)=71.4%  (simulacro con cédula)
//   CIT 30mar-1abr  → v.v. del informe oficial CIT (100−B/N=23.4%=76.6%)  (simulacro)
const POLLSTER_DETAIL_2026 = {
  candidates: [
    { name: 'Keiko Fujimori',           short: 'Keiko',   onpe: 17.2 },
    { name: 'Roberto Sánchez Palomino', short: 'Sánchez', onpe: 12.0 },
    { name: 'Rafael López Aliaga',      short: 'Aliaga',  onpe: 11.9 },
    { name: 'Jorge Nieto',              short: 'Nieto',   onpe: 11.0 },
    { name: 'Ricardo Belmont',          short: 'Belmont', onpe: 10.2 },
  ],
  pollsters: [
    {
      // IEP/La República · 28–30 mar 2026 · n=1200 · ME ±2.8%
      // Raw: K=10.0, S=6.7, A=8.7, N=5.4, B=5.2; pool≈56.6% (suma listados)
      name: 'IEP', dates: '28–30 mar', mae: 1.3, color: '#1D4ED8',
      ests: [17.7, 11.8, 15.4, 9.5, 9.2],
    },
    {
      // Ipsos/Perú21 · 3–4 abr 2026 · n=1205 · ME ±2.8%  (intención de voto)
      // Raw: K=15, S=5, A=7, N=4, B=6; B/N=11%, NS/NP=16% → pool=73%
      name: 'Ipsos', dates: '3–4 abr', mae: 3.7, color: '#7C3AED',
      ests: [20.5, 6.8, 9.6, 5.5, 8.2],
    },
    {
      // Datum/Infobae · 1–4 abr 2026 · n≈3000 · ME ±1.8%  (intención de voto)
      // Datum publica directamente % votos válidos: K=18.1, S=5.2, A=10.3, N=5.3, B=4.8
      name: 'Datum', dates: '1–4 abr', mae: 4.1, color: '#059669',
      ests: [18.1, 5.2, 10.3, 5.3, 4.8],
    },
    {
      // CPI/RPP · 3–4 abr 2026 · n=2000  (simulacro con cédula)
      // Raw: K=13.3, S=4.3, A=10.6, N=5.3, B=4.9; B/N=14.7%, NS/NP=13.9% → pool=71.4%
      name: 'CPI', dates: '3–4 abr', mae: 3.4, color: '#D97706',
      note: 'simulacro',
      ests: [18.6, 6.0, 14.8, 7.4, 6.9],
    },
    {
      // CIT/Panorama · 30 mar–1 abr 2026 · n=1500  (simulacro con cédula)
      // Informe CIT da directamente % votos válidos: A=17.8, K=17.1, S=3.9, N=5.5, B=3.4
      // B/N=23.4%; pool=76.6%  Publicado 5 abr 2026.
      name: 'CIT', dates: '30 mar–1 abr', mae: 5.3, color: '#DC2626',
      note: 'simulacro',
      ests: [17.1, 3.9, 17.8, 5.5, 3.4],
    },
  ],
};

function errColor(err) {
  if (err === null) return '#C4B8B0';
  const abs = Math.abs(err);
  if (abs < 1.0) return '#059669';
  if (abs < 3.0) return '#D97706';
  return '#DC2626';
}

function PollsterDetailTable() {
  const { candidates, pollsters } = POLLSTER_DETAIL_2026;
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 520 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #E5E0D8' }}>
            <th style={{
              textAlign: 'left', padding: '8px 10px 8px 0',
              color: '#8C877F', fontWeight: 500, fontSize: 11,
              position: 'sticky', left: 0, background: '#FAFAF9', minWidth: 72,
            }}>
              Candidato
            </th>
            <th style={{ textAlign: 'right', padding: '8px 10px', color: '#1C1917', fontWeight: 600, fontSize: 11, minWidth: 52 }}>
              ONPE
            </th>
            {pollsters.map(p => (
              <th key={p.name} style={{ textAlign: 'center', padding: '6px 8px', minWidth: 80 }}>
                <div style={{ color: p.color, fontWeight: 700, fontSize: 12 }}>{p.name}</div>
                <div style={{ color: '#8C877F', fontWeight: 400, fontSize: 10, marginTop: 1 }}>{p.dates}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, ci) => (
            <tr key={c.name} style={{ borderBottom: '1px solid #F0EDE8' }}>
              {/* Candidate name */}
              <td style={{
                padding: '9px 10px 9px 0', color: '#1C1917', fontWeight: 500, fontSize: 12,
                position: 'sticky', left: 0, background: '#FAFAF9',
              }}>
                {c.short}
              </td>
              {/* ONPE */}
              <td style={{
                padding: '9px 10px', textAlign: 'right',
                fontVariantNumeric: 'tabular-nums', color: '#1C1917', fontWeight: 600, fontSize: 12,
              }}>
                {c.onpe.toFixed(1)}%
              </td>
              {/* Each pollster */}
              {pollsters.map((p, pi) => {
                const est = p.ests[ci];
                const err = est !== null ? Math.round((est - c.onpe) * 10) / 10 : null;
                const color = errColor(err);
                return (
                  <td key={p.name} style={{ padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {est !== null ? (
                      <div>
                        <div style={{ color: '#1C1917', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                          {est.toFixed(1)}%
                        </div>
                        <div style={{
                          color, fontWeight: 600, fontSize: 11,
                          fontVariantNumeric: 'tabular-nums', marginTop: 1,
                        }}>
                          {err > 0 ? '+' : ''}{err.toFixed(1)}pp
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#C4B8B0', fontSize: 11 }}>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* MAE row */}
          <tr style={{ borderTop: '2px solid #E5E0D8', background: '#FAFAF9' }}>
            <td style={{
              padding: '9px 10px 9px 0', color: '#8C877F', fontWeight: 600,
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
              position: 'sticky', left: 0, background: '#FAFAF9',
            }}>
              MAE
            </td>
            <td style={{ padding: '9px 10px' }} />
            {pollsters.map(p => {
              const maeColor = p.mae < 2 ? '#059669' : p.mae < 4 ? '#D97706' : '#DC2626';
              return (
                <td key={p.name} style={{ padding: '9px 8px', textAlign: 'center' }}>
                  <span style={{
                    color: maeColor, fontWeight: 700, fontSize: 12,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {p.mae.toFixed(1)} pp
                  </span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        {[
          { color: '#059669', label: '< 1pp' },
          { color: '#D97706', label: '1–3pp' },
          { color: '#DC2626', label: '> 3pp' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ color: '#8C877F', fontSize: 10 }}>{label}</span>
          </div>
        ))}
        <span style={{ color: '#8C877F', fontSize: 10, marginLeft: 4 }}>
          · Error = encuestadora − ONPE · v.v. = votos válidos · — = no incluido en esa encuesta
        </span>
      </div>
    </div>
  );
}

const DATA = {
  2016: {
    context: 'Primera vuelta con 3 encuestadoras activas (Ipsos, CPI, Datum). Agregador sin Polymarket — solo encuestas hasta antes de la veda electoral del 3 de abril.',
    candidates: [
      { name: 'Keiko Fujimori', modelo: 37.9, onpe: 39.9, error: -2.0, inIC: true },
      { name: 'Pedro Pablo Kuczynski', modelo: 19.8, onpe: 21.1, error: -1.3, inIC: true },
      { name: 'Verónika Mendoza', modelo: 17.6, onpe: 19.9, error: -2.3, inIC: true },
      { name: 'Alfredo Barnechea', modelo: 12.3, onpe: 7.3, error: +5.1, inIC: false },
      { name: 'Alan García', modelo: 7.5, onpe: 5.8, error: +1.7, inIC: true },
      { name: 'Gregorio Santos', modelo: 4.9, onpe: 4.1, error: +0.7, inIC: true },
    ],
    mae: 2.2,
    ic: '5/6 (83%)',
    pollsters: [
      { name: 'Ipsos', mae: 3.3 },
      { name: 'CPI', mae: 4.0 },
      { name: 'Datum', mae: 4.1 },
    ],
    highlight: 'El modelo ubicó correctamente el orden del top-3: Keiko 1ra, PPK 2do, Mendoza 3ra. La disputa entre PPK y Mendoza por el segundo lugar fue la más cerrada del ciclo.',
    note: 'El error más grande fue Barnechea (+5.1 pts), probablemente por voto estratégico de última hora hacia PPK. Este tipo de movimiento ocurre después de la última encuesta y es difícil de anticipar con cualquier modelo basado en encuestas.',
    conclusion: 'El modelo acertó el orden del podio y contuvo el error dentro del IC en 5 de 6 candidatos. Un resultado sólido para la primera aplicación del agregador.',
  },
  2021: {
    context: 'Primera vuelta con 4 encuestadoras activas (Ipsos, IEP, CPI, Datum). Agregador sin Polymarket — solo encuestas hasta antes de la veda electoral del 4 de abril.',
    candidates: [
      { name: 'Pedro Castillo', modelo: 12.7, onpe: 18.9, error: -6.2, inIC: false },
      { name: 'Keiko Fujimori', modelo: 11.9, onpe: 13.4, error: -1.5, inIC: true },
      { name: 'Rafael López Aliaga', modelo: 11.8, onpe: 11.8, error: 0.0, inIC: true },
      { name: 'Hernando de Soto', modelo: 13.5, onpe: 11.6, error: +1.9, inIC: true },
      { name: 'Yonhy Lescano', modelo: 15.1, onpe: 8.9, error: +6.2, inIC: false },
      { name: 'Verónika Mendoza', modelo: 10.4, onpe: 7.9, error: +2.5, inIC: true },
      { name: 'George Forsyth', modelo: 12.7, onpe: 6.1, error: +6.6, inIC: false },
      { name: 'César Acuña', modelo: 5.0, onpe: 5.8, error: -0.7, inIC: true },
      { name: 'Daniel Urresti', modelo: 6.8, onpe: 5.4, error: +1.4, inIC: true },
    ],
    mae: 3.0,
    ic: '6/9 (67%)',
    pollsters: [
      { name: 'IEP', mae: 3.5 },
      { name: 'Ipsos', mae: 4.8 },
      { name: 'CPI', mae: 5.1 },
    ],
    highlight: 'El modelo ubicó a Castillo en el #3 con 23.6% de probabilidad de pasar a segunda vuelta, una señal más clara que la de las encuestas individuales. El error de -6.2 pts refleja la misma subestimación del voto rural que afectó a todas las encuestadoras.',
    note: 'Lescano (+6.2) y Forsyth (+6.6) fueron los mayores errores, probablemente por migración de voto estratégico en las últimas horas, patrón similar al de Barnechea en 2016.',
    conclusion: 'El modelo identificó a Castillo con mayor claridad que las encuestas individuales. El error rural fue comparable al de toda la industria: un problema estructural de cobertura, no del agregador.',
  },
  2026: {
    context: 'Primera vuelta 12 abril 2026. Blend bayesiano Polymarket + encuestas (α=0.77 día electoral). MAE de encuestadoras calculado sobre la última encuesta pre-veda de cada casa (votos válidos): IEP (28–30 mar), Ipsos (3–4 abr), Datum (1–4 abr), CPI simulacro (3–4 abr), CIT simulacro (30 mar–1 abr).',
    candidates: [
      { name: 'Keiko Fujimori', modelo: 30.0, onpe: 17.2, error: +12.8, inIC: false },
      { name: 'Rafael López Aliaga', modelo: 13.0, onpe: 11.9, error: +1.1, inIC: true },
      { name: 'Ricardo Belmont', modelo: 11.3, onpe: 10.2, error: +1.1, inIC: true },
      { name: 'Jorge Nieto', modelo: 9.1, onpe: 11.0, error: -1.9, inIC: true },
      { name: 'Roberto Sánchez Palomino', modelo: 8.9, onpe: 12.0, error: -3.1, inIC: false },
    ],
    mae: 4.01,
    ic: '3/5 (60%)',
    pollsters: [
      { name: 'IEP',   mae: 1.3 },
      { name: 'CPI',   mae: 3.4 },
      { name: 'Ipsos', mae: 3.7 },
      { name: 'Datum', mae: 4.1 },
      { name: 'CIT',   mae: 5.3 },
    ],
    highlight: 'Dos fallos mayores. Primero: Keiko inflada +12.8pp. Con α=0.77, Polymarket (45.5% P(ganar la presidencia)) dominó el blend — ese 45.5% no es el % de votos en R1, sino la probabilidad de ganar toda la elección; en una carrera de N candidatos siempre sobreestima al líder. Segundo: Sánchez predicho en #5 (8.9%), llegó #2 en ONPE (12.0%) — mismo patrón que Castillo 2021, base rural fuerte subrepresentada en encuestas urbanas. Su subestimación cascadeó en el orden: el modelo tenía a RLA en #2 y Belmont en #3, cuando ONPE los ubicó en #3 y #5 respectivamente. Posiciones exactas: solo Keiko (#1) y Nieto (#4). Errores de magnitud pequeños: RLA +1.1pp, Belmont +1.1pp, Nieto −1.9pp, los tres dentro del IC.',
    conclusion: 'El error en Keiko (+12.8pp) fue estructural: Polymarket medía P(ganar la presidencia), no % de votos en R1 — ya corregido para R2. El error de ordenamiento (RLA #2→#3, Belmont #3→#5) no fue un fallo independiente: fue consecuencia directa de subestimar a Sánchez en 3.1pp, que lo desplazó dos posiciones hacia arriba en cadena.',
  },
};

const POLLSTER_COLORS = {
  Ipsos: '#7C3AED', CPI: '#D97706', Datum: '#059669', IEP: '#1D4ED8', CIT: '#DC2626',
};

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 10,
      padding: 18, flex: 1, minWidth: 160,
    }}>
      <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ color: color || '#1C1917', fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{value}</div>
      <div style={{ color: '#8C877F', fontSize: 11 }}>{sub}</div>
    </div>
  );
}

export default function BacktestingTab() {
  const [activeYear, setActiveYear] = useState(2026);
  const [showPollDetail, setShowPollDetail] = useState(false);
  const d = DATA[activeYear];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Validación histórica</div>
        <h2 style={{ color: '#1C1917', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
          ¿Qué tan bien predijo el modelo en elecciones pasadas?
        </h2>
        <p style={{ color: '#78716C', fontSize: 14, lineHeight: 1.6, maxWidth: 640 }}>
          Corrimos el agregador hacia atrás usando solo los datos que estaban disponibles antes de cada veda electoral — sin información futura, sin ajustes posteriores. Los números muestran tanto los aciertos como los errores.
        </p>
      </div>

      {/* Methodology note */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderLeft: '3px solid #1D4ED8',
        borderRadius: '0 10px 10px 0', padding: '16px 20px',
      }}>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          <strong style={{ color: '#1C1917' }}>Metodología:</strong> el modelo combina encuestas de cada ciclo con ponderación bayesiana,
          ajusta por sesgos conocidos de cada encuestadora, redistribuye indecisos y corre 10,000 simulaciones Monte Carlo.{' '}
          <strong style={{ color: '#1C1917' }}>MAE</strong><TermTooltip term="MAE" /> (error absoluto medio) mide la distancia promedio entre predicción y resultado real en puntos porcentuales.
        </p>
      </div>

      {/* Year tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E5E0D8' }}>
        {[2026, 2021, 2016].map(y => (
          <button
            key={y}
            onClick={() => setActiveYear(y)}
            style={{
              padding: '10px 24px', fontSize: 14, fontWeight: activeYear === y ? 600 : 400,
              color: activeYear === y ? '#1D4ED8' : '#78716C', background: 'transparent',
              border: 'none', borderBottom: activeYear === y ? '2px solid #1D4ED8' : '2px solid transparent',
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            {y === 2026 ? '2026 ★' : y}
          </button>
        ))}
      </div>

      {/* Context */}
      <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.6 }}>{d.context}</p>

      {/* Metric cards */}
      {(() => {
        const diff = d.pollsters[0].mae - d.mae; // positive = model better
        const modelBetter = diff > 0;
        return (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <MetricCard label="MAE del modelo" value={`${d.mae} pts`} sub="error absoluto medio" color={d.mae < 3 ? '#059669' : '#D97706'} />
            <MetricCard label="Calibración IC 90%" value={d.ic} sub="candidatos dentro del intervalo" color="#1D4ED8" />
            <MetricCard
              label="Vs. mejor encuestadora"
              value={modelBetter ? `−${diff.toFixed(1)} pts` : `+${Math.abs(diff).toFixed(1)} pts`}
              sub={modelBetter
                ? `mejor que ${d.pollsters[0].name} (${d.pollsters[0].mae} pts)`
                : `peor que ${d.pollsters[0].name} (${d.pollsters[0].mae} pts)`}
              color={modelBetter ? '#059669' : '#DC2626'}
            />
          </div>
        );
      })()}

      {/* Results table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #E5E0D8' }}>
          <span style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Modelo vs. ONPE — votos válidos
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E0D8' }}>
                <th style={{ textAlign: 'left', padding: '8px 14px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>Candidato</th>
                <th style={{ textAlign: 'right', padding: '8px 14px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>Modelo</th>
                <th style={{ textAlign: 'right', padding: '8px 14px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>ONPE</th>
                <th style={{ textAlign: 'right', padding: '8px 14px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>Error</th>
                <th style={{ textAlign: 'center', padding: '8px 14px', color: '#8C877F', fontWeight: 500, fontSize: 11 }}>IC 90%</th>
              </tr>
            </thead>
            <tbody>
              {d.candidates.map(c => {
                const errColor = Math.abs(c.error) < 0.1 ? '#059669' : c.error > 3 ? '#DC2626' : c.error < -3 ? '#D97706' : '#1C1917';
                return (
                  <tr key={c.name} style={{ borderBottom: '1px solid #F0EDE8' }}>
                    <td style={{ padding: '10px 14px', color: '#1C1917', fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1C1917' }}>{c.modelo.toFixed(1)}%</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#78716C' }}>{c.onpe.toFixed(1)}%</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: errColor, fontWeight: 500 }}>
                      {c.error > 0 ? '+' : ''}{c.error.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {c.inIC
                        ? <CheckCircle size={14} style={{ color: '#059669' }} />
                        : <XCircle size={14} style={{ color: '#DC2626' }} />
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Highlight */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 10, padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <TrendingUp size={16} style={{ color: '#1D4ED8', flexShrink: 0, marginTop: 2 }} />
          <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: '#1C1917' }}>Hallazgo clave:</strong> {d.highlight}
          </p>
        </div>
      </div>

      {/* Note */}
      {d.note && (
        <div style={{
          borderLeft: '3px solid #E5E0D8', padding: '12px 16px',
        }}>
          <p style={{ color: '#8C877F', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{d.note}</p>
        </div>
      )}

      {/* Conclusion */}
      {d.conclusion && (
        <div style={{
          background: '#F0FDF4', border: '1px solid #86EFAC',
          borderLeft: '4px solid #16A34A', borderRadius: '0 10px 10px 0', padding: '12px 16px',
        }}>
          <p style={{ color: '#15803D', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            <strong>Conclusión:</strong> {d.conclusion}
          </p>
        </div>
      )}

      {/* vs Pollsters */}
      <div>
        <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Comparación de MAE — modelo vs. encuestadoras
        </div>

        {/* Model row */}
        {(() => {
          const modelBetter = d.mae < d.pollsters[0].mae;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #F0EDE8' }}>
              <span style={{ width: 100, color: '#1D4ED8', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>Modelo</span>
              <div style={{ flex: 1, height: 8, background: '#F0EDE8', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(d.mae / 6) * 100}%`, height: '100%', background: '#1D4ED8', borderRadius: 4 }} />
              </div>
              <span style={{ width: 55, textAlign: 'right', color: '#1D4ED8', fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{d.mae} pts</span>
              <span style={{
                fontSize: 10, padding: '2px 6px',
                background: modelBetter ? '#EFF6FF' : '#FEF2F2',
                color: modelBetter ? '#1D4ED8' : '#DC2626',
                border: modelBetter ? '1px solid #BFDBFE' : '1px solid #FECACA',
                borderRadius: 4, flexShrink: 0
              }}>{modelBetter ? 'menor MAE' : 'mayor MAE'}</span>
            </div>
          );
        })()}

        {/* Pollster rows */}
        {d.pollsters.map(p => (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #F0EDE8' }}>
            <span style={{ width: 100, color: '#78716C', fontSize: 13, flexShrink: 0 }}>{p.name}</span>
            <div style={{ flex: 1, height: 8, background: '#F0EDE8', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(p.mae / 6) * 100}%`, height: '100%', background: POLLSTER_COLORS[p.name] || '#8C877F', opacity: 0.4, borderRadius: 4 }} />
            </div>
            <span style={{ width: 55, textAlign: 'right', color: '#78716C', fontSize: 13, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{p.mae} pts</span>
            <span style={{ width: 48 }} />
          </div>
        ))}
      </div>

      {/* Pollster detail breakdown — only for 2026 */}
      {activeYear === 2026 && (
        <div style={{ border: '1px solid #E5E0D8', borderRadius: 10, overflow: 'hidden' }}>
          {/* Toggle button */}
          <button
            onClick={() => setShowPollDetail(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '13px 16px', background: showPollDetail ? '#F0F4FF' : '#FAFAF9',
              border: 'none', cursor: 'pointer', textAlign: 'left', gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={15} style={{ color: '#1D4ED8', flexShrink: 0 }} />
              <span style={{ color: '#1C1917', fontSize: 13, fontWeight: 600 }}>
                Encuestadora vs ONPE — última pre-veda
              </span>
              <span style={{
                fontSize: 10, padding: '2px 7px', background: '#EFF6FF',
                color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 10,
              }}>
                detalle por candidato
              </span>
            </div>
            {showPollDetail
              ? <ChevronUp size={15} style={{ color: '#8C877F', flexShrink: 0 }} />
              : <ChevronDown size={15} style={{ color: '#8C877F', flexShrink: 0 }} />
            }
          </button>

          {/* Expanded content */}
          {showPollDetail && (
            <div style={{ padding: '16px', borderTop: '1px solid #E5E0D8', background: '#FFFFFF' }}>
              <p style={{ color: '#78716C', fontSize: 12, lineHeight: 1.6, margin: '0 0 14px' }}>
                Estimados de votos válidos de la <strong style={{ color: '#1C1917' }}>última encuesta pre-veda</strong> de
                cada casa vs resultado ONPE 100%. El error (en pp) muestra si la encuestadora sobreestimó (+) o
                subestimó (−) a cada candidato. Desliza para ver todas las columnas.
              </p>
              <PollsterDetailTable />
              <div style={{
                marginTop: 14, padding: '10px 14px',
                background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8,
              }}>
                <p style={{ color: '#92400E', fontSize: 11, lineHeight: 1.6, margin: 0 }}>
                  <strong>Patrón común:</strong> todas las encuestadoras subestimaron a Sánchez
                  (Ipsos −3.4pp, Datum −4.5pp, CPI −6.1pp, CIT −9.0pp). Solo IEP estuvo cerca (−0.2pp).
                  El mismo sesgo rural afectó a Nieto y Belmont. Aliaga fue sobreestimado en 3 de 5 casas.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2026 lessons & R2 updates note */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E0D8', borderLeft: '3px solid #1D4ED8',
        borderRadius: '0 12px 12px 0', padding: '20px 24px',
      }}>
        <div style={{ color: '#1D4ED8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Segunda vuelta — Junio 2026</div>
        <h4 style={{ color: '#1C1917', fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>Qué cambiamos para la segunda vuelta</h4>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: '0 0 10px' }}>
          El mayor aprendizaje de 2026 R1: Polymarket cotiza <strong style={{ color: '#1C1917' }}>P(ganar la presidencia)</strong>,
          no el porcentaje de votos. En primera vuelta eso distorsionó a Keiko +12.8pp. En segunda vuelta el problema persiste:
          PM 75.5% P(ganar) no equivale a 75.5% de los votos. Con ±3pp de incertidumbre histórica, ese 75.5% implica solo ~52% de votos.
          Sin corrección, el posterior se inflaría hasta 3pp al subir el alpha durante la veda.
        </p>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          Ajustes para R2: <strong style={{ color: '#1C1917' }}>conversión P(ganar)→voto share implícito</strong> antes de integrar;{' '}
          <strong style={{ color: '#1C1917' }}>alpha cap 0.60</strong> (era 0.77 en R1);{' '}
          <strong style={{ color: '#1C1917' }}>IEP 1.00×</strong> (mejor MAE pre-veda, 1.3pp) e{' '}
          <strong style={{ color: '#1C1917' }}>Ipsos 1.05×</strong> vs <strong style={{ color: '#1C1917' }}>Datum 1.15×</strong> basados en MAE de las últimas encuestas pre-veda.
        </p>
      </div>
    </div>
  );
}
