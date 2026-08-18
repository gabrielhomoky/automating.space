// build-products.mjs — generates a full product detail page per product into
// termek/<slug>/index.html, patches the catalog (store.html) to link to them,
// and rebuilds the Cloudflare Pages deploy dir (store-deploy/).
// Run: node build-products.mjs
import { mkdirSync, writeFileSync, readFileSync, cpSync } from 'fs';

/* ── Shared UI strings (nav / footer / section labels) ── */
const SHARED = {
  hu: {
    'nav.store': 'A bolt', 'nav.contact': 'Kapcsolat', 'crumb.store': 'Store',
    'badge.dl': 'Azonnali letöltés', 'buy': 'Megveszem', 'back': '← Vissza a boltba',
    'sec.about': 'Leírás', 'sec.includes': 'Mit tartalmaz', 'sec.forwhom': 'Kinek való',
    'sec.faq': 'Gyakori kérdések', 'related.h': 'Nézd meg ezeket is',
    'footer.copy': 'Automating &copy; Minden jog fenntartva', 'footer.main': 'Automating.hu',
    'footer.privacy': 'Adatvédelmi irányelvek', 'footer.terms': 'ÁSZF', 'footer.loc': 'Magyarország',
  },
  en: {
    'nav.store': 'The store', 'nav.contact': 'Contact', 'crumb.store': 'Store',
    'badge.dl': 'Instant download', 'buy': 'Buy', 'back': '← Back to the store',
    'sec.about': 'Overview', 'sec.includes': 'What\'s included', 'sec.forwhom': 'Who it\'s for',
    'sec.faq': 'FAQ', 'related.h': 'You might also like',
    'footer.copy': 'Automating &copy; All Rights Reserved', 'footer.main': 'Automating.hu',
    'footer.privacy': 'Privacy Policy', 'footer.terms': 'Terms', 'footer.loc': 'Hungary',
  }
};

/* ── Products ── */
// Stripe Payment Links — paste the live link per slug after creating it in the
// Stripe Dashboard (set metadata slug=<slug>, and redirect-after-payment to
// https://store.automating.hu/koszonjuk?session_id={CHECKOUT_SESSION_ID}).
// Empty → the buy button falls back to the mailto order link.
const STRIPE_LINKS = {
  'ai-hangasszisztens-prompt-csomag': '',
  'email-triage-workflow-n8n': '',
  'cold-email-szekvencia-pack': '',
  'crm-szinkron-sablon-make': '',
  'ai-ugyfelszolgalati-chatbot-kit': '',
  'ai-automatizalas-kisvallalkozasoknak-ebook': '',
  'szamlazas-automatizalas-workflow-n8n': '',
  'lead-minosito-ai-prompt-csomag': '',
  'ai-automatizalas-jatekkonyve': '',
};

