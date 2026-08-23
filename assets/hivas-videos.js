/* Pre-call oldal (/hivas) videó-konfig. EZ AZ EGYETLEN FÁJL, amit a videók
   elkészültekor szerkeszteni kell. Amíg egy tétel null, az oldal azt a blokkot
   szöveges formában mutatja (nincs üres lejátszó, nincs placeholder).

   Forrás-formátumok (bármelyik):
     { mp4: '/assets/video/hivas-koszonto.mp4', poster: '/assets/video/hivas-koszonto.jpg', minutes: 1 }
       - saját hosztolás (Pages vagy R2), natív lejátszó, teljes nézettség-mérés (25/50/75/100).
       - AJÁNLOTT: nincs külső márka, nincs ajánlott-videó sáv, pontos mérés.
     { youtube: 'VIDEO_ID', minutes: 7 }
       - nem listázott YouTube-videó, IFrame API, nézettség-mérés működik.
     { stream: 'CLOUDFLARE_STREAM_UID', minutes: 7 }
       - Cloudflare Stream iframe; csak az indítás mérhető.

   `active`: az aktiválás-ellenőrző (tools/precall/check.mjs) ezt nézi. Amíg false,
   a foglalási modal és a Pre-Call levelek NEM linkelik az oldalt. */
window.HIVAS_VIDEOS = {
  active: false,
  thankyou: null,   /* Gábor köszönő videója, 60-90 mp */
  vsl: null,        /* a mechanizmus-videó, 6-8 perc */
  breakouts: {
    hivasok: null,  /* Hívások kezelése, 2-3 perc */
    emailek: null,  /* E-mailek kezelése, 2-3 perc */
    admin: null,    /* Adminisztráció, számlák, dokumentumok, 2-3 perc */
    idopont: null   /* Időpont-egyeztetés, 2-3 perc */
  }
};
