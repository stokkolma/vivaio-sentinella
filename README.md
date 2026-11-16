# VivAIo — sentinella

Ogni 5 minuti chiede a `https://app.stokkolma.it/api/ops/ping` se l'app e il database rispondono.
Se no (tre tentativi in un minuto), manda un'email; quando tornano, ne manda un'altra. Lo stato
sta in `stato.json`. È pubblico perché i repository pubblici hanno minuti di GitHub Actions gratis:
non contiene segreti né dati (le chiavi stanno nei segreti del repository).

Sorgente: `stokkolma/stokkolma`, cartella `ops/vivaio-sentinella`. Spiegazione in `docs/runbook.md`.
