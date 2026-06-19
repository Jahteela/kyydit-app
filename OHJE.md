# Kyydit-sovelluksen käyttöönotto

## 1. Luo Supabase-projekti

Jos loit vasta käyttäjätilin, valitse Supabasessa **New project**. Valitse EU-alueella sijaitseva palvelin ja säilytä projektin tietokantasalasana turvallisesti.

## 2. Luo tietokanta

Valitse Supabasessa **SQL Editor → New query**. Kopioi koko `supabase.sql`-tiedoston sisältö editoriin ja suorita se.

## 3. Lisää julkiset yhteystiedot

Löydät tiedot Supabasesta kohdasta **Project Settings → API**:

- Project URL
- Publishable key tai vanhemmassa näkymässä `anon public` -avain

Lisää ne `config.js`-tiedostoon. Älä käytä `service_role`-avainta.

## 4. Luo ensimmäinen käyttäjä

Avaa sovellus verkkopalvelimen kautta, valitse **Luo uusi käyttäjätunnus** ja vahvista sähköposti. Tee ensimmäisestä käyttäjästä ylläpitäjä suorittamalla SQL Editorissa:

```sql
update public.profiles set role='admin' where email='sinun@sahkopostisi.fi';
```

Muut käyttäjät voivat rekisteröityä samalla tavalla. Heidän oletusroolinsa on `driver`. Vaihda tarvittaessa työnjohdon käyttäjälle rooliksi `dispatcher`.

Luo jatkossa käyttäjät Supabasen **Authentication → Users** -näkymästä. Poista julkinen rekisteröityminen käytöstä Authentication-asetuksissa ennen verkkojulkaisua. Kuljettajat näkevät kalenterin, mutta vain `admin`- ja `dispatcher`-roolit voivat muuttaa tilauksia.

## 5. Julkaiseminen ja Android-asennus

Sovellus voidaan julkaista maksuttomaan staattiseen verkkopalveluun. Androidissa käyttäjä avaa osoitteen Chromella ja valitsee **Lisää aloitusnäyttöön** tai **Asenna sovellus**.

## Huomioitavaa

- Esittelytila toimii, kun `config.js` on tyhjä.
- Supabase-tila aktivoituu automaattisesti, kun julkiset tiedot lisätään.
- Asiakkaiden osoitteet ja puhelinnumerot ovat henkilötietoja. Käyttäjätunnukset on poistettava heti, kun henkilö ei enää tarvitse pääsyä.
- Vie kyydit säännöllisesti CSV-varmuuskopioksi sovelluksen **Vie CSV** -painikkeella.
