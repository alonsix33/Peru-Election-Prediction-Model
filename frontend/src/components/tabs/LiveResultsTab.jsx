import { useState, useEffect, useCallback } from 'react';
import { getPartyColor } from '../../config/partyColors';
import WinProbabilityNeedle from '../WinProbabilityNeedle';
import PeruDeptMap from '../PeruDeptMap';

const KEIKO_COLOR   = getPartyColor('Keiko Fujimori').primary;
const SANCHEZ_COLOR = getPartyColor('Roberto Sánchez Palomino').primary;
const API_BASE      = import.meta.env.VITE_API_URL || '';

// ─── R1 demo dept data (aggregated from province_baseline) ────
// kf_r2_share = KF / (KF + RSP) in R1 — used to demo map colors
const R1_DEPT_DEMO = {
  '010000': { ubigeo: '010000', nombre: 'AMAZONAS',      kf_r2_share: 32.38, kfV: null, rspV: null, pct_actas: 100 },
  '020000': { ubigeo: '020000', nombre: 'ÁNCASH',        kf_r2_share: 54.54, kfV: null, rspV: null, pct_actas: 100 },
  '030000': { ubigeo: '030000', nombre: 'APURÍMAC',      kf_r2_share: 14.38, kfV: null, rspV: null, pct_actas: 100 },
  '040000': { ubigeo: '040000', nombre: 'AREQUIPA',      kf_r2_share: 42.06, kfV: null, rspV: null, pct_actas: 100 },
  '050000': { ubigeo: '050000', nombre: 'AYACUCHO',      kf_r2_share: 20.52, kfV: null, rspV: null, pct_actas: 100 },
  '060000': { ubigeo: '060000', nombre: 'CAJAMARCA',     kf_r2_share: 24.92, kfV: null, rspV: null, pct_actas: 100 },
  '240000': { ubigeo: '240000', nombre: 'CALLAO',        kf_r2_share: 87.30, kfV: null, rspV: null, pct_actas: 100 },
  '070000': { ubigeo: '070000', nombre: 'CUSCO',         kf_r2_share: 21.17, kfV: null, rspV: null, pct_actas: 100 },
  '080000': { ubigeo: '080000', nombre: 'HUANCAVELICA',  kf_r2_share: 14.02, kfV: null, rspV: null, pct_actas: 100 },
  '090000': { ubigeo: '090000', nombre: 'HUÁNUCO',       kf_r2_share: 34.11, kfV: null, rspV: null, pct_actas: 100 },
  '100000': { ubigeo: '100000', nombre: 'ICA',           kf_r2_share: 72.46, kfV: null, rspV: null, pct_actas: 100 },
  '110000': { ubigeo: '110000', nombre: 'JUNÍN',         kf_r2_share: 58.14, kfV: null, rspV: null, pct_actas: 100 },
  '120000': { ubigeo: '120000', nombre: 'LA LIBERTAD',   kf_r2_share: 68.16, kfV: null, rspV: null, pct_actas: 100 },
  '130000': { ubigeo: '130000', nombre: 'LAMBAYEQUE',    kf_r2_share: 71.08, kfV: null, rspV: null, pct_actas: 100 },
  '140000': { ubigeo: '140000', nombre: 'LIMA',          kf_r2_share: 84.53, kfV: null, rspV: null, pct_actas: 100 },
  '150000': { ubigeo: '150000', nombre: 'LORETO',        kf_r2_share: 74.20, kfV: null, rspV: null, pct_actas: 100 },
  '160000': { ubigeo: '160000', nombre: 'MADRE DE DIOS', kf_r2_share: 36.62, kfV: null, rspV: null, pct_actas: 100 },
  '170000': { ubigeo: '170000', nombre: 'MOQUEGUA',      kf_r2_share: 33.96, kfV: null, rspV: null, pct_actas: 100 },
  '180000': { ubigeo: '180000', nombre: 'PASCO',         kf_r2_share: 50.27, kfV: null, rspV: null, pct_actas: 100 },
  '190000': { ubigeo: '190000', nombre: 'PIURA',         kf_r2_share: 70.97, kfV: null, rspV: null, pct_actas: 100 },
  '200000': { ubigeo: '200000', nombre: 'PUNO',          kf_r2_share: 13.52, kfV: null, rspV: null, pct_actas: 100 },
  '210000': { ubigeo: '210000', nombre: 'SAN MARTÍN',    kf_r2_share: 49.28, kfV: null, rspV: null, pct_actas: 100 },
  '220000': { ubigeo: '220000', nombre: 'TACNA',         kf_r2_share: 36.51, kfV: null, rspV: null, pct_actas: 100 },
  '230000': { ubigeo: '230000', nombre: 'TUMBES',        kf_r2_share: 83.01, kfV: null, rspV: null, pct_actas: 100 },
  '250000': { ubigeo: '250000', nombre: 'UCAYALI',       kf_r2_share: 69.76, kfV: null, rspV: null, pct_actas: 100 },
};

