import { useState, useEffect, useCallback } from 'react';
import { getPartyColor } from '../../config/partyColors';
import WinProbabilityNeedle from '../WinProbabilityNeedle';
import PeruDeptMap from '../PeruDeptMap';

const KEIKO_COLOR   = getPartyColor('Keiko Fujimori').primary;           // #F97316
const SANCHEZ_COLOR = getPartyColor('Roberto Sánchez Palomino').primary; // #16A34A
const API_BASE      = import.meta.env.VITE_API_URL || '';

// ─── Demo data (R1 2026) ──────────────────────────────────────
const DEMO = {
  national: {
    kf_r2_share:      58.81,
    proj_kf_r2_share: 58.81,
    ci_low:           57.5,
    ci_high:          60.1,
    pct_actas:        100,
    kf_votos:         2_877_678,  // ONPE R1 oficial
    rsp_votos:        2_015_114,  // ONPE R1 oficial
  },
  // Nacional doméstico (total − exterior)
  nacional: { kf_r2_share: 58.46, kf_votos: 2_825_224, rsp_votos: 2_007_120 },
  // Exterior R1 real (r1_exterior.json)
  extranjero: { kf_r2_share: 86.78, kf_votos: 52_454, rsp_votos: 7_994 },
  pct_actas: 100,
  is_demo: true,
};

const DEMO_DEPTS = {
  '010000': { ubigeo: '010000', nombre: 'AMAZONAS',      kf_r2_share: 32.38, pct_actas: 100 },
  '020000': { ubigeo: '020000', nombre: 'ÁNCASH',        kf_r2_share: 54.54, pct_actas: 100 },
  '030000': { ubigeo: '030000', nombre: 'APURÍMAC',      kf_r2_share: 14.38, pct_actas: 100 },
  '040000': { ubigeo: '040000', nombre: 'AREQUIPA',      kf_r2_share: 42.06, pct_actas: 100 },
  '050000': { ubigeo: '050000', nombre: 'AYACUCHO',      kf_r2_share: 20.52, pct_actas: 100 },
  '060000': { ubigeo: '060000', nombre: 'CAJAMARCA',     kf_r2_share: 24.92, pct_actas: 100 },
  '240000': { ubigeo: '240000', nombre: 'CALLAO',        kf_r2_share: 87.30, pct_actas: 100 },
  '070000': { ubigeo: '070000', nombre: 'CUSCO',         kf_r2_share: 21.17, pct_actas: 100 },
  '080000': { ubigeo: '080000', nombre: 'HUANCAVELICA',  kf_r2_share: 14.02, pct_actas: 100 },
  '090000': { ubigeo: '090000', nombre: 'HUÁNUCO',       kf_r2_share: 34.11, pct_actas: 100 },
  '100000': { ubigeo: '100000', nombre: 'ICA',           kf_r2_share: 72.46, pct_actas: 100 },
  '110000': { ubigeo: '110000', nombre: 'JUNÍN',         kf_r2_share: 58.14, pct_actas: 100 },
  '120000': { ubigeo: '120000', nombre: 'LA LIBERTAD',   kf_r2_share: 68.16, pct_actas: 100 },
  '130000': { ubigeo: '130000', nombre: 'LAMBAYEQUE',    kf_r2_share: 71.08, pct_actas: 100 },
  '140000': { ubigeo: '140000', nombre: 'LIMA',          kf_r2_share: 84.53, pct_actas: 100 },
  '150000': { ubigeo: '150000', nombre: 'LORETO',        kf_r2_share: 74.20, pct_actas: 100 },
  '160000': { ubigeo: '160000', nombre: 'MADRE DE DIOS', kf_r2_share: 36.62, pct_actas: 100 },
  '170000': { ubigeo: '170000', nombre: 'MOQUEGUA',      kf_r2_share: 33.96, pct_actas: 100 },
  '180000': { ubigeo: '180000', nombre: 'PASCO',         kf_r2_share: 50.27, pct_actas: 100 },
  '190000': { ubigeo: '190000', nombre: 'PIURA',         kf_r2_share: 70.97, pct_actas: 100 },
  '200000': { ubigeo: '200000', nombre: 'PUNO',          kf_r2_share: 13.52, pct_actas: 100 },
  '210000': { ubigeo: '210000', nombre: 'SAN MARTÍN',    kf_r2_share: 49.28, pct_actas: 100 },
  '220000': { ubigeo: '220000', nombre: 'TACNA',         kf_r2_share: 36.51, pct_actas: 100 },
  '230000': { ubigeo: '230000', nombre: 'TUMBES',        kf_r2_share: 83.01, pct_actas: 100 },
  '250000': { ubigeo: '250000', nombre: 'UCAYALI',       kf_r2_share: 69.76, pct_actas: 100 },
};