const PRODUCTS = [
  {
    slug: 'ai-hangasszisztens-prompt-csomag', cat: 'prompts', priceHUF: '9900',
    hu: {
      tag: 'Prompt-csomag', title: 'AI Hangasszisztens Prompt-csomag',
      tagline: 'Kész system promptok telefonos AI-asszisztenshez — recepció, étterem, ügyfélszolgálat.',
      price: '9 900 Ft',
      intro: 'Egy telefonos AI-asszisztens felépítése a nulláról órákat vesz igénybe, és a jó system prompt megírása külön szakma. Ez a csomag élesben tesztelt promptokat ad, amelyeket csak a saját céged adataival kell kitöltened — utána azonnal indulhat.',
      forwhom: 'Olyan vállalkozásoknak, amelyek Vapi, Retell vagy hasonló platformon építenek hangasszisztenst, és nem akarnak heteket tölteni a prompt-finomhangolással. Technikai előképzettség nem szükséges.',
      includes: [
        '6 kész system prompt: recepció, rendelésfelvétel, időpontfoglalás, ügyfélszolgálat, kimenő hívás és lead-minősítés',
        'Magyar és angol nyelvű változat mindegyikhez',
        'Vapi- és Retell-kompatibilis formátum, beillesztésre kész',
        'Változó-helykitöltők (cégnév, nyitvatartás, árak) egyértelmű jelöléssel',
        'Hangbeállítási tippek: tempó, megszakítás-kezelés és hibakezelő mondatok',
      ],
      faq: [
        { q: 'Milyen platformon működik?', a: 'Bármely voice-AI platformon, ami system promptot fogad. Vapin és Retellen teszteltük, de az OpenAI Realtime API-val is működik.' },
        { q: 'Kell hozzá programozni?', a: 'Nem. A promptokat bemásolod a platform felületére, kitöltöd a cégadatokat, és kész.' },
        { q: 'Magyarul is jól beszél?', a: 'Igen. Minden prompt magyar és angol változatban érkezik, a magyar nyelv sajátosságaira hangolva.' },
      ],
    },
    en: {
      tag: 'Prompt pack', title: 'AI Voice Assistant Prompt Pack',
      tagline: 'Ready system prompts for a phone AI assistant — reception, restaurant, customer support.',
      price: '€26',
      intro: 'Building a phone AI assistant from scratch takes hours, and writing a good system prompt is a craft of its own. This pack gives you battle-tested prompts you only need to fill with your own company details — then you are live.',
      forwhom: 'For businesses building a voice assistant on Vapi, Retell, or similar, who do not want to spend weeks tuning prompts. No technical background required.',
      includes: [
        '6 ready system prompts: reception, order taking, appointment booking, customer support, outbound calls, and lead qualification',
        'Hungarian and English version of each',
        'Vapi- and Retell-compatible format, ready to paste',
        'Variable placeholders (company name, hours, prices) clearly marked',
        'Voice tuning tips: pacing, interruption handling, and graceful error lines',
      ],
      faq: [
        { q: 'Which platform does it work on?', a: 'Any voice-AI platform that accepts a system prompt. We tested it on Vapi and Retell, and it also works with the OpenAI Realtime API.' },
        { q: 'Do I need to code?', a: 'No. You paste the prompts into the platform UI, fill in your company details, and you are done.' },
        { q: 'Does it speak Hungarian well?', a: 'Yes. Every prompt ships in Hungarian and English, tuned for the quirks of the Hungarian language.' },
      ],
    },
  },
  {
    slug: 'email-triage-workflow-n8n', cat: 'templates', priceHUF: '14900',
    hu: {
      tag: 'Automatizálási sablon', title: 'E-mail Triage Workflow (n8n)',
      tagline: 'Importálható n8n-folyamat, ami olvassa, kategorizálja és priorizálja a beérkező e-maileket.',
      price: '14 900 Ft',
      intro: 'A postafiók a legnagyobb időrabló a legtöbb cégnél. Ez az n8n-folyamat AI-jal olvassa be a beérkező leveleket, kategóriába sorolja, megjelöli a sürgőseket, és válasz-piszkozatot készít — te csak jóváhagysz.',
      forwhom: 'Kis- és középvállalkozásoknak, amelyek napi tucatnyi e-mailt kezelnek, és van vagy lesz egy n8n példányuk. Aki nem akar n8n-t üzemeltetni, annak telepítési segítséget is kérhet tőlünk.',
      includes: [
        'Kész n8n workflow JSON, egyetlen importtal betölthető',
        'AI-kategorizálás: árkérés, panasz, számla, időpont, spam és egyéb',
        'Sürgősségi pontozás és automatikus címkézés',
        'Válasz-piszkozat generálás a céged stílusában, küldés előtti jóváhagyással',
        'Lépésről lépésre telepítési útmutató (Gmail és IMAP) képernyőképekkel',
      ],
      faq: [
        { q: 'Kell saját n8n?', a: 'Igen, egy n8n példány (felhő vagy önállóan futtatott). Ha nincs, az útmutató végigvezet a beállításon, vagy mi is beállítjuk.' },
        { q: 'Melyik AI-modellt használja?', a: 'Alapból OpenAI-t, de a workflow-ban egy csomóponton átállítható Claude-ra vagy más szolgáltatóra.' },
        { q: 'Magától küldi a válaszokat?', a: 'Alapból nem — piszkozatot készít, és te hagyod jóvá. A teljes automatizálás egy kapcsolóval bekapcsolható.' },
      ],
    },
    en: {
      tag: 'Automation template', title: 'Email Triage Workflow (n8n)',
      tagline: 'Importable n8n flow that reads, categorises, and prioritises incoming email.',
      price: '€39',
      intro: 'The inbox is the biggest time sink at most companies. This n8n flow uses AI to read incoming mail, sort it into categories, flag the urgent ones, and draft replies — you just approve.',
      forwhom: 'For small and mid-sized businesses handling dozens of emails a day who have (or will have) an n8n instance. If you do not want to run n8n yourself, you can ask us for setup help.',
      includes: [
        'Ready n8n workflow JSON, loadable with a single import',
        'AI categorisation: quote request, complaint, invoice, appointment, spam, and other',
        'Urgency scoring and automatic labelling',
        'Reply-draft generation in your company voice, with approval before sending',
        'Step-by-step setup guide (Gmail and IMAP) with screenshots',
      ],
      faq: [
        { q: 'Do I need my own n8n?', a: 'Yes, an n8n instance (cloud or self-hosted). If you do not have one, the guide walks you through setup, or we can set it up for you.' },
        { q: 'Which AI model does it use?', a: 'OpenAI by default, but you can switch a single node to Claude or another provider.' },
        { q: 'Does it send replies on its own?', a: 'Not by default — it drafts and you approve. Full automation can be turned on with one switch.' },
      ],
    },
  },
  {
    slug: 'cold-email-szekvencia-pack', cat: 'prompts', priceHUF: '7900',
    hu: {
      tag: 'Prompt-csomag', title: 'Cold Email Szekvencia Pack',
      tagline: '12 bevált hidegemail-szekvencia prompt, follow-upokkal és tárgysor-variációkkal.',
      price: '7 900 Ft',
      intro: 'A hideg megkeresés akkor működik, ha releváns és emberi. Ez a csomag 12 teljes szekvenciát ad: te megadod a cégadatokat, az AI pedig megírja a személyre szabott leveleket és a follow-upokat.',
      forwhom: 'Értékesítőknek, alapítóknak és ügynökségeknek, akik kimenő megkeresésből szereznek ügyfelet, és gyorsan akarnak jó alapszöveget — nyelvtanilag és stílusilag is igényeset.',
      includes: [
        '12 teljes e-mail-szekvencia prompt különböző iparágakra és ajánlatokra',
        '3-5 lépéses follow-up sorozat mindegyikhez',
        'Tárgysor-variációk A/B-teszthez',
        'Hangnem-kapcsolók: hivatalos, közvetlen vagy rövid és lényegre törő',
        'Bemásolható sablon a leggyakoribb kifogások kezelésére',
      ],
      faq: [
        { q: 'Melyik AI-eszközben használjam?', a: 'Bármelyikben — ChatGPT, Claude vagy a CRM-edbe épített AI. A promptok egyszerű szöveges formátumban érkeznek.' },
        { q: 'Magyar és angol megkereséshez is jó?', a: 'Igen, mindkét nyelvhez tartalmaz mintát és útmutatást a lokalizáláshoz.' },
        { q: 'Megfelel a levélszemét-szabályoknak?', a: 'A promptok a jó gyakorlatra ösztönöznek (releváns, leiratkozható, nem félrevezető), de a jogi megfelelést mindig neked kell biztosítanod.' },
      ],
    },
    en: {
      tag: 'Prompt pack', title: 'Cold Email Sequence Pack',
      tagline: '12 proven cold-email sequence prompts with follow-ups and subject-line variants.',
      price: '€21',
      intro: 'Cold outreach works when it is relevant and human. This pack gives you 12 complete sequences: you provide the company details, and the AI writes the personalised emails and follow-ups.',
      forwhom: 'For salespeople, founders, and agencies who win clients through outbound and want strong base copy fast — clean in grammar and tone.',
      includes: [
        '12 complete email sequence prompts for different industries and offers',
        '3-5 step follow-up series for each',
        'Subject-line variants for A/B testing',
        'Tone switches: formal, direct, or short and to the point',
        'A paste-ready template for handling the most common objections',
      ],
      faq: [
        { q: 'Which AI tool should I use it in?', a: 'Any of them — ChatGPT, Claude, or the AI built into your CRM. The prompts come as plain text.' },
        { q: 'Good for both Hungarian and English outreach?', a: 'Yes, it includes samples and localisation guidance for both languages.' },
        { q: 'Is it spam-compliant?', a: 'The prompts encourage good practice (relevant, opt-out friendly, not misleading), but legal compliance is always your responsibility.' },
      ],
    },
  },
  {
    slug: 'crm-szinkron-sablon-make', cat: 'templates', priceHUF: '12900',
    hu: {
      tag: 'Automatizálási sablon', title: 'CRM Szinkron Sablon (Make.com)',
      tagline: 'Make.com forgatókönyv, ami szinkronban tartja a leadeket az űrlapok, a CRM és a táblázatok között.',
      price: '12 900 Ft',
      intro: 'Ha egy lead három helyen él, akkor sehol sem él rendesen. Ez a Make.com forgatókönyv automatikusan szinkronizálja a kapcsolatokat a beérkezési pontok és a CRM-ed között — duplikátum-szűréssel és adatdúsítással.',
      forwhom: 'Marketing- és értékesítési csapatoknak, akik űrlapokból, hirdetésekből és landing oldalakról gyűjtenek leadeket, és belefáradtak a kézi adatmásolásba.',
      includes: [
        'Kész Make.com blueprint, importálható egy fájlból',
        'Kétirányú szinkron: űrlap és táblázat felől a CRM-be',
        'Duplikátum-felismerés e-mail és telefonszám alapján',
        'Adatdúsítás: hiányzó mezők kitöltése és formátum-normalizálás',
        'Hibakezelés és értesítés Slackre vagy e-mailben, ha valami elakad',
      ],
      faq: [
        { q: 'Melyik CRM-mel működik?', a: 'A leggyakoribbakkal (HubSpot, Pipedrive, Airtable, Google Sheets). A blueprint moduljai más CRM-re is átállíthatók.' },
        { q: 'Kell fizetős Make-csomag?', a: 'Az ingyenes csomaggal is elindul, de nagyobb forgalomnál érdemes fizetős szintre lépni a műveletszám miatt.' },
        { q: 'Mennyire bonyolult beállítani?', a: 'Az importálás pár perc; a fiókok összekötése (CRM, táblázat) a leghosszabb lépés, ehhez útmutatót adunk.' },
      ],
    },
    en: {
      tag: 'Automation template', title: 'CRM Sync Template (Make.com)',
      tagline: 'Make.com scenario that keeps leads in sync across forms, your CRM, and sheets.',
      price: '€34',
      intro: 'If a lead lives in three places, it really lives nowhere. This Make.com scenario syncs contacts automatically between your intake points and your CRM — with dedup and data enrichment.',
      forwhom: 'For marketing and sales teams collecting leads from forms, ads, and landing pages who are tired of copying data by hand.',
      includes: [
        'Ready Make.com blueprint, importable from a single file',
        'Two-way sync: from form and sheet into the CRM',
        'Duplicate detection by email and phone number',
        'Data enrichment: filling missing fields and normalising formats',
        'Error handling and notifications to Slack or email when something gets stuck',
      ],
      faq: [
        { q: 'Which CRM does it work with?', a: 'The common ones (HubSpot, Pipedrive, Airtable, Google Sheets). The blueprint modules can be repointed to other CRMs.' },
        { q: 'Do I need a paid Make plan?', a: 'It runs on the free plan, but at higher volume a paid tier is worth it for the operation count.' },
        { q: 'How hard is it to set up?', a: 'The import takes minutes; connecting your accounts (CRM, sheet) is the longest step, and we provide a guide for it.' },
      ],
    },
  },
  {
    slug: 'ai-ugyfelszolgalati-chatbot-kit', cat: 'templates', priceHUF: '19900',
    hu: {
      tag: 'Automatizálási sablon', title: 'AI Ügyfélszolgálati Chatbot Kit',
      tagline: 'Teljes chatbot-csomag a weboldaladra: system prompt, beágyazható widget és átadás élő ügyintézőnek.',
      price: '19 900 Ft',
      intro: 'A legtöbb chatbot vagy buta, vagy bonyolult beépíteni. Ez a kit egy kész, beágyazható widgetet ad, AI-háttérrel, ami a GYIK-ből tanul, és ha nem tud valamit, átad egy embernek.',
      forwhom: 'Webshopoknak és szolgáltatóknak, akik 24/7 elérhetőséget akarnak a weboldalukon anélkül, hogy folyamatos ügyeletet tartanának.',
      includes: [
        'Beágyazható chat-widget (egyetlen script-sor a weboldaladon)',
        'Finomhangolt system prompt magyar ügyfélszolgálati hangnemre',
        'GYIK-betanító sablon: a saját kérdéseiddel feltöltöd, és a bot abból válaszol',
        'Átadás élő ügyintézőnek e-mailben vagy chatben, ha a bot elakad',
        'Stílus-testreszabás (szín, logó, üdvözlő üzenet) és telepítési útmutató',
      ],
      faq: [
        { q: 'Kell hozzá szerver?', a: 'A widget statikus oldalra is felrakható; az AI-válaszokhoz egy egyszerű végpont kell, amihez adunk mintát és útmutatót.' },
        { q: 'Honnan tudja a válaszokat?', a: 'A te GYIK-edből és dokumentumaidból, amelyeket a betanító sablonba töltesz. Nem talál ki dolgokat a semmiből.' },
        { q: 'Több nyelven is tud?', a: 'Igen, alapból magyar és angol, és a prompt bővíthető további nyelvekkel.' },
      ],
    },
    en: {
      tag: 'Automation template', title: 'AI Customer Support Chatbot Kit',
      tagline: 'A complete chatbot kit for your site: system prompt, embeddable widget, and handoff to a live agent.',
      price: '€52',
      intro: 'Most chatbots are either dumb or painful to embed. This kit gives you a ready embeddable widget with an AI backend that learns from your FAQ and hands off to a human when it cannot help.',
      forwhom: 'For online stores and service providers who want 24/7 availability on their site without staffing a constant support shift.',
      includes: [
        'Embeddable chat widget (a single script line on your site)',
        'Tuned system prompt for a natural support tone',
        'FAQ training template: load your own questions and the bot answers from them',
        'Handoff to a live agent by email or chat when the bot gets stuck',
        'Style customisation (colour, logo, welcome message) and a setup guide',
      ],
      faq: [
        { q: 'Do I need a server?', a: 'The widget works on a static site; the AI replies need a simple endpoint, for which we provide a sample and guide.' },
        { q: 'Where does it get answers?', a: 'From your FAQ and documents loaded into the training template. It does not invent things out of nowhere.' },
        { q: 'Does it speak multiple languages?', a: 'Yes, Hungarian and English by default, and the prompt can be extended with more languages.' },
      ],
    },
  },
  {
    slug: 'ai-automatizalas-kisvallalkozasoknak-ebook', cat: 'guides', priceHUF: '4900',
    hu: {
      tag: 'Útmutató', title: 'AI Automatizálás Kisvállalkozásoknak (E-book)',
      tagline: '68 oldalas e-book: mit érdemes automatizálni, mibe kerül, és hogyan kezdj bele.',
      price: '4 900 Ft',
      intro: 'Nem kell fejlesztőnek lenned ahhoz, hogy az AI időt spóroljon a cégednek. Ez az e-book közérthetően végigveszi, mely folyamatokat éri meg automatizálni, mennyibe kerül, és milyen sorrendben kezdj neki.',
      forwhom: 'Kisvállalkozóknak és önállóknak, akik hallottak az AI-ról, de nem tudják, hol kezdjék — és nem akarnak feleslegesen pénzt költeni rossz eszközökre.',
      includes: [
        '68 oldal, gyakorlati nyelven, marketing-szöveg nélkül',
        '10 konkrét folyamat, amit ma már megbízhatóan elvégez az AI',
        'Megtérülési képlet: hogyan számold ki, neked megéri-e',
        'Eszköz-összehasonlítás és tipikus buktatók',
        'Ellenőrzőlisták és egy 30 napos bevezetési terv',
      ],
      faq: [
        { q: 'Milyen formátumban kapom?', a: 'PDF-ben, azonnal letölthető a fizetés után. Asztali gépen és mobilon is jól olvasható.' },
        { q: 'Kell hozzá technikai tudás?', a: 'Nem. Az e-book üzleti szemszögből ír, nem kódról szól.' },
        { q: 'Mennyire naprakész?', a: 'A 2026-os eszközöket és gyakorlatot tükrözi, és az elveket úgy írtuk meg, hogy ne avuljanak el gyorsan.' },
      ],
    },
    en: {
      tag: 'Guide', title: 'AI Automation for Small Business (E-book)',
      tagline: 'A 68-page e-book: what to automate, what it costs, and how to start.',
      price: '€13',
      intro: 'You do not need to be a developer for AI to save your business time. This e-book covers, in plain language, which processes are worth automating, what they cost, and the order to tackle them in.',
      forwhom: 'For small-business owners and solo operators who have heard about AI but do not know where to start — and do not want to waste money on the wrong tools.',
      includes: [
        '68 pages in practical language, no marketing fluff',
        '10 concrete processes AI can reliably handle today',
        'An ROI formula: how to work out whether it pays off for you',
        'A tool comparison and the typical pitfalls',
        'Checklists and a 30-day rollout plan',
      ],
      faq: [
        { q: 'What format do I get?', a: 'PDF, downloadable instantly after payment. Reads well on desktop and mobile.' },
        { q: 'Do I need technical knowledge?', a: 'No. The e-book is written from a business angle, not about code.' },
        { q: 'How up to date is it?', a: 'It reflects 2026 tools and practice, and the principles are written to age slowly.' },
      ],
    },
  },
  {
    slug: 'szamlazas-automatizalas-workflow-n8n', cat: 'templates', priceHUF: '11900',
    hu: {
      tag: 'Automatizálási sablon', title: 'Számlázás Automatizálás Workflow (n8n)',
      tagline: 'Automatikus számlakészítés és -küldés, ami kiváltja a manuális adatbevitelt.',
      price: '11 900 Ft',
      intro: 'A számlázás unalmas, ismétlődő és hibaérzékeny — vagyis tökéletes automatizálni. Ez az n8n-folyamat kiállítja és kiküldi a számlákat, egyezteti a tételeket, és riportot küld, hogy mindig képben legyél.',
      forwhom: 'Szolgáltatóknak és webshopoknak, akik havonta sok számlát állítanak ki, és szeretnék kivenni az emberi kezet a folyamatból.',
      includes: [
        'Kész n8n workflow JSON, egyetlen importtal',
        'Trigger megrendelésre vagy ütemezve (pl. havi körök)',
        'Tételek egyeztetése és automatikus számlakiállítás',
        'Számla kiküldése e-mailben, PDF-melléklettel',
        'Napi vagy heti riport Slackre vagy e-mailben',
      ],
      faq: [
        { q: 'Melyik számlázóval működik?', a: 'A Számlázz.hu API-jára épül, de a kiállító csomópont más szolgáltatóra (pl. Billingo) is átállítható.' },
        { q: 'Megfelel a NAV-előírásoknak?', a: 'A számlakiállítást a számlázó szolgáltatód végzi, ami gondoskodik a NAV-megfelelésről; a workflow csak vezérli azt.' },
        { q: 'Tudok kézzel is beavatkozni?', a: 'Igen, beépíthető egy jóváhagyási lépés kiküldés előtt, ha nem akarsz teljesen automata folyamatot.' },
      ],
    },
    en: {
      tag: 'Automation template', title: 'Invoicing Automation Workflow (n8n)',
      tagline: 'Automatic invoice creation and sending that replaces manual data entry.',
      price: '€31',
      intro: 'Invoicing is dull, repetitive, and error-prone — which makes it perfect to automate. This n8n flow issues and sends invoices, reconciles line items, and sends a report so you always have a view.',
      forwhom: 'For service providers and online stores issuing many invoices a month who want to take the human hand out of the process.',
      includes: [
        'Ready n8n workflow JSON with a single import',
        'Trigger on order or on a schedule (e.g. monthly runs)',
        'Line-item reconciliation and automatic invoice issuing',
        'Invoice delivery by email with a PDF attachment',
        'Daily or weekly report to Slack or email',
      ],
      faq: [
        { q: 'Which billing service does it work with?', a: 'It is built on the Szamlazz.hu API, but the issuing node can be repointed to another provider (e.g. Billingo).' },
        { q: 'Is it tax-compliant?', a: 'Your billing provider issues the invoice and handles compliance; the workflow only drives it.' },
        { q: 'Can I step in manually?', a: 'Yes, you can add an approval step before sending if you do not want a fully automatic flow.' },
      ],
    },
  },
  {
    slug: 'lead-minosito-ai-prompt-csomag', cat: 'prompts', priceHUF: '8900',
    hu: {
      tag: 'Prompt-csomag', title: 'Lead Minősítő AI Prompt-csomag',
      tagline: 'Promptok, amelyek pontozzák és minősítik az érdeklődőket, majd átadják az értékesítésnek.',
      price: '8 900 Ft',
      intro: 'Nem minden lead ér ugyanannyit, és a kézi minősítés időbe telik. Ez a csomag promptokat ad, amelyek a válaszok alapján pontozzák az érdeklődőket, és CRM-mezőkre kész kimenetet adnak.',
      forwhom: 'Értékesítési csapatoknak és alapítóknak, akik sok érdeklődőt kapnak, és gyorsan szét akarják válogatni a komolyakat a böngészőktől.',
      includes: [
        'Lead-pontozó prompt testreszabható kritériumokkal (büdzsé, időzítés, igény)',
        'Minősítő kérdéssorok űrlaphoz és beszélgetéshez',
        'Strukturált, CRM-be illeszthető kimenet (JSON és sima szöveg)',
        'Automatikus összefoglaló és következő-lépés javaslat minden leadhez',
        'Integrációs tippek n8n-hez és Make-hez',
      ],
      faq: [
        { q: 'Hogyan illesztem a folyamatomba?', a: 'A kimenet strukturált, így könnyen bekötheted n8n-be, Make-be vagy közvetlenül a CRM-edbe. Adunk hozzá mintát.' },
        { q: 'Testreszabhatók a pontozási szempontok?', a: 'Igen, a prompt elején egyszerűen átírod a kritériumokat és a súlyokat.' },
        { q: 'Melyik AI-modell kell hozzá?', a: 'Bármelyik erősebb modell jó (GPT-4 osztály vagy Claude). A promptok modellfüggetlenek.' },
      ],
    },
    en: {
      tag: 'Prompt pack', title: 'Lead Qualification AI Prompt Pack',
      tagline: 'Prompts that score and qualify leads, then hand them to sales.',
      price: '€23',
      intro: 'Not every lead is worth the same, and manual qualification takes time. This pack gives you prompts that score leads from their answers and produce output ready to drop into CRM fields.',
      forwhom: 'For sales teams and founders who get a lot of inbound interest and want to quickly separate the serious ones from the browsers.',
      includes: [
        'A lead-scoring prompt with customisable criteria (budget, timing, need)',
        'Qualifying question sets for forms and conversations',
        'Structured, CRM-ready output (JSON and plain text)',
        'An automatic summary and next-step suggestion for each lead',
        'Integration tips for n8n and Make',
      ],
      faq: [
        { q: 'How do I fit it into my flow?', a: 'The output is structured, so you can wire it into n8n, Make, or your CRM directly. A sample is included.' },
        { q: 'Are the scoring criteria customisable?', a: 'Yes, you simply edit the criteria and weights at the top of the prompt.' },
        { q: 'Which AI model do I need?', a: 'Any stronger model works (GPT-4 class or Claude). The prompts are model-agnostic.' },
      ],
    },
  },
  {
    slug: 'ai-automatizalas-jatekkonyve', cat: 'guides', priceHUF: '6900',
    hu: {
      tag: 'Útmutató', title: 'Az AI Automatizálás Játékkönyve (Playbook)',
      tagline: 'Lépésről lépésre playbook: 30 folyamat, amit AI-ra bízhatsz, prioritási mátrixszal.',
      price: '6 900 Ft',
      intro: 'A tudás nem ér semmit terv nélkül. Ez a playbook 30 konkrét automatizálható folyamatot ad, mindegyikhez nehézséget, megtérülést és kezdő lépést — plusz egy mátrixot, amivel eldöntöd, mivel kezdj.',
      forwhom: 'Olyan vállalkozóknak, akik túl vannak az elméleten, és kézzelfogható tervet akarnak: mit, milyen sorrendben, milyen eszközzel.',
      includes: [
        '30 automatizálható folyamat kártyánként kifejtve',
        'Prioritási mátrix: hatás kontra ráfordítás',
        'Kezdő lépés és ajánlott eszköz mindegyikhez',
        'Sablonok és prompt-minták, amikkel azonnal próbálkozhatsz',
        'Skálázási útmutató: a néhány órás kísérlettől a rendszerig',
      ],
      faq: [
        { q: 'Miben más, mint az e-book?', a: 'Az e-book a miértre és a döntésre fókuszál; a playbook a hogyanra: konkrét folyamatok, sorrend és sablonok a végrehajtáshoz.' },
        { q: 'Milyen formátumban kapom?', a: 'PDF-ben, azonnal letölthető. A sablonok másolható szövegként is benne vannak.' },
        { q: 'Kezdőknek is jó?', a: 'Igen, de a legtöbbet az hozza ki belőle, akinek már van egy-két folyamata, amit szívesen automatizálna.' },
      ],
    },
    en: {
      tag: 'Guide', title: 'The AI Automation Playbook',
      tagline: 'A step-by-step playbook: 30 processes you can hand to AI, with a priority matrix.',
      price: '€18',
      intro: 'Knowledge is worth little without a plan. This playbook gives you 30 concrete automatable processes, each with difficulty, payoff, and a first step — plus a matrix to decide where to start.',
      forwhom: 'For business owners past the theory who want a tangible plan: what to do, in what order, with which tool.',
      includes: [
        '30 automatable processes, each laid out as a card',
        'A priority matrix: impact versus effort',
        'A first step and recommended tool for each',
        'Templates and prompt samples you can try immediately',
        'A scaling guide: from a few-hours experiment to a system',
      ],
      faq: [
        { q: 'How is it different from the e-book?', a: 'The e-book focuses on the why and the decision; the playbook focuses on the how: concrete processes, order, and templates for execution.' },
        { q: 'What format do I get?', a: 'PDF, downloadable instantly. The templates are included as copyable text.' },
        { q: 'Is it good for beginners?', a: 'Yes, but you get the most from it if you already have a process or two you would like to automate.' },
      ],
    },
  },
];

