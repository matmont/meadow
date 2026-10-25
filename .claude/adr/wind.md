# Wind

## 001 — Scie di vento come overlay in screen space, calcolate interamente nello shader

- **Data:** 2026-10-25
- **Stato:** accettata

### Contesto
Si vogliono folate di vento stilizzate: scie sottili che attraversano lo schermo. Non devono essere oggetti del mondo, ma un "filtro" sopra l'immagine, e devono costare il meno possibile.

### Decisione
- Un'entità `WindStreaks` (`src/entities/WindStreaks/`, con `vertex.glsl` e `fragment.glsl`) riceve la camera ed è aggiunta in `main.ts` dopo `FollowCamera`.
- **Geometria:** un `InstancedBufferGeometry` con una striscia da 32 segmenti, ripetuta per 32 scie (una draw call). Ogni istanza ha solo un seed.
- **Screen space senza piano davanti alla camera:** il vertex shader scrive direttamente le coordinate clip (`gl_Position = vec4(x, y, 0, 1)`). La mesh ha `frustumCulled = false`, `depthTest` e `depthWrite` disattivati e un `renderOrder` alto, così viene disegnata sopra tutto. Non serve agganciarla alla camera né riposizionarla al resize.
- **Tutto sulla GPU:** ogni scia ripete un ciclo con periodo e fase propri. A ogni ciclo un hash del seed sceglie un nuovo punto di partenza, l'ampiezza e la fase dell'onda. La testa corre lungo un percorso sinusoidale senza mai fermarsi e la coda la segue. All'inizio la coda resta ferma nel punto di partenza, così la scia nasce da un punto. Verso la fine la scia si accorcia: la coda raggiunge la testa che continua ad avanzare, e la punta mantiene la sua forma mentre la scia sfuma. Con una testa che si ferma a fine percorso e la coda che la raggiunge, la scia perdeva la punta e sembrava bloccarsi. Le raffiche sono una curva lenta che decide, una volta per ciclo, quante scie sono visibili. La CPU aggiorna solo tempo, aspect ratio e offset.
- **Distanza apparente:** un solo parametro, `depth` (8 m di default, regolabile in `?debug`), dice quanto le scie sembrano vicine alla camera. Le dimensioni nei uniform valgono a 14 m (`REFERENCE_DEPTH`). Lo shader moltiplica spessore, lunghezza, percorso e ampiezza dell'onda per `14 / depth` e divide la frequenza per lo stesso fattore, così la forma resta la stessa e cambia solo la scala. Scie più vicine sono quindi più grandi, più veloci sullo schermo e scorrono di più quando la camera si muove, come farebbe un oggetto vicino.
- **Ancorate al mondo:** a ogni frame lo spostamento della camera, proiettato sui suoi assi destro e alto, sposta le scie al contrario, con la scala che il mondo ha sullo schermo alla distanza `depth`. Senza questo, camminando le scie sembrerebbero sporco sulla lente. Le posizioni di partenza si avvolgono (`mod`) in un'area più grande dello schermo, così una scia non viene mai tagliata mentre si avvolge.
- Con `?debug` si regolano opacità, durata, percorso, lunghezza, spessore, ondulazione e densità minima.

### Alternative scartate
- **Un piano trasparente a tutto schermo con le scie disegnate nel fragment shader:** il fragment shader girerebbe su ogni pixel dello schermo in ogni frame, anche dove non c'è niente. Le strisce costano solo i pixel che coprono.
- **Scie come oggetti 3D nel mondo (ribbon o trail):** prospettiva e occlusione corrette, ma richiedono la gestione di posizioni e vita sulla CPU, e non servono per un effetto stilizzato.
- **`ParticleEffect`:** le particelle hanno una sorgente e un ciclo di vita stop/idle; il vento è un overlay permanente.
- **Post-processing (`EffectComposer`):** un render target e un pass in più per un effetto che si disegna direttamente nella scena.

### Conseguenze
- Le scie non hanno profondità: passano sopra il personaggio e gli oggetti vicini. Per uno stile "filtro" è voluto.
- Il colore è fisso (`COLORS.wind`) e non segue il ciclo giorno/notte. Se di notte risultano troppo evidenti, l'opacità può leggere la luminosità da `DayNightCycle`.
- La direzione del vento è in coordinate di schermo. Se la camera dovesse ruotare attorno al player, andrebbe proiettata da una direzione nel mondo.
- Il movimento della camera in avanti (lungo la direzione di vista) non sposta le scie: con una camera che segue a offset fisso non succede.
