import { useState } from 'react';

const KEIKO_COLOR   = '#F97316';
const NEUTRAL_COLOR = '#78716C';

// ─── Methodology modal ────────────────────────────────────────
function CrossoverModal({ crossover, pct_actas, onClose }) {
  const topNames = (crossover?.top_pending ?? [])
    .slice(0, 3)
    .map(p => p.nombre.split(' ')[0])  // first word only for brevity
    .join(', ');

  const shiftStr = crossover?.obs_shift != null
    ? `${crossover.obs_shift > 0 ? '+' : ''}${crossover.obs_shift}pp`
    : '—';

  const extKfStr = crossover?.ext_kf_r2_share != null
    ? `${crossover.ext_kf_r2_share}%`
    : '—';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF', borderRadius: 14, padding: 24,
          maxWidth: 480, width: '100%', maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1C1917' }}>
            Proyección de cruce KF / RSP
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#A8A29E', fontSize: 18, lineHeight: 1, padding: 2,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#78716C', lineHeight: 1.6, margin: '0 0 14px' }}>
          Estimación probabilística del porcentaje de actas en que el conteo crudo
          de Keiko Fujimori podría superar al de Roberto Sánchez a nivel nacional
          (doméstico + exterior).
        </p>

        {/* Dynamic context */}
        <div style={{ fontSize: 12, color: '#78716C', lineHeight: 1.7, marginBottom: 16 }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#1C1917', fontSize: 13 }}>
            Situación actual
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span>
              Doméstico ({pct_actas != null ? `${pct_actas.toFixed(1)}% procesado` : 'casi completo'}):
              RSP lidera por{' '}
              <strong style={{ color: '#1C1917' }}>
                {crossover?.nat_rsp_lead?.toLocaleString('es-PE') ?? '—'}
              </strong>{' '}
              votos netos.
            </span>
            <span>
              Exterior ({crossover?.ext_pct != null ? `${crossover.ext_pct}% procesado` : 'parcial'}):
              KF al{' '}
              <strong style={{ color: '#1C1917' }}>{extKfStr}</strong>{' '}
              en lo contabilizado hasta ahora.
            </span>
            {topNames && (
              <span>
                Países con mayor volumen pendiente: <strong style={{ color: '#1C1917' }}>{topNames}</strong>{' '}
                y otros.
              </span>
            )}
          </div>
        </div>

        {/* Model description */}
        <div style={{
          background: '#F7F4EF', borderRadius: 8, padding: '10px 14px',
          fontSize: 12, color: '#78716C', lineHeight: 1.6, marginBottom: 16,
        }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#1C1917' }}>Cómo se calcula</p>
          <p style={{ margin: '0 0 4px' }}>
            Monte Carlo de{' '}
            <strong style={{ color: '#1C1917' }}>
              {(crossover?.n_sims ?? 2000).toLocaleString()} simulaciones
            </strong>.
            Para países parcialmente contados se usa el % KF observado en sus actas ya llegadas.
            Para países sin datos se aplica el shift promedio observado entre R1 y R2
            en los países ya reportados.
          </p>
          <p style={{ margin: 0 }}>
            Shift observado:{' '}
            <strong style={{ color: '#1C1917' }}>{shiftStr}</strong>{' '}
            vs R1 · Dispersión inter-país:{' '}
            <strong style={{ color: '#1C1917' }}>±{crossover?.sigma_shift ?? '—'}pp</strong>
          </p>
        </div>

        {/* Confidence explanation */}
        <div style={{
          background: '#F7F4EF', borderRadius: 8, padding: '10px 14px',
          fontSize: 12, color: '#78716C', lineHeight: 1.6, marginBottom: 16,
        }}>
          <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#1C1917' }}>Qué significa "Confianza"</p>
          <p style={{ margin: 0 }}>
            Fracción de las {(crossover?.n_sims ?? 2000).toLocaleString()} simulaciones en que KF
            logra superar a RSP antes del 100% de actas. Con un{' '}
            <strong style={{ color: '#1C1917' }}>
              {crossover?.confidence != null ? `${crossover.confidence}%` : '—'}
            </strong>{' '}
            de confianza, en{' '}
            <strong style={{ color: '#1C1917' }}>
              {crossover?.confidence != null && crossover?.n_sims != null
                ? Math.round(crossover.confidence / 100 * crossover.n_sims).toLocaleString()
                : '—'}
            </strong>{' '}
            escenarios los votos del exterior son suficientes para revertir la ventaja
            doméstica actual de RSP. No es la probabilidad de ganar la elección, sino
            de cruzar en conteo crudo. El IC{' '}
            <strong style={{ color: '#1C1917' }}>[{crossover?.ci_lo ?? '—'}%–{crossover?.ci_hi ?? '—'}%]</strong>{' '}
            muestra el rango de actas en que podría ocurrir el cruce (asumiendo que ocurre).
          </p>
        </div>

        {/* Pending countries table */}
        {crossover?.top_pending?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#1C1917', fontSize: 13 }}>
              Países con votos pendientes
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#A8A29E', textAlign: 'left' }}>
                  <th style={{ fontWeight: 500, paddingBottom: 4 }}>País</th>
                  <th style={{ fontWeight: 500, paddingBottom: 4, textAlign: 'right' }}>% cont.</th>
                  <th style={{ fontWeight: 500, paddingBottom: 4, textAlign: 'right' }}>KF% obs./est.</th>
                  <th style={{ fontWeight: 500, paddingBottom: 4, textAlign: 'right' }}>Votos pend.</th>
                </tr>
              </thead>
              <tbody>
                {crossover.top_pending.map((p, i) => {
                  const kfPctDisplay = p.r2KfPct != null
                    ? `${p.r2KfPct.toFixed(1)}%`
                    : `~${Math.max(0, p.r1Kf + (crossover.obs_shift ?? 0)).toFixed(1)}%`;
                  const isObs = p.r2KfPct != null;
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #F0EDE8' }}>
                      <td style={{ padding: '4px 0', color: '#1C1917' }}>{p.nombre}</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', color: '#78716C' }}>
                        {p.pctDone?.toFixed(0)}%
                      </td>
                      <td style={{ padding: '4px 0', textAlign: 'right' }}>
                        <span style={{ color: p.r2KfPct != null && p.r2KfPct >= 50 ? KEIKO_COLOR : '#78716C' }}>
                          {kfPctDisplay}
                        </span>
                        {!isObs && (
                          <span style={{ color: '#A8A29E', fontSize: 10, marginLeft: 3 }}>est.</span>
                        )}
                      </td>
                      <td style={{ padding: '4px 0', textAlign: 'right', color: '#78716C' }}>
                        {p.estRemaining?.toLocaleString('es-PE')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: 11, color: '#A8A29E', margin: 0, lineHeight: 1.5 }}>
          Esta proyección estima el cruce del conteo crudo (voto a voto), no el resultado
          final del modelo. El resultado oficial y la proyección a 100% de actas se
          muestran en las cards superiores y en The Needle.
        </p>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────
function CrossoverBar({ pctNow, crossoverPct, ciLo, ciHi }) {
  const toX = (pct) => `${Math.min(100, Math.max(0, pct))}%`;
  const tooClose = crossoverPct != null && pctNow != null && Math.abs(crossoverPct - pctNow) < 6;

  return (
    <div style={{ position: 'relative', height: 10, borderRadius: 5, background: '#F0EDE8', overflow: 'visible', margin: tooClose ? '10px 0 32px' : '10px 0 22px' }}>
      {/* CI band */}
      {ciLo != null && ciHi != null && (
        <div style={{
          position: 'absolute',
          left: toX(ciLo),
          width: `${Math.max(0, ciHi - ciLo)}%`,
          top: -2, height: 14, borderRadius: 3,
          background: '#F97316', opacity: 0.2,
        }} />
      )}
      {/* Counted so far */}
      <div style={{
        position: 'absolute', left: 0, width: toX(pctNow),
        height: '100%', background: '#D4CEC8', borderRadius: 5,
      }} />
      {/* Crossover marker */}
      {crossoverPct != null && (
        <div style={{
          position: 'absolute',
          left: toX(crossoverPct),
          transform: 'translateX(-50%)',
          top: -3, width: 2, height: 16,
          background: KEIKO_COLOR, borderRadius: 1,
        }} />
      )}
      {/* Labels — stagger vertically when the two markers would overlap */}
      <div style={{ position: 'absolute', top: 14, left: 0, right: 0 }}>
        <span style={{
          position: 'absolute', left: toX(pctNow), transform: 'translateX(-50%)',
          fontSize: 10, color: '#A8A29E', whiteSpace: 'nowrap',
          top: tooClose ? 14 : 0,
        }}>
          {pctNow?.toFixed(1)}%
        </span>
        {crossoverPct != null && (
          <span style={{
            position: 'absolute', left: toX(crossoverPct), transform: 'translateX(-50%)',
            fontSize: 10, color: KEIKO_COLOR, fontWeight: 600, whiteSpace: 'nowrap',
            top: 0,
          }}>
            {crossoverPct}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────
export default function CrossoverCard({ crossover, pct_actas }) {
  const [showModal, setShowModal] = useState(false);

  if (!crossover || crossover.status === 'error' || crossover.status === 'insufficient_data') {
    return null;
  }

  const isCrossed  = crossover.status === 'crossed';
  const noCrossover = crossover.status === 'no_crossover';

  return (
    <>
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E5E0D8',
        borderRadius: 12,
        padding: '14px 18px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isCrossed ? 4 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#A8A29E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Cruce proyectado KF / RSP
          </span>
          <button
            onClick={() => setShowModal(true)}
            title="Ver metodología"
            style={{
              background: '#F7F4EF', border: 'none', borderRadius: '50%',
              width: 20, height: 20, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#78716C', fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}
          >
            ?
          </button>
        </div>

        {isCrossed ? (
          // Already crossed
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: KEIKO_COLOR, fontVariantNumeric: 'tabular-nums' }}>
              KF supera a RSP
            </span>
            <span style={{ fontSize: 13, color: '#78716C' }}>
              por +{crossover.kf_lead?.toLocaleString('es-PE')} votos
            </span>
          </div>
        ) : noCrossover ? (
          // Won't cross
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#78716C' }}>
              KF no alcanza a RSP según proyección
            </span>
          </div>
        ) : (
          // Projected crossover
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: '#A8A29E' }}>KF supera a RSP al</span>
              <span style={{ fontSize: 28, fontWeight: 800, color: KEIKO_COLOR, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {crossover.crossover_pct}%
              </span>
              <span style={{ fontSize: 11, color: '#A8A29E' }}>de actas</span>
            </div>

            <CrossoverBar
              pctNow={pct_actas}
              crossoverPct={crossover.crossover_pct}
              ciLo={crossover.ci_lo}
              ciHi={crossover.ci_hi}
            />

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#78716C' }}>
                IC 80%:{' '}
                <strong style={{ color: '#1C1917' }}>
                  [{crossover.ci_lo}% – {crossover.ci_hi}%]
                </strong>
              </span>
              <span style={{ fontSize: 11, color: '#78716C' }}>
                Confianza:{' '}
                <strong style={{ color: crossover.confidence >= 80 ? '#15803D' : crossover.confidence >= 50 ? '#D97706' : '#DC2626' }}>
                  {crossover.confidence}%
                </strong>
              </span>
              <span style={{ fontSize: 11, color: '#A8A29E' }}>
                Ext. contabilizado: {crossover.ext_pct}%
              </span>
              {crossover.prob_pre_jee != null && (
                <span style={{ fontSize: 11, color: '#78716C' }}>
                  P(cruce antes del JEE):{' '}
                  <strong style={{ color: crossover.prob_pre_jee >= 70 ? '#15803D' : '#D97706' }}>
                    {crossover.prob_pre_jee}%
                  </strong>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {showModal && (
        <CrossoverModal crossover={crossover} pct_actas={pct_actas} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