/* ── Template ── */
const ICON = `<svg width="34" height="34" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="#0a0a0a" d="M300,0H100c-27.62,0-52.62,11.19-70.71,29.29C11.19,47.38,0,72.38,0,100h158.58L29.29,229.29C11.19,247.38,0,272.38,0,300s11.19,52.62,29.29,70.71c18.15,18.16,43.25,29.36,70.98,29.29h49.73c55.23,0,100-44.77,100-100,0-27.75,0-69.42,0-100l-50.54,50h.54c0,27.61-22.39,50-50,50h0v-.54l-.54.54h-49.46l37.09-37.09,7.88-7.88,15.61-15.61,139.42-139.42v300c55.23,0,100-44.77,100-100V100c0-55.23-44.77-100-100-100Z"/></svg>`;

function buildTr(p) {
  const make = (L) => {
    const o = { ...SHARED[L],
      'p.tag': p[L].tag, 'p.title': p[L].title, 'p.tagline': p[L].tagline,
      'p.price': p[L].price, 'p.intro': p[L].intro, 'p.forwhom': p[L].forwhom };
    p[L].includes.forEach((t, i) => o['inc' + i] = t);
    p[L].faq.forEach((f, i) => { o['faqq' + i] = f.q; o['faqa' + i] = f.a; });
    return o;
  };
  return { hu: make('hu'), en: make('en') };
}

