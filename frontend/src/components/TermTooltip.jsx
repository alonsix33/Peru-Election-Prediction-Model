import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import { GLOSSARY } from '../config/glossary';

function TooltipModal({ entry, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tooltip-title"
        style={{
          background: '#FFFFFF', border: '1px solid #E5E0D8', borderRadius: 14,
          padding: 24, maxWidth: 320, width: '100%', position: 'relative',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute', top: 10, right: 10, background: 'transparent',
            border: 'none', color: '#8C877F', cursor: 'pointer', padding: 4,
          }}
        >
          <X size={16} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Info size={16} style={{ color: '#1D4ED8', flexShrink: 0 }} />
          <h3 id="tooltip-title" style={{ color: '#1C1917', fontSize: 14, fontWeight: 700, margin: 0 }}>
            {entry.title}
          </h3>
        </div>
        <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.6, margin: '0 0 16px' }}>
          {entry.body}
        </p>
        <button
          onClick={onClose}
          style={{
            width: '100%', background: '#1D4ED8', color: '#FFFFFF', border: 'none',
            borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', minHeight: 40,
          }}
        >
          Entendido
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function TermTooltip({ term }) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[term];
  if (!entry) return null;

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={`Explicar: ${entry.title}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen(true); }
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 4, marginLeft: 2, verticalAlign: 'middle',
          color: '#A8A29E', borderRadius: '50%',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#1D4ED8'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#A8A29E'; }}
      >
        <Info size={13} />
      </span>
      {open && <TooltipModal entry={entry} onClose={() => setOpen(false)} />}
    </>
  );
}
