// Benchmark: Array.includes() vs Set.has() + precompute en loops
// Ejecutar: node .backup_O_n2_20260421/benchmark.mjs

const N_CONDUCTORES = 600;
const N_DRIVERS = 2000;
const N_FILTERS = 50;

const rnd = (n) => Math.floor(Math.random() * n);

const conductores = Array.from({ length: N_CONDUCTORES }, (_, i) => ({
  id: `c${i}`,
  nombres: `Nombre${i}`,
  apellidos: `Apellido${i}`,
  patente: `AB${String(i).padStart(4, '0')}X`,
}));

const drivers = Array.from({ length: N_DRIVERS }, (_, i) => ({
  name: `Nombre${rnd(N_CONDUCTORES)}`,
  surname: `Apellido${rnd(N_CONDUCTORES)}`,
  cobroApp: rnd(100000),
  cobroEfectivo: rnd(50000),
}));

const conductorIds = conductores.map(c => c.id);
const patenteFilter = Array.from({ length: N_FILTERS }, () => `AB${String(rnd(N_CONDUCTORES)).padStart(4, '0')}X`);

// ═══════════════════════════════════════════════════
// Bench 1: Filter con Array.includes() vs Set.has()
// ═══════════════════════════════════════════════════
function bench(label, fn, iterations = 100) {
  const t0 = performance.now();
  let out;
  for (let i = 0; i < iterations; i++) out = fn();
  const t1 = performance.now();
  return { label, ms: (t1 - t0).toFixed(2), perIter: ((t1 - t0) / iterations).toFixed(3), out: out.length };
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`FILTRO (${N_CONDUCTORES} conductores × ${N_FILTERS} filtros)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const antes = bench('ANTES  Array.includes()', () =>
  conductores.filter(c => patenteFilter.includes(c.patente))
);

const despues = bench('DESPUES Set.has()', () => {
  const set = new Set(patenteFilter);
  return conductores.filter(c => set.has(c.patente));
});

console.log(`${antes.label}  → ${antes.ms}ms total (${antes.perIter}ms/iter, ${antes.out} matches)`);
console.log(`${despues.label}  → ${despues.ms}ms total (${despues.perIter}ms/iter, ${despues.out} matches)`);
console.log(`SPEEDUP: ${(antes.ms / despues.ms).toFixed(1)}×`);

// ═══════════════════════════════════════════════════
// Bench 2: find() con recomputo vs precompute
// ═══════════════════════════════════════════════════
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`NAME MATCH (${N_CONDUCTORES} conductores × ${N_DRIVERS} drivers)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const antes2 = bench('ANTES  recompute string per call', () => {
  const r = [];
  for (const c of conductores) {
    const nombresLower = c.nombres.toLowerCase();
    const apellidosLower = c.apellidos.toLowerCase();
    const matched = drivers.find(d => {
      const full = `${d.name} ${d.surname}`.trim().toLowerCase();
      return full.includes(nombresLower) && full.includes(apellidosLower);
    });
    if (matched) r.push({ c, d: matched });
  }
  return r;
}, 5);

const despues2 = bench('DESPUES precompute driversLower', () => {
  const driversLower = drivers.map(d => ({
    d, full: `${d.name} ${d.surname}`.trim().toLowerCase(),
  }));
  const r = [];
  for (const c of conductores) {
    const nombresLower = c.nombres.toLowerCase();
    const apellidosLower = c.apellidos.toLowerCase();
    const matched = driversLower.find(dl =>
      dl.full.includes(nombresLower) && dl.full.includes(apellidosLower)
    );
    if (matched) r.push({ c, d: matched.d });
  }
  return r;
}, 5);

console.log(`${antes2.label}  → ${antes2.ms}ms total (${antes2.perIter}ms/iter, ${antes2.out} matches)`);
console.log(`${despues2.label}  → ${despues2.ms}ms total (${despues2.perIter}ms/iter, ${despues2.out} matches)`);
console.log(`SPEEDUP: ${(antes2.ms / despues2.ms).toFixed(1)}×`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
