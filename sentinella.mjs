// Scheda 25 — la sentinella di VivAIo. Ogni 5 minuti (quando GitHub ci arriva: a volte 10-15) chiede
// a /api/ops/ping se l'app risponde e il database anche. Da fuori, perché un'app ferma non può dire
// di essere ferma. Un avviso quando si rompe, uno quando torna: lo stato sta in stato.json.
// Non contiene segreti: chiave di Resend, destinatari e segreto dell'app stanno nei segreti del repository.
import { readFileSync, writeFileSync } from "node:fs";

const APP = (process.env.APP_URL || "https://app.stokkolma.it").replace(/\/+$/, "");
const stato = JSON.parse(readFileSync("stato.json", "utf8"));
const adesso = new Date();
const ora = (d) => new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome" });

async function prova() {
  // Tre tentativi a 20 secondi: un database che si sveglia o un intoppo di rete non sono un guasto.
  let ultimo = "";
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${APP}/api/ops/ping`, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "vivaio-sentinella" } });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) return { ok: true, testo: `app e database rispondono (${j.ms} ms)` };
      ultimo = r.status === 503 ? "l'app risponde ma il database è irraggiungibile" : `l'app risponde con errore ${r.status}`;
    } catch (e) {
      ultimo = `l'app non risponde (${e.name === "TimeoutError" ? "nessuna risposta in 20 secondi" : e.message})`;
    }
    if (i < 2) await new Promise((r) => setTimeout(r, 20_000));
  }
  return { ok: false, testo: ultimo };
}

async function email(oggetto, righe) {
  const to = (process.env.ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: "VivAIo sentinella <avvisi@stokkolma.it>", to, subject: `VivAIo — ${oggetto}`, text: righe.join("\n") }),
  });
  console.log(r.ok ? `Avviso mandato: ${oggetto}` : `Avviso NON mandato (${r.status}): ${await r.text()}`);
  return r.ok;
}

async function riferisci(ok, testo) {
  // All'app, per il semaforo «App» in Stato sistema. Se l'app è giù non arriva: è normale.
  await fetch(`${APP}/api/ops/report`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPS_REPORT_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ kind: "sentinel", ok, summary: testo }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
}

const esito = await prova();
console.log(`${ora(adesso)}: ${esito.testo}`);
let cambiato = false;
if (!esito.ok && stato.ok) {
  await email("App irraggiungibile", [`Problema: ${esito.testo}.`, "", `Visto dalla sentinella il ${ora(adesso)}, dopo 3 tentativi in un minuto.`, "Riceverai un'altra email quando torna a rispondere.", "", "Cosa fare: docs/runbook.md, «App giù» (Vercel → Deployments, Neon → Monitoring)."]);
  Object.assign(stato, { ok: false, dal: adesso.toISOString(), motivo: esito.testo });
  cambiato = true;
} else if (esito.ok && !stato.ok) {
  const minuti = Math.round((adesso - new Date(stato.dal)) / 60_000);
  await email("Risolto: l'app risponde di nuovo", [`L'app risponde di nuovo (${esito.testo}).`, "", `Era irraggiungibile dal ${ora(stato.dal)} (${stato.motivo}): circa ${minuti} minuti.`]);
  Object.assign(stato, { ok: true, dal: adesso.toISOString(), motivo: "" });
  cambiato = true;
}
// All'app: ai cambi di stato e una volta l'ora (per il semaforo).
if (cambiato || adesso.getUTCMinutes() < 5 || process.env.GITHUB_EVENT_NAME === "workflow_dispatch") await riferisci(esito.ok, esito.testo);
// Una volta alla settimana si scrive comunque: GitHub spegne i cron dei repository pubblici fermi da 60 giorni.
const settimana = !stato.ultimoSegno || adesso - new Date(stato.ultimoSegno) > 7 * 86_400_000;
if (settimana) stato.ultimoSegno = adesso.toISOString();
if (cambiato || settimana) writeFileSync("stato.json", JSON.stringify(stato, null, 2) + "\n");
console.log(`cambiato=${cambiato || settimana}`);
