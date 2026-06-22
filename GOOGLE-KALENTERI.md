# Google Kalenteri -integraatio

Integraatio synkronoi sovelluksessa lisätyt, muokatut ja poistetut kyydit yhteen yrityksen Google-kalenteriin. Google-tunnuksia ei tallenneta verkkosovellukseen tai GitHubiin.

## Tarvittavat Google-asetukset

1. Luo Google Kalenterissa uusi yksityinen kalenteri, esimerkiksi **Kangaslammin Auto – Kyydit**.
2. Luo Google Cloudissa projekti ja ota **Google Calendar API** käyttöön.
3. Luo projektiin palvelutili (Service Account) ja sille JSON-avain.
4. Jaa luotu Google-kalenteri palvelutilin sähköpostiosoitteelle oikeudella **Tee muutoksia tapahtumiin**.
5. Kopioi Google Kalenterin asetuksista kalenterin tunniste (Calendar ID).

Älä lisää ladattua JSON-avainta tähän projektikansioon tai GitHubiin.

## Supabasen asetukset

1. Suorita `supabase.sql` uudelleen SQL Editorissa. Komennot säilyttävät nykyiset tiedot.
2. Lisää Edge Function -salaisuudet:
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: palvelutilin koko JSON-avaimen sisältö
   - `GOOGLE_CALENDAR_ID`: Google-kalenterin tunniste
   - `GOOGLE_TIME_ZONE`: `Europe/Helsinki`
   - `GOOGLE_EVENT_DURATION_MINUTES`: `60`
   - `KYYDIT_SUPABASE_SECRET_KEY`: Supabasen palvelinpuolen `service_role`-avain
3. Julkaise funktio kansiosta `supabase/functions/google-calendar-sync`.
4. Testaa funktio yhdellä testikyydillä.
5. Vaihda vasta onnistuneen testin jälkeen `config.js`-tiedostossa `googleCalendarEnabled: true` ja julkaise verkkosovellus. Tapahtumat tunnistetaan kyydin omalla tunnisteella, joten erillisiä Google-sarakkeita ei tarvita `rides`-tauluun.

## Tietosuoja

Kalenteritapahtumaan siirtyvät asiakkaan nimi, puhelinnumero, noutopaikka, määränpää ja lisätiedot. Pidä Google-kalenteri yksityisenä ja jaa se vain niille työntekijöille, jotka tarvitsevat tiedot.