// ─── StatusBar ────────────────────────────────────────────────
function StatusBar({ pct_actas, snapshot_ts, isDemo }) {
  const ts = snapshot_ts
    ? new Date(snapshot_ts).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: isDemo ? '#FFFBEB' : '#F0FDF4',
      border: `1px solid ${isDemo ? '#FCD34D' : '#86EFAC'}`,
      borderRadius: 8, padding: '8px 14px', fontSize: 12,
    }}>
      <span style={{ fontWeight: 700, color: isDemo ? '#92400E' : '#15803D', display: 'flex', alignItems: 'center', gap: 5 }}>
        {isDemo ? 'DEMO · Datos R1 2026' : (
          <><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />EN VIVO</>
        )}
      </span>
      {pct_actas != null && (
        <>
          <span style={{ color: '#D4CEC8' }}>·</span>
          <span style={{ color: '#1C1917', fontWeight: 600 }}>{pct_actas.toFixed(1)}% de actas procesadas</span>
        </>
      )}
      {ts && (
        <>
          <span style={{ color: '#D4CEC8' }}>·</span>
          <span style={{ color: '#78716C' }}>Último snapshot: {ts} PET</span>
        </>
      )}
      {isDemo && (
        <span style={{ color: '#92400E', fontSize: 11 }}>— colores del mapa y tabla usan resultados reales de R1 por departamento</span>
      )}
    </div>
  );
}