// Demo national aggregate from R1 dept data
const R1_NATIONAL_DEMO = {
  kf_r2_share:      58.81, // known R1 national
  proj_kf_r2_share: 58.81,
  ci_low:           57.5,
  ci_high:          60.1,
  pct_actas:        100,
  is_demo:          true,
};

// ─── StatusBar ────────────────────────────────────────────────
function StatusBar({ data, isDemo }) {
  const ts = data?.snapshot_ts
    ? new Date(data.snapshot_ts).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: isDemo ? '#FFFBEB' : '#F0FDF4',
      border: `1px solid ${isDemo ? '#FCD34D' : '#86EFAC'}`,
      borderRadius: 8, padding: '8px 14px', fontSize: 12,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontWeight: 700, color: isDemo ? '#92400E' : '#15803D', fontSize: 12,
      }}>
        {isDemo ? (
          'DEMO · Datos R1 2026'
        ) : (
          <><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A', display: 'inline-block', boxShadow: '0 0 0 2px rgba(22,163,74,0.3)', animation: 'pulse 1.5s infinite' }} />EN VIVO</>
        )}
      </span>
      {data?.pct_actas != null && (
        <>
          <span style={{ color: '#A8A29E' }}>·</span>
          <span style={{ color: '#1C1917', fontWeight: 600 }}>
            {data.pct_actas.toFixed(1)}% de actas procesadas
          </span>
        </>
      )}
      {ts && (
        <>
          <span style={{ color: '#A8A29E' }}>·</span>
          <span style={{ color: '#78716C' }}>Último snapshot: {ts} PET</span>
        </>
      )}
      {isDemo && (
        <span style={{ color: '#92400E', fontSize: 11 }}>
          — El mapa muestra resultados R1 reales por departamento. El needle muestra la proyección R2 del modelo.
        </span>
      )}
    </div>
  );
}

