export const GLOSSARY = {
  IC_90: {
    title: 'Intervalo de Confianza al 90%',
    body: 'Rango donde esperamos que caiga el resultado real en 9 de cada 10 simulaciones. Si el IC es [45%, 55%], el modelo dice que es poco probable que el resultado quede fuera de esa banda. A mayor IC, mayor incertidumbre.',
  },
  P_GANAR: {
    title: 'P(Ganar) — Probabilidad de ganar',
    body: 'Porcentaje de las 10,000 simulaciones en que ese candidato llegó primero. Un 60% no significa que sacará 60% de los votos; significa que ganó en 6 de cada 10 versiones posibles de la elección según el modelo.',
  },
  MAE: {
    title: 'MAE — Error Absoluto Medio',
    body: 'Promedio del error del modelo en puntos porcentuales. Un MAE de 2.2 significa que, en promedio, el modelo se alejó 2.2pp del resultado real por candidato. Más bajo es mejor.',
  },
  POSTERIOR: {
    title: 'Posterior bayesiano',
    body: 'El número que usa el modelo internamente, combinando encuestas (75–80%) y Polymarket (20–25%). Es el punto de partida de las simulaciones. Difiere del % de encuestas porque incorpora información del mercado y correcciones estadísticas.',
  },
  POLYMARKET_ALPHA: {
    title: 'Alpha (α) de Polymarket',
    body: 'Qué tanto peso tiene Polymarket vs. las encuestas en el modelo. α=25% significa que Polymarket pesa 25% y las encuestas 75%. Durante la veda electoral, sube hasta 60% porque no hay nuevas encuestas disponibles.',
  },
  VOTO_BLANCO: {
    title: 'Voto blanco / nulo',
    body: 'Votos que no cuentan para ningún candidato. En Perú, votar en blanco (tarjeta sin marcar) o nulo (tarjeta anulada) es una forma de rechazo activo. El modelo lo estima a partir del rechazo bilateral de ambos candidatos.',
  },
  TRANSFERENCIA_VOTO: {
    title: 'Transferencia de voto',
    body: 'En segunda vuelta, los votantes de candidatos eliminados deben elegir entre los dos finalistas. Históricamente, entre el 40% y 60% sigue la recomendación de su líder. El resto vota libremente, en blanco, o no va a votar.',
  },
};
