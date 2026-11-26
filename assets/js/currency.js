// The viewer's currency. Prices stay as the issuer states them; this only adds
// an approximate amount in the currency the viewer picks. Rates come from
// data/rates.json, which scripts/rates.mjs fills from public APIs: the European
// Central Bank reference rates (Frankfurter) and, for the Argentine peso, the
// "dólar tarjeta" rate that applies to card payments abroad (DolarApi).

let RATES = null;
let CODE = "USD";

export async function loadRates() {
  try {
    const res = await fetch(new URL("../../data/rates.json", import.meta.url), { cache: "no-cache" });
    if (res.ok) RATES = await res.json();
  } catch { RATES = null; }
  return RATES;
}

export const currencyCodes = () => ["USD", ...Object.keys(RATES?.per_usd || {}).filter(c => c !== "USD").sort()];
export const currency = () => CODE;
export function setCurrency(code) {
  CODE = code === "USD" || RATES?.per_usd?.[code] > 0 ? code : "USD";
  return CODE;
}

// A first guess from the browser's language region, used only until the viewer picks one.
const REGION = {
  AR: "ARS", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", BR: "BRL", MX: "MXN", IN: "INR", JP: "JPY",
  KR: "KRW", CN: "CNY", HK: "HKD", SG: "SGD", MY: "MYR", ID: "IDR", PH: "PHP", TH: "THB", IL: "ILS", CH: "CHF",
  SE: "SEK", NO: "NOK", DK: "DKK", IS: "ISK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", TR: "TRY", ZA: "ZAR",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", PT: "EUR", IE: "EUR", FI: "EUR",
  GR: "EUR", SK: "EUR", SI: "EUR", LT: "EUR", LV: "EUR", EE: "EUR", LU: "EUR", MT: "EUR", CY: "EUR", HR: "EUR",
};
export function guessCurrency() {
  for (const tag of navigator.languages || [navigator.language || ""]) {
    const region = (tag.split("-")[1] || "").toUpperCase();
    if (REGION[region] && (REGION[region] === "USD" || RATES?.per_usd?.[REGION[region]])) return REGION[region];
  }
  return "USD";
}

const formatters = new Map();
export function fmtMoney(amount, code = CODE) {
  if (!formatters.has(code)) {
    formatters.set(code, new Intl.NumberFormat(code === "ARS" ? "es-AR" : undefined, { style: "currency", currency: code, currencyDisplay: "code", maximumFractionDigits: 0 }));
  }
  return formatters.get(code).format(Math.round(amount));
}

// Dollars to the viewer's currency.
export const fromUsd = usd => (usd == null ? null : CODE === "USD" ? usd : usd * (RATES?.per_usd?.[CODE] || NaN));

// The approximate cost of one certification in the viewer's currency, or "" when
// there is nothing to convert (no price, free, or already in that currency).
export function localAmount(c) {
  if (CODE === "USD" || !c.price_usd) return "";
  const foreign = c.currency && c.currency !== "USD" && c.price_original != null;
  if (foreign && c.currency === CODE) return "";
  const usd = foreign && RATES?.usd_per?.[c.currency] ? c.price_original * RATES.usd_per[c.currency] : c.price_usd;
  const v = fromUsd(usd);
  return Number.isFinite(v) ? "≈ " + fmtMoney(v) : "";
}

// Where the viewer's rate comes from, for a small note next to the amount.
export function rateSource() {
  if (!RATES || CODE === "USD") return "";
  if (CODE === "ARS" && RATES.ars?.official) {
    const a = RATES.ars;
    return `Dólar tarjeta: official ${fmtMoney(a.official)} + ${a.tax_pct}% ${a.rule} = ${fmtMoney(RATES.per_usd.ARS)} per US$1 (${a.date})`;
  }
  return `European Central Bank rate of ${RATES.date}`;
}

const NAMES = (() => { try { return new Intl.DisplayNames(["en"], { type: "currency" }); } catch { return null; } })();
export const currencyLabel = code => `${code}${code === "ARS" ? " (dólar tarjeta)" : ""} · ${NAMES?.of(code) || code}`;
export const currencyShort = code => (code === "ARS" ? "ARS tarjeta" : code);