// ─── Candidate summary cards ──────────────────────────────────
function CandidateCards({ kf_r2_share, proj_kf_r2_share, ci_low, ci_high, kf_votos, rsp_votos, isDemo }) {
  const rsp_r2_share  = kf_r2_share  != null ? 100 - kf_r2_share  : null;
  const proj_rsp      = proj_kf_r2_share != null ? 100 - proj_kf_r2_share : null;
  const kfLeads       = kf_r2_share >= 50;

  const fmtVotos = (v) => v != null ? v.toLocaleString('es-PE') : null;

  const card = (name, color, share, proj, votos, isLeader) => (
    <div style={{
      flex: 1, minWidth: 200,
      background: '#FFFFFF',
      border: `2px solid ${isLeader ? color + '40' : '#E5E0D8'}`,
      borderRadius: 14, padding: '18px 20px',
      position: 'relative',
    }}>
      {isLeader && (
        <div style={{
          position: 'absolute', top: 10, right: 12,
          background: color + '15', color, borderRadius: 20,
          padding: '2px 8px', fontSize: 10, fontWeight: 700,
        }}>
          VA GANANDO
        </div>
      )}
      <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>{name}</div>
      <div style={{ color, fontWeight: 800, fontSize: 38, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {share != null ? share.toFixed(1) + '%' : '—'}
      </div>
      <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 3 }}>
        votos válidos {isDemo ? '(baseline R1)' : 'contabilizados'}
      </div>
      {votos != null && (
        <div style={{ color: '#78716C', fontSize: 12, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
          {fmtVotos(votos)} votos
        </div>
      )}
      {proj != null && (
        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: '1px solid #F0EDE8',
          display: 'flex', alignItems: 'baseline', gap: 6,
        }}>
          <span style={{ color, fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
            {proj.toFixed(1)}%
          </span>
          <span style={{ color: '#A8A29E', fontSize: 11 }}>proyectado al 100%</span>
        </div>
      )}
      {isLeader && ci_low != null && !isDemo && (
        <div style={{ color: '#A8A29E', fontSize: 10, marginTop: 4 }}>
          CI 90%: [{ci_low.toFixed(1)}, {ci_high.toFixed(1)}]
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {kfLeads
        ? <>{card('Keiko Fujimori', KEIKO_COLOR, kf_r2_share, proj_kf_r2_share, kf_votos, true)}{card('Roberto Sánchez', SANCHEZ_COLOR, rsp_r2_share, proj_rsp, rsp_votos, false)}</>
        : <>{card('Roberto Sánchez', SANCHEZ_COLOR, rsp_r2_share, proj_rsp, rsp_votos, true)}{card('Keiko Fujimori', KEIKO_COLOR, kf_r2_share, proj_kf_r2_share, kf_votos, false)}</>
      }
    </div>
  );
}

// ─── Horizontal vote bars (Nacional / Extranjero) ─────────────
function VoteBars({ nacional, extranjero, isDemo }) {
  const [view, setView] = useState('nacional');
  const src = view === 'nacional' ? nacional : extranjero;

  const kfShare  = src?.kf_r2_share ?? null;
  const rspShare = kfShare != null ? 100 - kfShare : null;
  const kfLeads  = kfShare != null && kfShare >= 50;

  // Always put leader first
  const bars = kfShare != null ? (
    kfLeads
      ? [{ name: 'Keiko Fujimori',  color: KEIKO_COLOR,   share: kfShare,  votos: src?.kf_votos  },
         { name: 'Roberto Sánchez', color: SANCHEZ_COLOR,  share: rspShare, votos: src?.rsp_votos }]
      : [{ name: 'Roberto Sánchez', color: SANCHEZ_COLOR,  share: rspShare, votos: src?.rsp_votos },
         { name: 'Keiko Fujimori',  color: KEIKO_COLOR,   share: kfShare,  votos: src?.kf_votos  }]
  ) : [];

  const fmtV = (v) => v != null ? v.toLocaleString('es-PE') : null;

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 20 }}>
      {/* Header + filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ color: '#1C1917', fontSize: 15, fontWeight: 600, margin: 0 }}>
          Votos emitidos{isDemo ? <span style={{ color: '#A8A29E', fontWeight: 400, fontSize: 12 }}> · Demo R1</span> : ''}
        </h3>
        <div style={{ display: 'flex', background: '#F7F4EF', borderRadius: 8, padding: 3, gap: 2 }}>
          {['nacional', 'extranjero'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view === v ? '#FFFFFF' : 'transparent',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              padding: '5px 14px', fontSize: 12, fontWeight: view === v ? 600 : 400,
              color: view === v ? '#1C1917' : '#78716C',
              boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}>
              {v === 'nacional' ? 'Nacional' : 'Extranjero'}
            </button>
          ))}
        </div>
      </div>

      {/* Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {bars.map(b => (
          <div key={b.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
              <span style={{ color: '#1C1917', fontWeight: 600, fontSize: 13 }}>{b.name}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {b.votos != null && (
                  <span style={{ color: '#A8A29E', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtV(b.votos)} votos
                  </span>
                )}
                <span style={{ color: b.color, fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {b.share.toFixed(2)}%
                </span>
              </div>
            </div>
            <div style={{ height: 28, borderRadius: 6, background: '#F0EDE8', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                width: `${b.share}%`, height: '100%',
                background: b.color,
                borderRadius: 6,
                transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              }} />
              {/* 50% line */}
              <div style={{
                position: 'absolute', left: '50%', top: 0, bottom: 0,
                width: 1, background: 'rgba(0,0,0,0.12)',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* 50% marker label */}
      <div style={{ position: 'relative', marginTop: 4, height: 14 }}>
        <span style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          color: '#A8A29E', fontSize: 10,
        }}>50%</span>
      </div>

      {view === 'extranjero' && isDemo && (
        <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 8 }}>
          Extranjero R1: 77 países · 52,454 votos KF / 7,994 votos RSP. KF dominó en todos los continentes.
        </div>
      )}
    </div>
  );
}

