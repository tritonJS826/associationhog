const AUTHOR_REASONS = [
  /prodat/i,
  /prodato/i,
  /deaktivira/i,
  /deleted/i,
  /uklonjen/i,
  /obrisan/i,
  /sold/i,
  /user deactiv/i,
  /oglašivač/i,
  /korisnik/i,
];

const MARKETPLACE_REASONS = [
  /istekao/i,
  /istekla/i,
  /expired/i,
  /automatski/i,
  /archive/i,
  /validity/i,
];

export function classifyClose(text) {
  if (!text) return null;
  if (AUTHOR_REASONS.some((r) => r.test(text))) return 'author';
  if (MARKETPLACE_REASONS.some((r) => r.test(text))) return 'platform';
  return null;
}

export function toDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