// ─── Result cards ─────────────────────────────────────────────
function ResultCards({ data, predictions }) {
  const isDemo = data?.is_demo;

  // For needle in demo: use R2 model prediction
  const modelCands = predictions?.candidates || [];
  const keikoModel  = modelCands.find(c => c.candidate?.includes('Keiko'));
  const sanchezModel = modelCands.find(c => c.candidate?.includes('Sánchez') || c.candidate?.includes('Roberto'));

  // For cards: use live data if available, else demo
  const kfShare   = data?.proj_kf_r2_share ?? data?.kf_r2_share;
  const rspShare  = kfShare != null ? (100 - kfShare) : null;
  const kfObs     = data?.kf_r2_share;
  const kfProj    = data?.proj_kf_r2_share;
  const ciLow     = data?.ci_low;
  const ciHigh    = data?.ci_high;
  const pWin      = isDemo
    ? keikoModel?.prob_win
    : (kfShare != null ? (kfShare > 50 ? 100 - (ciHigh - 50) / (ciHigh - ciLow) * 20 : null) : null);

  const needleKeiko = isDemo && keikoModel ? keikoModel : kfShare != null ? {
    mean:     kfShare,
    p10:      ciLow ?? kfShare - 3,
    p90:      ciHigh ?? kfShare + 3,
    p25:      null,
    p75:      null,
    p40:      null,
    p60:      null,
    prob_win: pWin ?? 50,
  } : null;

  const needleSanchez = isDemo && sanchezModel ? sanchezModel : needleKeiko ? {
    mean:     100 - needleKeiko.mean,
    p10:      100 - needleKeiko.p90,
    p90:      100 - needleKeiko.p10,
    prob_win: 100 - (needleKeiko.prob_win ?? 50),
  } : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Needle */}
      <WinProbabilityNeedle keiko={needleKeiko} sanchez={needleSanchez} />

      {/* Number cards */}
      {kfShare != null && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {/* KF */}
          <div style={{ flex: 1, minWidth: 150, background: '#FFF7ED', border: `2px solid ${KEIKO_COLOR}30`, borderRadius: 10, padding: 14 }}>
            <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>Keiko Fujimori</div>
            <div style={{ color: KEIKO_COLOR, fontWeight: 800, fontSize: 28, lineHeight: 1 }}>
              {kfShare.toFixed(1)}%
            </div>
            <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 3 }}>votos válidos {isDemo ? '(R1 baseline)' : 'proyectados'}</div>
            {!isDemo && kfObs != null && kfProj != null && Math.abs(kfObs - kfProj) > 0.1 && (
              <div style={{ color: '#78716C', fontSize: 11, marginTop: 4 }}>
                observado: {kfObs.toFixed(1)}% · proyectado: {kfProj.toFixed(1)}%
              </div>
            )}
            {ciLow != null && !isDemo && (
              <div style={{ color: '#A8A29E', fontSize: 10, marginTop: 2 }}>
                CI 90%: [{ciLow.toFixed(1)}, {ciHigh.toFixed(1)}]
              </div>
            )}
          </div>

          {/* RSP */}
          <div style={{ flex: 1, minWidth: 150, background: '#F0FDF4', border: `2px solid ${SANCHEZ_COLOR}30`, borderRadius: 10, padding: 14 }}>
            <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>Roberto Sánchez</div>
            <div style={{ color: SANCHEZ_COLOR, fontWeight: 800, fontSize: 28, lineHeight: 1 }}>
              {rspShare.toFixed(1)}%
            </div>
            <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 3 }}>votos válidos {isDemo ? '(R1 baseline)' : 'proyectados'}</div>
          </div>

          {/* P(win) */}
          {pWin != null && (
            <div style={{ flex: 1, minWidth: 130, background: '#F7F4EF', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ color: '#8C877F', fontSize: 11, marginBottom: 4 }}>P(gana)</div>
              <div style={{ color: kfShare >= 50 ? KEIKO_COLOR : SANCHEZ_COLOR, fontWeight: 800, fontSize: 24, lineHeight: 1 }}>
                {pWin.toFixed(1)}%
              </div>
              <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 3 }}>
                {kfShare >= 50 ? 'Keiko Fujimori' : 'Roberto Sánchez'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Department table ─────────────────────────────────────────
function DeptTable({ deptData, isDemo }) {
  const [sortBy, setSortBy] = useState('pct_actas'); // asc: least counted first

  const rows = Object.values(deptData).sort((a, b) => {
    if (sortBy === 'pct_actas') return (a.pct_actas ?? 100) - (b.pct_actas ?? 100);
    if (sortBy === 'margin')    return Math.abs((b.kf_r2_share ?? 50) - 50) - Math.abs((a.kf_r2_share ?? 50) - 50);
    if (sortBy === 'nombre')    return a.nombre.localeCompare(b.nombre);
    return 0;
  });

  const colBtn = (key, label) => (
    <button
      onClick={() => setSortBy(key)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
        color: sortBy === key ? '#1C1917' : '#A8A29E',
        fontWeight: sortBy === key ? 700 : 500,
        fontSize: 11, textAlign: 'left',
      }}
    >{label}{sortBy === key ? ' ↑' : ''}</button>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#8C877F', fontSize: 11 }}>Ordenar por:</span>
        {colBtn('pct_actas', 'Menos contado primero')}
        {colBtn('margin',    'Mayor margen primero')}
        {colBtn('nombre',    'A-Z')}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E5E0D8' }}>
              <th style={{ textAlign: 'left',   padding: '5px 8px', color: '#78716C', fontWeight: 600 }}>Departamento</th>
              <th style={{ textAlign: 'right',  padding: '5px 8px', color: '#78716C', fontWeight: 600 }}>% contado</th>
              <th style={{ textAlign: 'right',  padding: '5px 8px', color: KEIKO_COLOR,   fontWeight: 600 }}>Keiko v.v.</th>
              <th style={{ textAlign: 'right',  padding: '5px 8px', color: SANCHEZ_COLOR, fontWeight: 600 }}>Sánchez v.v.</th>
              <th style={{ textAlign: 'right',  padding: '5px 8px', color: '#78716C', fontWeight: 600 }}>Margen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(dept => {
              const share   = dept.kf_r2_share;
              const rspShare = share != null ? 100 - share : null;
              const margin  = share != null ? Math.abs(share - 50).toFixed(1) : null;
              const kfLeads = share != null && share >= 50;
              const pct     = dept.pct_actas ?? 100;
              const rowBg   = share == null ? '#F7F4EF'
                : kfLeads ? `rgba(249,115,22,${Math.min(0.10, (share - 50) / 50 * 0.12)})`
                : `rgba(22,163,74,${Math.min(0.10, (50 - share) / 50 * 0.12)})`;

              return (
                <tr key={dept.ubigeo} style={{ borderBottom: '1px solid #F0EDE8', background: rowBg }}>
                  <td style={{ padding: '7px 8px', color: '#1C1917', fontWeight: 600 }}>
                    {dept.nombre}
                    {pct < 100 && (
                      <span style={{ color: '#D97706', fontSize: 10, marginLeft: 5, fontWeight: 400 }}>
                        ⏳ {(100 - pct).toFixed(0)}% pendiente
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                      <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E5E0D8', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16A34A' : '#D97706', borderRadius: 2 }} />
                      </div>
                      <span style={{ color: pct < 50 ? '#D97706' : '#78716C' }}>{pct.toFixed(0)}%</span>
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
          Datos demo: resultados R1 2026 reales por departamento (votos válidos KF/RSP de R1).
          El 7J estos valores se reemplazarán por el conteo real de ONPE en tiempo real.
        </div>
      )}
    </div>
  );
}

// ─── Strata strip ─────────────────────────────────────────────
function StrataStrip({ data, isDemo }) {
  const strata = isDemo ? [
    { label: 'Mesas regulares', pct_actas: 100, kf_share: 58.46, note: 'Baseline R1 doméstico' },
    { label: 'ZDAs (4,703 mesas)', pct_actas: 0,   kf_share: 28.2,  note: 'Siempre proyectado desde snapshot 1' },
    { label: 'Exterior (77 países)', pct_actas: 100, kf_share: 86.78, note: 'R1 cerró primero' },
  ] : [
    { label: 'Mesas regulares',    pct_actas: data?.regular?.pct_actas,  kf_share: data?.regular?.kf_r2_share,  note: null },
    { label: 'ZDAs (4,703 mesas)', pct_actas: data?.zda?.reported_mesas ? Math.round(data.zda.reported_mesas / 4703 * 100) : 0, kf_share: data?.zda?.proj_kf_r2_share, note: 'Siempre proyectado' },
    { label: 'Exterior',           pct_actas: data?.exterior?.pct_actas, kf_share: data?.exterior?.kf_r2_share, note: null },
  ];

  return (
    <div style={{ background: '#F7F4EF', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ color: '#78716C', fontWeight: 600, fontSize: 12, marginBottom: 10 }}>Desglose por estrato</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {strata.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 160px', color: '#1C1917', fontSize: 12, fontWeight: 500 }}>{s.label}</div>
            <div style={{ width: 60, height: 4, borderRadius: 2, background: '#E5E0D8', overflow: 'hidden' }}>
              <div style={{ width: `${s.pct_actas ?? 0}%`, height: '100%', background: s.pct_actas === 100 ? '#16A34A' : '#D97706', borderRadius: 2 }} />
            </div>
            <div style={{ color: '#78716C', fontSize: 11, minWidth: 60 }}>{(s.pct_actas ?? 0).toFixed(0)}% contado</div>
            {s.kf_share != null && (
              <div style={{ color: s.kf_share >= 50 ? KEIKO_COLOR : SANCHEZ_COLOR, fontWeight: 600, fontSize: 12 }}>
                {s.kf_share >= 50 ? `KF ${s.kf_share.toFixed(1)}%` : `RSP ${(100 - s.kf_share).toFixed(1)}%`}
              </div>
            )}
            {s.note && <div style={{ color: '#A8A29E', fontSize: 10 }}>{s.note}</div>}
          </div>
        ))}
      </div>
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
      // Only switch to live if we have real actas
      if (json?.pct_actas > 0) {
        setLiveData(json);
        setIsLive(true);
      }
    } catch {
      // Silently fail — keep showing demo
    }
  }, []);

  // Poll every 30s on election day; otherwise just check once on mount
  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 30_000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  const isDemo   = !isLive;
  const data     = isLive ? liveData : R1_NATIONAL_DEMO;
  const deptData = isLive && liveData?.departments
    ? Object.fromEntries(liveData.departments.map(d => [d.ubigeo, d]))
    : R1_DEPT_DEMO;

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

      {/* Status bar */}
      <StatusBar data={data} isDemo={isDemo} />

      {/* Needle + cards */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
        <div style={{ color: '#8C877F', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          {isDemo ? 'Proyección pre-electoral · Modelo R2' : 'Proyección · Conteo en vivo'}
        </div>
        <ResultCards data={data} predictions={predictions} />
      </div>

      {/* Map + dept table side by side (stacked on mobile) */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Map */}
        <div style={{
          flex: '0 0 auto', width: 'clamp(280px, 40%, 360px)',
          background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16,
        }}>
          <h3 style={{ color: '#1C1917', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Mapa por departamento
            {hoveredDept && (
              <span style={{ color: '#A8A29E', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                {hoveredDept.nombre}
              </span>
            )}
          </h3>
          <PeruDeptMap deptData={deptData} onDeptHover={setHoveredDept} />
        </div>

        {/* Dept table */}
        <div style={{
          flex: 1, minWidth: 300,
          background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16,
        }}>
          <h3 style={{ color: '#1C1917', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Resultados por departamento
          </h3>
          <DeptTable deptData={deptData} isDemo={isDemo} />
        </div>
      </div>

      {/* Strata strip */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
        <StrataStrip data={liveData} isDemo={isDemo} />
      </div>
    </div>
  );
}
