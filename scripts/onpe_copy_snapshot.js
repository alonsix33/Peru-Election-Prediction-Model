// Pegar en DevTools Console en resultadosegundavuelta.onpe.gob.pe
// Requiere que el bookmarklet ya esté corriendo en la misma pestaña
// Luego llama: copySnapshot()

window.copySnapshot = async function() {
  console.log('📋 Recolectando snapshot...');
  const snap = await buildSnapshot();
  const out = {
    pct_actas:     snap.pct_actas,
    actas_total:   snap.actas_total,
    actas_processed: snap.actas_processed,
    keiko_votos:   snap.keiko_votos,
    keiko_pct:     snap.keiko_pct,
    sanchez_votos: snap.sanchez_votos,
    sanchez_pct:   snap.sanchez_pct,
    dept_breakdown: (snap.dept_breakdown || []).map(d => ({
      nombre: d.nombre, ubigeo: d.ubigeo,
      kf: d.keiko_votos, rsp: d.sanchez_votos, pct: d.pct_actas,
    })),
  };
  const txt = JSON.stringify(out, null, 2);
  await navigator.clipboard.writeText(txt).catch(() => {});
  console.log(`📋 ✅ KF ${out.keiko_pct}% | RSP ${out.sanchez_pct}% | actas ${out.pct_actas}%`);
  console.log(txt);
};

console.log('📋 copySnapshot() listo');
