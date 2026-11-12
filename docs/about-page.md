# About page, contact and business details

Owner request, 2026-11-13: an About page before launch, with the owner's text (in Hinglish); a Home section
on why to connect with Healthmarg; and a footer with the about text, a WhatsApp button and a call link for
Yogesh Upadhyay, and the GST and FSSAI details.

## What is built

| Where | What |
|---|---|
| `/about` | Our mission, our sources, what we do, why connect with us, who we are, contact. English, with Hindi at `/about?lang=hi`, like Ritucharya. Prerendered |
| Home | A "Why people choose Healthmarg" section: four reasons, a link to the About page and the WhatsApp button |
| Header | An "About" link |
| Footer | A short about text, a Contact column (WhatsApp button, call link, number shown), and the registration line: trade name, proprietor, place, GSTIN, FSSAI status |
| `src/config/business.ts` | Every business detail in one place: names, GSTIN, FSSAI, phone, place |

WhatsApp: `https://wa.me/918982579178?text=…` (country code, no `+`, the greeting URL-encoded); it opens WhatsApp
with the greeting typed, and nothing is sent until the visitor presses send. Call: `tel:+918982579178`.

## Fact check of the owner's text

| Owner's text | What the sources say | Written as |
|---|---|---|
| Brihatrayi: Charak, Sushrut, Ashtang Hridayam | Correct. Some authors name Ashtanga Sangraha as the third; Ashtanga Hridaya is the common list | As written |
| Laghutrayi: Madhav Nidan, Sharangdhar Samhita, *Bhavprakash Nighantu* | The third text is the **Bhavaprakasha**; its Nighantu (the lexicon of herbs) is part of it. Madhava Nidana: diagnosis; Sharangadhara: preparing medicines; Bhavaprakasha: herbs | "Bhavaprakasha, whose Nighantu describes the herbs" |
| "Patanjali Yog Sutra and Gherand Samhita ka shuddh **ashtanga** yoga" | Patanjali teaches eight limbs (ashtanga). The Gheranda Samhita, a hatha yoga text, teaches a **seven-limbed** path (saptanga) that begins with cleansing the body | Each text with its own teaching |
| Dincharya and Ritucharya from Charak and Sushrut | Correct: Charaka Samhita, Sutrasthana 6 is the seasonal regimen; Ashtanga Hridaya, Sutrasthana 3 too | As written |
| "100% shuddh, natural" products | FSSAI treats "100%", "pure" and "natural" as claims that must be proven; in 2025–26 it ordered companies (Dabur among them) to stop "100%" claims | "Made by traditional methods, with every ingredient listed" |
| "Nuksan ko reverse", "rog-mukt", "modern bimariyon ko alvida" | Cure claims are illegal for Ayurveda under the Drugs and Magic Remedies Act, 1954; AYUSH and the Supreme Court (Patanjali, 2024) have acted on them, and websites are where most are found | "Habits that support good health"; the medical note stays on every page |
| "Chemical-free" | Not a defined term (everything is chemistry), and not a synonym for "organic", which is regulated | "Fewer synthetic additives" |
| FSSAI receipt, reference 30261108128062156 | It is the application receipt. The 14-digit registration number comes with the certificate after approval | "FSSAI registration applied for (ref. …)" until the number arrives; then change one line in `business.ts` |

Sources:
[Laghutrayi](https://dharmawiki.org/index.php/Laghutrayee_(%E0%A4%B2%E0%A4%98%E0%A5%81%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A4%AF%E0%A5%80)),
[Brihatrayi](https://en.wikipedia.org/wiki/Brhat_Trayi),
[Gheranda Samhita](https://en.wikipedia.org/wiki/Gheranda_Samhita),
[Charaka Samhita, Sutrasthana 6](https://www.carakasamhitaonline.com/index.php/Tasyashiteeya_Adhyaya),
[FSSAI on claims](https://fssai-digest.fssai.gov.in/research-and-innovations/claims.php),
[FSSAI and "100%" claims](https://ssrana.in/articles/fssai-vs-misleading-claims-the-legal-story-behind-the-100-labelling-crackdown/),
[Drugs and Magic Remedies Act](https://en.wikipedia.org/wiki/Drugs_and_Magic_Remedies_(Objectionable_Advertisements)_Act,_1954),
[AYUSH on miraculous claims](https://medicaldialogues.in/ayush/ayurveda/news/ayush-ministry-prohibits-miraculous-claims-in-advertisements-for-ayurveda-siddha-drugs-136243),
[FSSAI certificate and number](https://cleartax.in/s/download-fssai-certificate).

## Decisions

| Decision | Reason |
|---|---|
| The brand stays "Healthmarg" on the site; the registration line uses the registered trade name "HealthMarg" | The logo and every page say Healthmarg; the legal line must match the GST record |
| Only the town is shown (Ambah, Morena, Madhya Pradesh), not the street address | The owner asked for the GST and registration details; the full address is on the registrations. Selling online later needs the full address and a grievance officer (Consumer Protection (E-Commerce) Rules, 2020) |
| The WhatsApp button uses the site's own button style and a plain chat icon | Readable in all four themes; WhatsApp's green fails contrast with white text |
| Products are "being prepared" | The site has no shop yet; the FSSAI registration is as a retailer. To be updated when products are listed |

## Priority order

1. `business.ts` and the contact links (WhatsApp, call), with unit tests.
2. Footer and header.
3. About page, English and Hindi, prerendered, with its search details and sitemap entries.
4. Home section.
5. Tests at every stage; docs.