// ─── Department table ─────────────────────────────────────────
function DeptTable({ deptData, isDemo }) {
  const [sortBy, setSortBy] = useState('pct_actas');

  const rows = Object.values(deptData).sort((a, b) => {
    if (sortBy === 'pct_actas') return (a.pct_actas ?? 100) - (b.pct_actas ?? 100);
    if (sortBy === 'margin')    return Math.abs((b.kf_r2_share ?? 50) - 50) - Math.abs((a.kf_r2_share ?? 50) - 50);
    return a.nombre.localeCompare(b.nombre);
  });

  const colBtn = (key, label) => (
    <button onClick={() => setSortBy(key)} style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
      color: sortBy === key ? '#1C1917' : '#A8A29E',
      fontWeight: sortBy === key ? 700 : 500, fontSize: 11,
    }}>
      {label}{sortBy === key ? ' ↑' : ''}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#8C877F', fontSize: 11 }}>Ordenar:</span>
        {colBtn('pct_actas', 'Menos contado primero')}
        {colBtn('margin', 'Mayor margen')}
        {colBtn('nombre', 'A-Z')}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E5E0D8' }}>
              <th style={{ textAlign: 'left',  padding: '5px 8px', color: '#78716C', fontWeight: 600 }}>Departamento</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#78716C', fontWeight: 600 }}>% contado</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: KEIKO_COLOR,   fontWeight: 600 }}>Keiko v.v.</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: SANCHEZ_COLOR, fontWeight: 600 }}>Sánchez v.v.</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#78716C', fontWeight: 600 }}>Margen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(dept => {
              const share    = dept.kf_r2_share;
              const rspShare = share != null ? 100 - share : null;
              const margin   = share != null ? Math.abs(share - 50).toFixed(1) : null;
              const kfLeads  = share != null && share >= 50;
              const pct      = dept.pct_actas ?? 100;
              return (
                <tr key={dept.ubigeo} style={{ borderBottom: '1px solid #F0EDE8' }}>
                  <td style={{ padding: '7px 8px', color: '#1C1917', fontWeight: 600 }}>
                    {dept.nombre}
                    {pct < 100 && (
                      <span style={{ color: '#D97706', fontSize: 10, marginLeft: 5, fontWeight: 400 }}>
                        ⏳ {(100 - pct).toFixed(0)}% falta
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                      <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E5E0D8', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16A34A' : '#D97706', borderRadius: 2 }} />
                      </div>
                      <span style={{ color: '#78716C', fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: kfLeads ? KEIKO_COLOR : '#A8A29E', fontWeight: kfLeads ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {share != null ? share.toFixed(1) + '%' : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: !kfLeads ? SANCHEZ_COLOR : '#A8A29E', fontWeight: !kfLeads ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {rspShare != null ? rspShare.toFixed(1) + '%' : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: kfLeads ? KEIKO_COLOR : SANCHEZ_COLOR, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {margin != null ? `${kfLeads ? 'K' : 'S'}+${margin}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isDemo && (
        <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 6 }}>
          Demo: resultados R1 reales por departamento. El 7J se reemplazan por el conteo ONPE en tiempo real.
        </div>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────
export default function LiveResultsTab({ predictions }) {
  const [liveData, setLiveData]   = useState(null);
  const [isLive,   setIsLive]     = useState(false);
  const [hoveredDept, setHoveredDept] = useState(null);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/live-projection`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.pct_actas > 0) { setLiveData(json); setIsLive(true); }
    } catch { /* stay in demo */ }
  }, []);

  useEffect(() => {
    fetchLive();
    const id = setInterval(fetchLive, 30_000);
    return () => clearInterval(id);
  }, [fetchLive]);

  const isDemo = !isLive;
  const data   = isLive ? liveData : DEMO.national;

  const kfShare       = data?.kf_r2_share;
  const projKfShare   = data?.proj_kf_r2_share;
  const deptData      = isLive && liveData?.departments
    ? Object.fromEntries(liveData.departments.map(d => [d.ubigeo, d]))
    : DEMO_DEPTS;

  // Needle data — live: from projector; demo: from R2 model predictions
  const modelCands = predictions?.candidates || [];
  const keikoModel  = modelCands.find(c => c.candidate?.includes('Keiko'));
  const sanchezModel = modelCands.find(c => c.candidate?.includes('Sánchez') || c.candidate?.includes('Roberto'));
  const needleKeiko = isDemo ? keikoModel : (projKfShare != null ? {
    mean: projKfShare, p10: data.ci_low ?? projKfShare - 3, p90: data.ci_high ?? projKfShare + 3,
    p25: null, p75: null, p40: null, p60: null, prob_win: projKfShare > 50 ? 72 : 28,
  } : null);
  const needleSanchez = isDemo ? sanchezModel : (needleKeiko ? {
    mean: 100 - needleKeiko.mean, p10: 100 - needleKeiko.p90, p90: 100 - needleKeiko.p10,
    prob_win: 100 - needleKeiko.prob_win,
  } : null);

  const nacional   = isLive ? liveData?.nacional   : DEMO.nacional;
  const extranjero = isLive ? liveData?.extranjero  : DEMO.extranjero;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h2 style={{ color: '#1C1917', fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
          Resultados en Vivo · 7 de junio de 2026
        </h2>
        <p style={{ color: '#78716C', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Proyección a 100% de actas en tiempo real. Actualización cada 30 segundos durante el conteo.
        </p>
      </div>

      {/* 1. Status bar */}
      <StatusBar pct_actas={data?.pct_actas} snapshot_ts={liveData?.snapshot_ts} isDemo={isDemo} />

      {/* 2. Candidate cards */}
      <CandidateCards
        kf_r2_share={kfShare}
        proj_kf_r2_share={projKfShare}
        ci_low={data?.ci_low}
        ci_high={data?.ci_high}
        kf_votos={data?.kf_votos}
        rsp_votos={data?.rsp_votos}
        isDemo={isDemo}
      />

      {/* 3. Needle — hero */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 14, padding: '24px 16px 20px' }}>
        <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', marginBottom: 4 }}>
          {isDemo ? 'Proyección pre-electoral · Modelo R2' : 'Proyección a 100% · Conteo en vivo'}
        </div>
        <WinProbabilityNeedle keiko={needleKeiko} sanchez={needleSanchez} />
      </div>

      {/* 4. Vote share bars */}
      <VoteBars nacional={nacional} extranjero={extranjero} isDemo={isDemo} />

      {/* 5. Map + dept table */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{
          flex: '0 0 auto', width: 'clamp(280px, 38%, 340px)',
          background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16,
        }}>
          <h3 style={{ color: '#1C1917', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Mapa por departamento
            {hoveredDept && (
              <span style={{ color: '#A8A29E', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                · {hoveredDept.nombre}
              </span>
            )}
          </h3>
          <PeruDeptMap deptData={deptData} onDeptHover={setHoveredDept} />
        </div>

        <div style={{ flex: 1, minWidth: 280, background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
          <h3 style={{ color: '#1C1917', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Resultados por departamento
          </h3>
          <DeptTable deptData={deptData} isDemo={isDemo} />
        </div>
      </div>
    </div>
  );
}