// up to 3 "related" products from the same category (else fill from others)
function related(p) {
  const same = PRODUCTS.filter(x => x.slug !== p.slug && x.cat === p.cat);
  const rest = PRODUCTS.filter(x => x.slug !== p.slug && x.cat !== p.cat);
  return [...same, ...rest].slice(0, 3);
}

function page(p) {
  const tr = buildTr(p);
  const buyHref = STRIPE_LINKS[p.slug] ||
    ('mailto:hello@automating.hu?subject=' + encodeURIComponent('Megrendelés: ' + p.hu.title));
  const incLis = p.hu.includes.map((t, i) =>
    `<li class="inc-item"><span class="inc-check">✓</span><span data-i18n="inc${i}">${t}</span></li>`).join('\n            ');
  const faqItems = p.hu.faq.map((f, i) =>
    `<details class="faq-item"><summary data-i18n="faqq${i}">${f.q}</summary><div class="faq-a" data-i18n="faqa${i}">${f.a}</div></details>`).join('\n          ');
  const relCards = related(p).map(r =>
    `<a class="rel-card" href="/termek/${r.slug}/"><span class="rel-tag">${r.hu.tag}</span><span class="rel-title">${r.hu.title}</span><span class="rel-price">${r.hu.price}</span></a>`).join('\n          ');

  const productLD = {
    "@context": "https://schema.org", "@type": "Product", "name": p.hu.title,
    "description": p.hu.tagline, "category": p.hu.tag, "brand": { "@type": "Brand", "name": "Automating" },
    "url": `https://store.automating.hu/termek/${p.slug}/`,
    "offers": { "@type": "Offer", "price": p.priceHUF, "priceCurrency": "HUF", "availability": "https://schema.org/InStock", "url": `https://store.automating.hu/termek/${p.slug}/` }
  };
  const breadcrumbLD = {
    "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Store", "item": "https://store.automating.hu/" },
      { "@type": "ListItem", "position": 2, "name": p.hu.title, "item": `https://store.automating.hu/termek/${p.slug}/` }
    ]
  };

  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${p.hu.title} — Automating Store</title>
