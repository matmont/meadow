# Day/night cycle

## 001 — Illuminazione guidata dall'elevazione reale del sole all'ora locale dell'utente

- **Data:** 2026-10-25
- **Stato:** accettata. Il punto "Posizione senza permessi" è sostituito il 2026-10-25 dalla [002](#002--coordinate-dalla-città-di-riferimento-del-fuso-iana).

### Contesto
Si vuole un ciclo giorno/notte in cui luce, intensità e colori cambiano in modo realistico, seguendo l'orario reale di chi gioca. Il disco del sole e il suo movimento non interessano.

### Decisione
- Un'entità `DayNightCycle` (dalla 002 in `src/entities/DayNightCycle/DayNightCycle.ts`) riceve la `DirectionalLight` del `Sun`, il `Color` dello sfondo e la `Fog` della scena. Scrive i loro colori e intensità in ogni frame. Possiede la `HemisphereLight` di riempimento, che prima stava in `main.ts`.
- **Elevazione solare reale:** la formula a bassa precisione dell'Astronomical Almanac (circa 1°) parte da `Date.now()`, che è in UTC, quindi l'ora legale non va gestita. Non alloca nulla per frame.
- **Posizione senza permessi:** la longitudine è il centro del fuso orario standard dell'utente (15° per ogni ora di offset, ricavato da `getTimezoneOffset` di gennaio e luglio). La latitudine è fissa a 45° e si può passare come opzione.
- **Curva di illuminazione:** una tabella di stop per elevazione (notte astronomica -18°, fine del crepuscolo civile -6°, orizzonte 0°, ora dorata 6°, 20°, 45°) con interpolazione lineare. Sopra i 20° i valori sono quelli diurni di prima. Sotto l'orizzonte la luce direzionale fa da luna, azzurra e debole, così la scena resta leggibile e la torcia diventa utile.
- **Direzione fissa:** il `Sun` non ruota, quindi le ombre restano stabili e il texel snapping non cambia.
- Lo sfondo e il colore della nebbia restano sempre uguali, come richiesto da [world.md](world.md).
- Il colore della nebbia non è quello del cielo: la camera guarda in basso e il cielo non si vede mai, quindi in alto c'è solo terreno lontano coperto del tutto dalla nebbia. Al crepuscolo e di notte la nebbia ha una luminosità vicina a quella della scena. Con i colori del cielo al tramonto, chiari e saturi, compariva una fascia rosa sopra il terreno scuro (corretto il 2026-10-25).
- Con `?debug` si possono disattivare l'ora reale, scegliere l'ora, far scorrere il tempo (ore al secondo) e cambiare la latitudine. Lo slider dell'intensità del `Sun` è stato tolto, perché verrebbe sovrascritto.

### Alternative scartate
- **Fasce orarie fisse (per esempio alba alle 6, tramonto alle 20):** semplici, ma ignorano le stagioni e la posizione.
- **`navigator.geolocation`:** darebbe la latitudine reale, ma chiede un permesso all'avvio solo per l'illuminazione. Si può aggiungere in futuro come opzione.
- **Lookup fuso IANA → coordinate:** richiede una tabella da includere nel bundle per un guadagno minimo.
- **Shader `Sky` di three.js con tone mapping:** è fisicamente corretto, ma cambia l'aspetto di tutti i colori e non si fonde con la nebbia a colore unico.
- **Sole che si muove:** non richiesto, e ombre lunghe o rotanti peggiorerebbero la leggibilità e il frustum d'ombra.

### Conseguenze
- Nell'emisfero sud la latitudine predefinita sbaglia le stagioni, mentre la durata del giorno resta plausibile. Il mezzogiorno solare può scostarsi fino a circa mezz'ora dal centro del fuso (per esempio Milano: circa 23 minuti).
- I colori della curva sono valori artistici da rifinire nel debug GUI, senza tone mapping.
- Chi crea luci o materiali che dipendono dal colore del cielo dovrebbe leggerli dall'entità invece che da `COLORS.sky`.

## 002 — Coordinate dalla città di riferimento del fuso IANA

- **Data:** 2026-10-25
- **Stato:** accettata. Sostituisce il punto "Posizione senza permessi" della [001](#001--illuminazione-guidata-dallelevazione-reale-del-sole-allora-locale-dellutente).

### Contesto
Con la latitudine fissa a 45° l'emisfero sud ha le stagioni invertite. La longitudine ricavata dall'offset UTC sposta il mezzogiorno solare fino a circa mezz'ora (Milano: 23 minuti).

### Decisione
- `Intl.DateTimeFormat().resolvedOptions().timeZone` dà il nome IANA del fuso (per esempio `Europe/Rome`). La tabella `src/entities/DayNightCycle/timeZones.ts` gli associa latitudine e longitudine della città di riferimento, prese da `zone.tab` di tzdb (pubblico dominio).
- La tabella contiene anche i nomi legacy che Chrome/ICU restituisce ancora (`Asia/Calcutta`, `Europe/Kiev`, `America/Buenos_Aires`…). Così copre tutti i valori di `Intl.supportedValuesOf("timeZone")`.
- I fusi senza posizione (`UTC`, `Etc/*`) ricadono sul metodo della 001: 45° nord e longitudine dall'offset.
- Le opzioni `latitude` e `longitude` sovrascrivono ciascuna il proprio valore.
- Il file è generato e va rigenerato solo se si vuole aggiornare tzdb (raramente: i fusi nuovi sono pochi).

### Alternative scartate
- **`navigator.geolocation`:** è precisa, ma mostra una richiesta di permesso all'avvio. Resta possibile come impostazione opzionale in futuro.
- **Geolocalizzazione da IP con un servizio esterno:** manda dati dell'utente a terzi e aggiunge una dipendenza di rete per l'illuminazione.
- **Scaricare la tabella a runtime:** circa 6 kB gzip in più nel bundle costano meno di una richiesta in più e di uno stato di caricamento.

### Conseguenze
- L'errore residuo dipende da quanto l'utente è lontano dalla città di riferimento del fuso. Di solito sono pochi gradi; è grande nei fusi molto estesi (per esempio `Asia/Shanghai` copre tutta la Cina, e a ovest il sole sorge ore dopo).
- Un fuso nuovo, non presente nella tabella, usa il fallback finché non si rigenera il file.
