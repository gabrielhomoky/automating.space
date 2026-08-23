/* Pre-call oldal (/hivas) videó-konfig. EZ AZ EGYETLEN FÁJL, amit a videók
   elkészültekor szerkeszteni kell. Amíg egy tétel null, az oldal a helyén a
   végleges méretű "Felvétel folyamatban" keretet mutatja (cím + hossz), és
   a szöveges válasz viszi a tartalmat. Videó beérkezésekor magától lejátszóra vált.

   Forrás-formátumok (bármelyik):
     { mp4: '/assets/video/hivas-koszonto.mp4', poster: '/assets/video/hivas-koszonto.jpg', minutes: 1 }
       - saját hosztolás (Pages vagy R2), natív lejátszó, teljes nézettség-mérés (25/50/75/100).
       - AJÁNLOTT: nincs külső márka, nincs ajánlott-videó sáv, pontos mérés.
     { youtube: 'VIDEO_ID', minutes: 7 }
       - nem listázott YouTube-videó, IFrame API, nézettség-mérés működik.
     { stream: 'CLOUDFLARE_STREAM_UID', minutes: 7 }
       - Cloudflare Stream iframe; csak az indítás mérhető.

   `active`: az aktiválás-ellenőrző (tools/precall/check.mjs) ezt nézi. Amíg false,
   a foglalási modal és a Pre-Call levelek NEM linkelik az oldalt.

   Slot-térkép (v2, 2026-08-23): thankyou + vsl + 5 kifogás-videó + proof.
   Scriptek: vault "Pre-Call Oldal - Videó Scriptek". A proof kötelező slot az
   aktiváláshoz; a régi terület-videók (hivasok/emailek/admin/idopont) kivezetve,
   a területek szövegként élnek az oldalon. */
window.HIVAS_VIDEOS = {
  active: false,
  thankyou: null,   /* Gábor köszönő videója, 60-90 mp */
  vsl: null,        /* a mechanizmus-videó, 6-8 perc */
  breakouts: {
    ingyenes: null, /* "Ha ingyenes a hívás, mennyire alapos?", kb. 2 perc */
    ar: null,       /* "Mennyibe kerül?", kb. 2 perc */
    adat: null,     /* "Mi lesz a céges adatainkkal?", kb. 2 perc */
    belsos: null,   /* "Nem tudnánk ezt belsősen megcsinálni?", kb. 2 perc */
    nem: null       /* "Mi van, ha a végén azt mondom, nem?", kb. 2 perc */
  },
  proof: null       /* egy élő rendszer képernyőfelvétele, kb. 30 mp, ügyfélnév nélkül */
};