<meta name="description" content="${p.hu.tagline}">
<link rel="canonical" href="https://store.automating.hu/termek/${p.slug}/">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${p.hu.title} — Automating Store">
<meta property="og:description" content="${p.hu.tagline}">
<meta property="og:image" content="https://automating.hu/og-image.png">
<meta property="og:url" content="https://store.automating.hu/termek/${p.slug}/">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Automating">
<meta property="og:locale" content="hu_HU">
<meta property="og:locale:alternate" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(productLD)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
:root { --black:#0a0a0a; --white:#fff; --g200:#e8e8e8; --g400:#a0a0a0; --g600:#666; --card-shadow:0 80px 120px rgba(0,0,0,0.03); }
html { height: 100%; }
body { font-family:'Inter',-apple-system,sans-serif; background:var(--white); color:var(--black); overflow-x:hidden; -webkit-font-smoothing:antialiased; animation:pageFadeIn .35s ease both; }
@keyframes pageFadeIn { from{opacity:0} to{opacity:1} }
a { color:inherit; text-decoration:none; }
.mob-br { display:none; }
#matrix { position:fixed; inset:0; width:100%; height:100%; pointer-events:none; z-index:0; }
.page { position:relative; z-index:1; }
.wrap { max-width:1100px; margin:0 auto; padding:0 60px; }
[data-reveal] { opacity:0; transform:translateY(40px); transition:opacity 1.1s cubic-bezier(0.16,1,0.3,1),transform 1.1s cubic-bezier(0.16,1,0.3,1); }
[data-reveal].is-visible { opacity:1; transform:translateY(0); }
[data-reveal][data-delay="100"] { transition-delay:.1s; }
[data-reveal][data-delay="200"] { transition-delay:.2s; }
/* NAV */
.nav-outer { position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:200; width:calc(100% - 48px); max-width:960px; }
nav { display:flex; align-items:center; justify-content:space-between; padding:15px; gap:12px; background:rgba(255,255,255,0.92); border:1px solid var(--g200); border-radius:100px; backdrop-filter:blur(12px); position:relative; }
.nav-logo { display:flex; align-items:center; flex-shrink:0; margin-left:14px; }
.nav-links { display:flex; align-items:center; gap:30px; list-style:none; flex:1; justify-content:center; }
.nav-links a { font-size:18px; font-weight:500; color:var(--black); transition:opacity .2s; white-space:nowrap; }
.nav-links a:hover { opacity:.5; }
.lang-wrap { position:relative; flex-shrink:0; }
.lang-btn { display:flex; align-items:center; gap:5px; background:none; border:1px solid var(--g200); border-radius:100px; padding:8px 12px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; color:var(--black); transition:opacity .2s; letter-spacing:.06em; }
.lang-btn:hover { opacity:.6; }
.lang-globe { display:block; opacity:.7; }
.lang-chevron { font-size:9px; opacity:.6; transition:transform .2s; }
.lang-btn.open .lang-chevron { transform:rotate(180deg); }
.lang-dd { position:absolute; top:calc(100% + 8px); right:0; background:var(--white); border:1px solid var(--g200); border-radius:14px; padding:5px; min-width:130px; box-shadow:0 8px 32px rgba(0,0,0,0.09); opacity:0; transform:translateY(-6px); pointer-events:none; transition:opacity .18s ease,transform .18s ease; z-index:300; }
.lang-dd.open { opacity:1; transform:translateY(0); pointer-events:auto; }
.lang-dd-btn { display:block; width:100%; text-align:left; background:none; border:none; padding:9px 13px; border-radius:9px; font-family:inherit; font-size:14px; font-weight:500; cursor:pointer; color:var(--black); transition:background .12s; }
.lang-dd-btn:hover { background:#f2f2f2; }
.lang-dd-btn.is-active { font-weight:700; }
.nav-lang-mob { display:none !important; }
.lang-mob-row { display:flex; gap:8px; }
.lang-mob-opt { flex:1; background:none; border:1px solid var(--g200); border-radius:10px; padding:9px 10px; font-family:inherit; font-size:15px; font-weight:500; cursor:pointer; color:var(--g600); text-align:center; }
.lang-mob-opt.is-active { border-color:var(--black); color:var(--black); font-weight:600; }
.btn-pill { display:inline-flex; align-items:center; gap:8px; background:var(--black); color:var(--white); border:none; padding:10px 22px; border-radius:100px; font-family:inherit; font-size:14px; font-weight:500; cursor:pointer; white-space:nowrap; transition:opacity .2s,transform .25s cubic-bezier(0.16,1,0.3,1); text-decoration:none; }
.btn-pill:hover { opacity:.78; transform:scale(1.04); }
.btn-large { padding:15px 32px; font-size:16px; }
.nav-cta { padding:15px 30px; font-size:15px; margin-right:4px; }
.nav-toggle { display:none; flex-direction:column; gap:4px; cursor:pointer; padding:4px; background:none; border:none; margin-right:8px; }
.nav-toggle span { display:block; width:20px; height:1.5px; background:var(--black); }
@keyframes menuOpen { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
/* PDP */
.pdp { padding:150px 0 40px; }
.crumb { font-size:13px; color:var(--g400); margin-bottom:26px; }
.crumb a:hover { color:var(--black); }
.pdp-head { max-width:760px; }
.pdp-tag { display:inline-block; font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--g600); margin-bottom:16px; }
.pdp-title { font-size:clamp(32px,4.4vw,52px); font-weight:600; letter-spacing:-.035em; line-height:1.1; margin-bottom:18px; }
.pdp-tagline { font-size:clamp(17px,2vw,20px); font-weight:500; line-height:1.5; color:var(--g600); margin-bottom:32px; }
.pdp-meta { display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
.pdp-price { font-size:30px; font-weight:600; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.pdp-badge { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:5px 11px; border-radius:6px; background:#dcfce7; color:#15803d; }
/* body grid */
.pdp-grid { display:grid; grid-template-columns:1.4fr 1fr; gap:24px; margin-top:64px; align-items:start; }
.section + .section { margin-top:44px; }
.section h2 { font-size:13px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--g400); margin-bottom:16px; }
.section p { font-size:16px; line-height:1.7; color:var(--g600); }
.inc-card { background:#FAFAFA; border:1px solid var(--g200); border-radius:24px; padding:30px 30px; box-shadow:var(--card-shadow); position:sticky; top:110px; }
.inc-card h2 { margin-bottom:20px; }
.inc-list { list-style:none; display:flex; flex-direction:column; gap:14px; margin-bottom:26px; }
.inc-item { display:flex; gap:11px; font-size:14.5px; line-height:1.55; }
.inc-check { color:#15803d; font-weight:700; flex-shrink:0; }
.inc-buy { width:100%; justify-content:center; }
.inc-note { text-align:center; font-size:12px; color:var(--g400); margin-top:12px; }
/* FAQ */
.faq { margin-top:64px; }
.faq h2 { font-size:13px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--g400); margin-bottom:16px; }
.faq-item { border:1px solid var(--g200); border-radius:16px; padding:4px 22px; margin-bottom:10px; transition:border-color .2s; }
.faq-item[open] { border-color:var(--black); }
.faq-item summary { list-style:none; cursor:pointer; padding:18px 0; font-size:16px; font-weight:600; letter-spacing:-.01em; display:flex; justify-content:space-between; align-items:center; gap:16px; }
.faq-item summary::-webkit-details-marker { display:none; }
.faq-item summary::after { content:'+'; font-size:22px; font-weight:400; color:var(--g400); transition:transform .2s; }
.faq-item[open] summary::after { transform:rotate(45deg); }
.faq-a { font-size:15px; line-height:1.65; color:var(--g600); padding:0 0 20px; }
/* related */
.related { margin-top:80px; }
.related h2 { font-size:clamp(22px,2.4vw,28px); font-weight:600; letter-spacing:-.025em; margin-bottom:24px; }
.rel-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
.rel-card { display:flex; flex-direction:column; gap:8px; background:var(--white); border:1px solid var(--g200); border-radius:20px; padding:24px; box-shadow:var(--card-shadow); transition:border-color .2s,transform .4s cubic-bezier(0.16,1,0.3,1); }
.rel-card:hover { border-color:var(--black); transform:translateY(-3px); }
.rel-tag { font-size:10px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--g600); }
.rel-title { font-size:17px; font-weight:600; letter-spacing:-.02em; line-height:1.3; flex:1; }
.rel-price { font-size:16px; font-weight:600; letter-spacing:-.02em; }
.back-row { margin-top:56px; }
.back-link { font-size:15px; font-weight:600; color:var(--g600); transition:color .2s; }
.back-link:hover { color:var(--black); }
/* footer */
footer { border-top:1px solid var(--g200); padding:24px 0; margin-top:90px; }
.footer-inner { display:flex; align-items:center; justify-content:space-between; gap:20px; font-size:13px; color:var(--g600); flex-wrap:wrap; }
.footer-links { display:flex; gap:28px; flex-wrap:wrap; }
.footer-links a:hover { color:var(--black); }
@media (max-width:900px) {
  .wrap { padding:0 24px; }
  .nav-outer { width:calc(100% - 32px); top:14px; }
  nav { padding:10px 12px; gap:0; }
  .nav-logo { margin-left:4px; }
  .btn-pill.nav-cta { position:absolute; left:50%; transform:translateX(-50%); padding:10px 18px; font-size:13px; margin-right:0; }
  .btn-pill.nav-cta:hover { transform:translateX(-50%) scale(1.04); }
  .lang-wrap { display:none; }
  .nav-links { display:none; }
  .nav-links.open { display:flex; flex-direction:column; position:absolute; top:calc(100% + 10px); left:0; right:0; background:rgba(255,255,255,0.97); border:1px solid var(--g200); border-radius:20px; padding:20px 24px; gap:20px; backdrop-filter:blur(16px); z-index:10; animation:menuOpen .28s cubic-bezier(0.16,1,0.3,1) both; }
  .nav-lang-mob { display:list-item !important; }
  .nav-toggle { display:flex; margin-right:4px; }
  .pdp { padding:130px 0 30px; }
  .pdp-grid { grid-template-columns:1fr; gap:40px; }
  .inc-card { position:static; }
  .rel-grid { grid-template-columns:1fr; }
  .footer-inner { flex-direction:column; text-align:center; }
  .mob-br { display:block; }
}
</style>
</head>
<body>
<canvas id="matrix"></canvas>
<div class="page">

  <div class="nav-outer">
    <nav>
      <a href="/" class="nav-logo" aria-label="Automating Store">${ICON}</a>
      <ul class="nav-links" id="navLinks">
        <li><a href="/" data-i18n="nav.store">A bolt</a></li>
        <li><a href="https://automating.hu/">Automating.hu</a></li>
        <li class="nav-lang-mob"><div class="lang-mob-row">
          <button class="lang-mob-opt" data-lang="en">English</button>
          <button class="lang-mob-opt is-active" data-lang="hu">Magyar</button>
        </div></li>
      </ul>
      <div class="lang-wrap" id="langWrap">
        <button class="lang-btn" id="langBtn" aria-label="Language">
          <svg class="lang-globe" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z"/></svg>
          <span id="langLabel">HU</span><span class="lang-chevron">▾</span>
        </button>
        <div class="lang-dd" id="langDd">
          <button class="lang-dd-btn" data-lang="en">English</button>
          <button class="lang-dd-btn is-active" data-lang="hu">Magyar</button>
        </div>
      </div>
      <button class="nav-toggle" id="navToggle" aria-label="Menu"><span></span><span></span><span></span></button>
      <a href="mailto:hello@automating.hu" class="btn-pill nav-cta" data-i18n="nav.contact">Kapcsolat</a>
    </nav>
  </div>

  <section class="pdp">
    <div class="wrap">
      <nav class="crumb" aria-label="Breadcrumb">
        <a href="/" data-i18n="crumb.store">Store</a> / <span data-i18n="p.tag">${p.hu.tag}</span>
      </nav>
      <div class="pdp-head">
        <span class="pdp-tag" data-i18n="p.tag">${p.hu.tag}</span>
        <h1 class="pdp-title" data-i18n="p.title">${p.hu.title}</h1>
        <p class="pdp-tagline" data-i18n="p.tagline">${p.hu.tagline}</p>
        <div class="pdp-meta">
          <span class="pdp-price" data-i18n="p.price">${p.hu.price}</span>
          <a class="btn-pill btn-large" href="${buyHref}" data-i18n="buy">Megveszem</a>
          <span class="pdp-badge" data-i18n="badge.dl">Azonnali letöltés</span>
        </div>
      </div>

      <div class="pdp-grid">
        <div class="pdp-left">
          <div class="section" data-reveal>
            <h2 data-i18n="sec.about">Leírás</h2>
            <p data-i18n="p.intro">${p.hu.intro}</p>
          </div>
          <div class="section" data-reveal data-delay="100">
            <h2 data-i18n="sec.forwhom">Kinek való</h2>
            <p data-i18n="p.forwhom">${p.hu.forwhom}</p>
          </div>
        </div>
        <aside class="inc-card" data-reveal data-delay="100">
          <h2 data-i18n="sec.includes">Mit tartalmaz</h2>
          <ul class="inc-list">
            ${incLis}
          </ul>
          <a class="btn-pill inc-buy" href="${buyHref}" data-i18n="buy">Megveszem</a>
          <p class="inc-note" data-i18n="badge.dl">Azonnali letöltés</p>
        </aside>
      </div>

      <div class="faq" data-reveal>
        <h2 data-i18n="sec.faq">Gyakori kérdések</h2>
        ${faqItems}
      </div>

      <div class="related" data-reveal>
        <h2 data-i18n="related.h">Nézd meg ezeket is</h2>
        <div class="rel-grid">
          ${relCards}
        </div>
      </div>

      <div class="back-row">
        <a class="back-link" href="/" data-i18n="back">← Vissza a boltba</a>
      </div>
    </div>
  </section>

  <footer>
    <div class="wrap">
      <div class="footer-inner">
        <span data-i18n="footer.copy">Automating &copy; Minden jog fenntartva</span>
        <div class="footer-links">
          <a href="/" data-i18n="crumb.store">Store</a>
          <a href="https://automating.hu/" data-i18n="footer.main">Automating.hu</a>
          <a href="https://automating.hu/privacy.html" data-i18n="footer.privacy">Adatvédelmi irányelvek</a>
          <a href="https://automating.hu/terms.html" data-i18n="footer.terms">ÁSZF</a>
        </div>
        <span data-i18n="footer.loc">Magyarország</span>
      </div>
    </div>
  </footer>

</div>

<script>
'use strict';
const T = ${JSON.stringify(tr)};
const TITLE = { hu: T.hu['p.title'] + ' — Automating Store', en: T.en['p.title'] + ' — Automating Store' };
function detectLang(){ const s=localStorage.getItem('lang'); if(s) return s; const ls=navigator.languages||[navigator.language||'en']; for(const l of ls){ if(l.toLowerCase().startsWith('hu')) return 'hu'; } return 'hu'; }
let currentLang = detectLang();
function setLang(lang){
  currentLang = lang; localStorage.setItem('lang', lang); document.documentElement.lang = lang;
  const lbl=document.getElementById('langLabel'); if(lbl) lbl.textContent = lang==='hu'?'HU':'EN';
  document.title = TITLE[lang];
  const md=document.querySelector('meta[name="description"]'); if(md) md.content = T[lang]['p.tagline'];
  document.getElementById('langBtn').classList.remove('open');
  document.getElementById('langDd').classList.remove('open');
  document.querySelectorAll('.lang-dd-btn').forEach(b=>b.classList.toggle('is-active', b.dataset.lang===lang));
  document.querySelectorAll('.lang-mob-opt').forEach(b=>b.classList.toggle('is-active', b.dataset.lang===lang));
  const tr=T[lang];
  document.querySelectorAll('[data-i18n]').forEach(el=>{ const k=el.dataset.i18n; if(tr[k]!==undefined) el.innerHTML=tr[k]; });
}
document.getElementById('langBtn').addEventListener('click', function(e){ e.stopPropagation(); this.classList.toggle('open'); document.getElementById('langDd').classList.toggle('open'); });
document.addEventListener('click', function(e){ const w=document.getElementById('langWrap'); if(w && !w.contains(e.target)){ document.getElementById('langBtn').classList.remove('open'); document.getElementById('langDd').classList.remove('open'); } });
document.querySelectorAll('.lang-dd-btn').forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.lang)));
document.querySelectorAll('.lang-mob-opt').forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.lang)));
setLang(currentLang);
const nt=document.getElementById('navToggle'), nl=document.getElementById('navLinks');
nt.addEventListener('click',()=>nl.classList.toggle('open'));
nl.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nl.classList.remove('open')));
(function(){ const els=document.querySelectorAll('[data-reveal]'); const ob=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');ob.unobserve(e.target);}});},{threshold:0.08,rootMargin:'0px 0px -40px 0px'}); els.forEach(el=>ob.observe(el)); })();
(function(){
  const cv=document.getElementById('matrix'), cx=cv.getContext('2d'); const FONT=13;
  const CH='アイウエオカキクケコサシスセソタチ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz<>{}[]|/=+-*&#@!';
  const R_BASE=170; let mx=-999,my=-999,tx=-999,ty=-999,cols,rows,grid,pb=null,DPR=0; const S=[];
  function build(){ DPR=Math.min(window.devicePixelRatio||1,3); const w=cv.clientWidth||innerWidth,h=cv.clientHeight||innerHeight; cv.width=Math.round(w*DPR); cv.height=Math.round(h*DPR); cols=Math.ceil(w/FONT); rows=Math.ceil(h/FONT); grid=Array.from({length:cols},()=>Array.from({length:rows},()=>({ch:CH[Math.random()*CH.length|0],t:Math.random()*40|0}))); cx.setTransform(DPR,0,0,DPR,0,0); cx.font=FONT+'px monospace'; cx.textBaseline='top'; pb=null; }
  function frame(){ requestAnimationFrame(frame); if((Math.min(window.devicePixelRatio||1,3))!==DPR) build(); if(pb){cx.clearRect(pb.x,pb.y,pb.w,pb.h);pb=null;} if(tx<-500&&mx<-500) return; mx+=(tx-mx)*0.08; my+=(ty-my)*0.08; const R=R_BASE+Math.sin(Date.now()*0.0008)*10; const c0=Math.max(0,((mx-R)/FONT)|0),c1=Math.min(cols,Math.ceil((mx+R)/FONT)),r0=Math.max(0,((my-R)/FONT)|0),r1=Math.min(rows,Math.ceil((my+R)/FONT)); if(c1<=c0||r1<=r0) return; pb={x:c0*FONT,y:r0*FONT,w:(c1-c0)*FONT,h:(r1-r0)*FONT}; for(let c=c0;c<c1;c++)for(let r=r0;r<r1;r++){ const px=c*FONT,py=r*FONT,dx=(px+FONT*.5-mx)*.92,dy=py+FONT*.5-my,d=Math.sqrt(dx*dx+dy*dy); if(d>=R) continue; const ai=((1-d/R)*28)|0; if(!ai) continue; cx.fillStyle=S[ai]||(S[ai]='rgba(80,80,80,'+(ai/100)+')'); cx.fillText(grid[c][r].ch,px,py); if(--grid[c][r].t<=0){grid[c][r].ch=CH[Math.random()*CH.length|0];grid[c][r].t=12+(Math.random()*35|0);} } }
  addEventListener('mousemove',e=>{tx=e.clientX;ty=e.clientY;}); addEventListener('touchmove',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true}); addEventListener('resize',build); build(); frame();
})();
</script>
</body>
</html>`;
}

/* ── Generate product pages ── */
for (const p of PRODUCTS) {
  mkdirSync(`termek/${p.slug}`, { recursive: true });
  writeFileSync(`termek/${p.slug}/index.html`, page(p));
}
console.log(`Generated ${PRODUCTS.length} product pages under termek/`);

/* ── Patch catalog (store.html): point card CTAs at the detail pages ── */
let store = readFileSync('store.html', 'utf8');
let n = 0;
store = store.replace(/<a class="btn-pill card-buy" href="mailto:[^"]*" data-i18n="card\.buy">Megveszem<\/a>/g, () => {
  const slug = PRODUCTS[n++].slug;
  return `<a class="btn-pill card-buy" href="termek/${slug}/" data-i18n="card.buy">Részletek →</a>`;
});
store = store.replace(/('card\.buy':\s*')Buy(')/, '$1Details →$2');
store = store.replace(/('card\.buy':\s*')Megveszem(')/, '$1Részletek →$2');
writeFileSync('store.html', store);
console.log(`Patched store.html — rewrote ${n} card CTAs to detail pages`);

/* ── Generate the slug→title catalog used by the delivery Functions ── */
const catalog = Object.fromEntries(
  PRODUCTS.map(p => [p.slug, { hu: p.hu.title, en: p.en.title }]));
writeFileSync('functions/_lib/catalog.js',
  '// AUTO-GENERATED by build-products.mjs — do not edit by hand.\n' +
  'export default ' + JSON.stringify(catalog, null, 2) + ';\n');
console.log('Generated functions/_lib/catalog.js');

/* ── Rebuild Cloudflare Pages deploy dir ── */
cpSync('store.html', 'store-deploy/index.html');
cpSync('favicon.svg', 'store-deploy/favicon.svg');
cpSync('termek', 'store-deploy/termek', { recursive: true });
cpSync('koszonjuk.html', 'store-deploy/koszonjuk.html');
cpSync('functions', 'store-deploy/functions', { recursive: true });
console.log('Rebuilt store-deploy/ (index.html, favicon.svg, termek/, koszonjuk.html, functions/)');
