import { useState, useRef } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { getPartyColor } from '../config/partyColors';

const KEIKO_COLOR_RGB   = '249, 115, 22';  // #F97316
const SANCHEZ_COLOR_RGB = '22, 163, 74';   // #16A34A
const GEO_URL = '/peru_dept.geojson';

function getDeptData(geoProps, deptData) {
  const id = geoProps.FIRST_IDDP; // "01".."25"
  return Object.values(deptData).find(d => d.ubigeo.slice(0, 2) === id) || null;
}

function getFillColor(kf_r2_share) {
  if (kf_r2_share == null) return '#E5E0D8';
  const margin  = Math.abs(kf_r2_share - 50);
  const opacity = Math.min(0.92, margin / 25 * 0.77 + 0.15);
  const rgb = kf_r2_share >= 50 ? KEIKO_COLOR_RGB : SANCHEZ_COLOR_RGB;
  return `rgba(${rgb}, ${opacity.toFixed(2)})`;
}

function Tooltip({ tooltip }) {
  if (!tooltip) return null;
  const { x, y, dept } = tooltip;
  const isMobile = tooltip.isMobile;

  // Mobile: fixed bottom sheet. Desktop: floating near cursor.
  if (isMobile) {
    return (
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: '#1C1917', color: '#F7F4EF',
        borderRadius: 12, padding: '12px 18px',
        fontSize: 13, zIndex: 50,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        minWidth: 180, textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{dept?.nombre ?? '—'}</div>
        {dept?.kf_r2_share != null ? (
          <>
            <div style={{ color: dept.kf_r2_share >= 50 ? `rgb(${KEIKO_COLOR_RGB})` : `rgb(${SANCHEZ_COLOR_RGB})`, fontWeight: 600 }}>
              {dept.kf_r2_share >= 50
                ? `Keiko ${dept.kf_r2_share.toFixed(1)}%`
                : `Sánchez ${(100 - dept.kf_r2_share).toFixed(1)}%`}
            </div>
            <div style={{ color: '#A8A29E', fontSize: 11, marginTop: 2 }}>
              margen {Math.abs(dept.kf_r2_share - 50).toFixed(1)}pp
            </div>
          </>
        ) : (
          <div style={{ color: '#A8A29E' }}>Sin datos</div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      left: x + 12, top: y - 8,
      background: '#1C1917', color: '#F7F4EF',
      borderRadius: 8, padding: '8px 12px',
      fontSize: 12, pointerEvents: 'none',
      whiteSpace: 'nowrap', zIndex: 10,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{dept?.nombre ?? '—'}</div>
      {dept?.kf_r2_share != null ? (
        <>
          <div style={{ color: dept.kf_r2_share >= 50 ? `rgb(${KEIKO_COLOR_RGB})` : `rgb(${SANCHEZ_COLOR_RGB})` }}>
            {dept.kf_r2_share >= 50
              ? `Keiko ${dept.kf_r2_share.toFixed(1)}%`
              : `Sánchez ${(100 - dept.kf_r2_share).toFixed(1)}%`}
          </div>
          <div style={{ color: '#A8A29E', fontSize: 11 }}>
            margen {Math.abs(dept.kf_r2_share - 50).toFixed(1)}pp
          </div>
        </>
      ) : (
        <div style={{ color: '#A8A29E' }}>Sin datos</div>
      )}
    </div>
  );
}

export default function PeruDeptMap({ deptData, onDeptHover }) {
  const [tooltip, setTooltip] = useState(null);
  const touchTimeoutRef = useRef(null);
  const containerRef = useRef(null);

  // ── Desktop: hover ──────────────────────────────────────────
  const handleMouseMove = (geo, evt) => {
    const data = getDeptData(geo.properties, deptData);
    const rect  = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
      isMobile: false,
      dept: { nombre: geo.properties.NOMBDEP, ...data },
    });
    onDeptHover?.(data);
  };

  const handleMouseLeave = () => {
    setTooltip(null);
    onDeptHover?.(null);
  };

  // ── Mobile: tap ─────────────────────────────────────────────
  const handleTouchStart = (geo, evt) => {
    evt.preventDefault(); // prevent ghost click
    const data = getDeptData(geo.properties, deptData);
    setTooltip({
      x: 0, y: 0,
      isMobile: true,
      dept: { nombre: geo.properties.NOMBDEP, ...data },
    });
    onDeptHover?.(data);
    // Auto-dismiss after 3s
    clearTimeout(touchTimeoutRef.current);
    touchTimeoutRef.current = setTimeout(() => {
      setTooltip(null);
      onDeptHover?.(null);
    }, 3000);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [-75, -9], scale: 1050 }}
        width={400}
        height={520}
        style={{ width: '100%', height: 'auto' }}
      >
        <ZoomableGroup zoom={1} minZoom={1} maxZoom={6}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const data  = getDeptData(geo.properties, deptData);
                const share = data?.kf_r2_share ?? null;
                const fill  = getFillColor(share);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#FFFFFF"
                    strokeWidth={0.6}
                    style={{
                      default:  { outline: 'none', cursor: 'pointer' },
                      hover:    { outline: 'none', filter: 'brightness(1.12)', cursor: 'pointer' },
                      pressed:  { outline: 'none' },
                    }}
                    onMouseMove={(evt) => handleMouseMove(geo, evt)}
                    onMouseLeave={handleMouseLeave}
                    onTouchStart={(evt) => handleTouchStart(geo, evt)}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      <Tooltip tooltip={tooltip} />

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Sánchez dom.', rgb: SANCHEZ_COLOR_RGB, op: 0.85 },
          { label: 'Sánchez leve', rgb: SANCHEZ_COLOR_RGB, op: 0.25 },
          { label: 'Keiko leve',   rgb: KEIKO_COLOR_RGB,   op: 0.25 },
          { label: 'Keiko dom.',   rgb: KEIKO_COLOR_RGB,   op: 0.85 },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 22, height: 10, borderRadius: 2, background: `rgba(${l.rgb}, ${l.op})` }} />
            <span style={{ color: '#78716C', fontSize: 10 }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
