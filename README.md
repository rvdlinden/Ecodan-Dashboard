# Ecodan Dashboard voor Home Assistant

Een zijbalk-panel voor Home Assistant met het installatieschema van een Mitsubishi Electric
Ecodan-warmtepomp (split-systeem SUZ-SWM60 VA met cilinderunit EHST20D-VM2D en vloerverwarming).
De waarden in het schema zijn live: ze komen van de **Asgard** (een ESP32-S3 met
[esphome-ecodan-hp](https://github.com/gekkekoe/esphome-ecodan-hp) op de CN105-aansluiting van de
FTC6, via de ESPHome-integratie) en uit de kWh-meters in de meterkast die je al in HA hebt.

- **Installatieschema:** buitenunit in de tuin, cilinderunit in de technische ruimte, de verdelers en
  thermostaten per verdieping, de tappunten en de kWh-meters in de meterkast. De cilinderunit is
  getekend volgens *Figure 8.2* (Water system diagram) uit de servicehandleiding van de EHST20D-VM2D,
  met de onderdeelnummers uit *Table 4.1*:
  - platenwisselaar koudemiddel-water (3) met gescheiden circuits, TH2 (28) en drukvoeler (29);
  - aanvoer via booster heater (4) en THW1 (24) naar de 3-wegklep (5); retour via debietmeter (11),
    THW2 (25), filter (12), pomp 1 (13) en afsluiter (14);
  - expansievat (10), manometer (7), ontluchter (9) en overdrukventiel (8);
  - tapwatervat (15) zonder spiraal: het wordt opgewarmd via platenwisselaar water-water (16),
    kalkvanger (17) en sanitaire pomp (18); de terugvoer loopt in het vat tot net onder THW5B;
  - tankvoelers THW5A (26, boven) en THW5B (27, onder), overdrukventiel tapwater (21) en
    terugslagklep (33).
- **Hoofdscherm:** een nagebouwd *Main screen* van de bediening (servicehandleiding 9-1) met de live
  waarden: tapwater en verwarming in bedrijf of stand-by, warmtepomp, booster heater,
  legionellapreventie, vakantiemodus, Eco, de kamertemperatuur van het bedieningspaneel, de
  vattemperatuur en het aanvoerdoel van de FTC6.
- **Live stromen:** lopende bolletjes laten zien waar nu iets stroomt.
  - Koudemiddel (paars) zodra de compressor draait; sneller bij een hoger toerental. De
    ventilator in de buitenunit draait mee en bij de compressor staat de frequentie. In de
    compressor loopt een sinusgolf: meer golven en sneller bij een hogere frequentie, een vlakke
    lijn als hij stilstaat. Meet de kWh-meter van de buitenunit meer dan 150 W terwijl de
    frequentie (nog) 0 is, dan draaien ventilator en koudemiddel toch mee en staat er *draait*.
    Ontdooit de buitenunit (*Defrost*), dan staat dat onder de ventilator.
  - Verwarmingswater zodra pomp 1 draait. De 3-wegklep bepaalt de route: naar de verdelers
    en vloerlussen (verwarming) óf door platenwisselaar 16 naast het vat (tapwater); dan draait
    ook de sanitaire pomp 18 die het tapwater door de wisselaar pompt. De tak die niet in
    gebruik is wordt gedimd en de actieve klepuitgang kleurt rood.
  - Stroom (geel) van de meterkast naar de buiten- en binnenunit zodra een groep meer dan 30 W
    (stand-by) gebruikt; sneller bij meer vermogen.
  - Tapwater: koud leidingwater het vat in en warm water naar de keuken (begane grond) en de
    wasbak en douche (1e verdieping), alleen als er echt warm water getapt wordt (zie *Tapwater en
    de watermeter*). Dan lichten alle drie de tappunten op; welke kraan open staat is niet te meten.
    Tijdens het tappen draait er geen pomp: de waterleidingdruk duwt het warme water naar de kraan.
  - De booster heater gloeit als hij aan staat; de kleur in het tapwatervat volgt de
    tanktemperatuur.
  - Warmtevraag: staat ingang IN1 van de FTC6 aan (*In1 Thermostat*), dan kleurt het signaal
    naar de FTC6 rood. Het display-icoon en de regelunit van een kamer die warmte vraagt kleuren ook rood.
  - Vloerverwarming: er lopen alleen bolletjes door lussen waarvan de kraan open staat (zie
    *Kamers*). Een open aandrijving krijgt een rode rand, een dichte lus
    wordt vaag weergegeven en een verdieping met alle kranen dicht valt helemaal stil.
- **Inzoomen en volledig scherm:** knijp met twee vingers, dubbeltik of gebruik de knoppen + en −
  om in te zoomen, en sleep om te schuiven. De knop ⛶ zet het schema schermvullend en begint dan
  zo groot dat het de hoogte (staand) of breedte (liggend) vult. Op een pc zoom je met Ctrl +
  scrollwiel of knijpen op het touchpad.
- **Kamertemperaturen:** per kamer de temperatuur van de slimme meter naast de (domme)
  thermostaat, in het schema, in de lijst *Kamertemperaturen* en in *Wat gebeurt er nu?*
- **Waarden bij elk onderdeel:** buitentemperatuur (TH7), compressorfrequentie, persgas, zuiggas,
  ventilatortoerental, compressorstarts en pompstand onder de buitenunit, condensatietemperatuur,
  geleverde warmte en TH2 bij platenwisselaar 3, IN1-warmtevraag bij de FTC6,
  aanvoer (THW1), retour (THW2) met ΔT, debiet (L/min), de tankvoelers
  THW5A (boven) en THW5B (onder) met doel en DHW-modus, wifi-signaal van de Asgard, vermogen en
  verbruik van vandaag per kWh-meter, en de kamertemperaturen.
- **Kerncijfers bovenaan:** buiten met de regeling en het aanvoerdoel van de FTC6, compressor,
  aanvoer/retour, tapwater, vermogen nu, **warmte nu** (Estimated Output Power) met de COP van dit
  moment met gemeten stroom, warmte vandaag en de COP voor vloer en tapwater uit
  `sensor.technische_ruimte_ecodan_heating_cop` en `sensor.technische_ruimte_ecodan_dhw_cop` (een COP
  van 0 betekent: te weinig gedraaid en staat als –).
  Daaronder, als de periodes kloppen, de **totale COP van vandaag met gemeten stroom**: warmte volgens de FTC6 ÷ wat de
  kWh-meters vandaag gemeten hebben. Je hebt daar geen Riemann- of utility-meter-helpers voor nodig.
  De FTC6 werkt de dagtotalen met vertraging bij. Is geen van die dagtotalen sinds middernacht
  veranderd, dan horen ze bij een eerdere dag. Het panel toont ze dan als *vorige dag* met de
  datum en rekent geen gemeten COP uit, omdat de periodes niet overeenkomen.
- **Servicewaarden van de buitenunit** in de entiteitenlijst: persgas, oververhitting, onderkoeling,
  zuiggas, verdamping, ventilatortoerental, compressorstarts en draaiuren. Op sommige buitenunits
  blijven die leeg.
- **Uitleg per onderdeel en entiteit:** klik op een onderdeel in het schema of op een
  entiteit in de lijst. De detailkaart legt uit wat het onderdeel doet en wat de huidige waarde
  betekent, met een knop naar de geschiedenis van de entiteit.
- **Wat gebeurt er nu?** Een samenvatting in gewone taal: rust, verwarming of tapwater, de stand
  van het vat ten opzichte van het doel, COP per functie en gemeten tegen geschat verbruik.
- **Meldingen in het panel:** als de regeling (*Selected operating mode*) niet op *Heat
  Compensation Curve* (stooklijn) staat, als de booster heater aangaat tijdens ruimteverwarming (de
  legionella-run wordt apart als info getoond), als de dompelaar aan meldt, bij een storingscode
  (*Fault code*) of een koudemiddelfout, en als de Asgard onbereikbaar is of al lang geen nieuwe
  waarden stuurt.
- **Alleen lezen:** het panel bedient niets. De regeling en het tapwater wijzig je dus niet
  per ongeluk vanaf het dashboard.
- **Licht en donker thema.** Beide thema's hebben dezelfde matte opbouw, lettertypes en maten. Het
  schema heeft diepte: zwevende panelen met schaduw, onderdelen met reliëf, leidingen als buizen, het
  tapwatervat als cilinder en de voelers als bolletjes; het
  accent is donkergrijs (licht) of lichtgrijs (donker). Het thema volgt licht/donker van Home Assistant.
  De zon/maan-knop wisselt per apparaat, tot Home Assistant zelf van licht naar donker gaat of andersom;
  daarna volgt het panel Home Assistant weer. Werkt in de browser en in de HA Companion-app en gebruikt je ingelogde sessie, dus
  zonder tokens of losse servers.

## Vereisten

- Home Assistant **2024.6** of nieuwer.
- [HACS](https://hacs.xyz/docs/use/) is geïnstalleerd (alleen nodig voor installatie via HACS).
- Een **Asgard** (of een andere ESP met [esphome-ecodan-hp](https://github.com/gekkekoe/esphome-ecodan-hp))
  op de FTC6, toegevoegd via de **ESPHome**-integratie met de Engelse labels. Het panel leest de
  entiteiten van dat apparaat; met de apparaatnaam *Technische ruimte Ecodan* heten ze
  `sensor.technische_ruimte_ecodan_…`.
- Optioneel: kWh-meters voor de groepen van de buiten- en binnenunit (bijv. HomeWizard
  kWh-meters). Zonder meters werkt alles behalve de gemeten stroom en de gemeten COP.
- Optioneel: een temperatuursensor of climate-entiteit per kamer. Standaard gebruikt het panel de
  slimme meters naast de thermostaten (zie *Kamers*).

## Installatie via HACS (aanbevolen)

Dit dashboard staat niet in de standaardlijst van HACS. Je voegt het daarom eenmalig toe
als *custom repository*.

[![Openen in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rvdlinden&repository=Ecodan-Dashboard&category=integration)

Met de knop hierboven kun je stap 1 t/m 3 overslaan. Liever met de hand:

1. Open in Home Assistant **HACS** in de zijbalk.
2. Kies rechtsboven **⋮ → Custom repositories**.
3. Vul in:
   - **Repository:** `https://github.com/rvdlinden/Ecodan-Dashboard`
   - **Type:** `Integration`

   en kies **Add**. Sluit daarna het venster.
4. Zoek in HACS op **Ecodan Dashboard**, open het en kies rechtsonder **Download**.
   Bevestig met **Download**.
5. Herstart Home Assistant: **Instellingen → Systeem → ⏻ (rechtsboven) → Home Assistant herstarten**.
6. Ga naar **Instellingen → Apparaten & diensten → + Integratie toevoegen**, zoek op
   **Ecodan Dashboard** en volg de stappen. Je kunt hier de naam, het icoon en het URL-pad
   van het panel kiezen, of de standaardwaarden laten staan.
7. In de zijbalk staat nu **Ecodan**. Ververs de pagina (of herstart de Companion-app) als
   je het nog niet ziet.

De entiteiten worden automatisch gevonden. In de entiteitenlijst onder het schema zie je per
waarde welke entiteit gebruikt wordt, of *niet gevonden*. Het voorvoegsel en een handmatige
koppeling pas je aan via **Instellingen → Apparaten & diensten → Ecodan Dashboard →
Configureren** (zie *Opties*).

### Bijwerken

HACS meldt een nieuwe versie vanzelf onder **Instellingen → Updates** en in HACS zelf. Kies
**Update**, herstart Home Assistant en ververs de pagina in je browser of de Companion-app.

### Verwijderen

1. **Instellingen → Apparaten & diensten → Ecodan Dashboard → ⋮ → Verwijderen.**
2. In HACS: open **Ecodan Dashboard → ⋮ → Verwijderen**.
3. Herstart Home Assistant.

## Handmatige installatie (zonder HACS)

1. Download de nieuwste release van
   [github.com/rvdlinden/Ecodan-Dashboard/releases](https://github.com/rvdlinden/Ecodan-Dashboard/releases)
   (*Source code (zip)*) en pak hem uit.
2. Kopieer de map `custom_components/ecodash` naar `/config/custom_components/ecodash` op je Home
   Assistant (bijv. met de Samba- of File editor-add-on).
3. Herstart Home Assistant en voeg de integratie toe zoals in stap 6 hierboven.

## Opties

Via **Ecodan Dashboard → Configureren** stel je het volgende in:

| Optie | Uitleg |
|---|---|
| Naam, icoon, URL-pad | Hoe en waar het panel in de zijbalk staat (standaard `/ecodan`) |
| Alleen beheerders | Verbergt het panel voor gewone gebruikers |
| Thema | `Licht`, `Donker` of `Volg Home Assistant`. De zon/maan-knop in het panel overschrijft dit per apparaat |
| Entiteit-voorvoegsel | Standaard `technische_ruimte_ecodan`, dus bijv. `sensor.technische_ruimte_ecodan_dhw_current_temp` |
| 3-wegklep: aan = tapwater | Zet uit als het schema verwarming toont terwijl het vat wordt opgewarmd |
| Thermostaat Woonkamer, Slaapkamer 1 t/m 4 | Ingestelde temperatuur op het Möhlenhoff-display in die kamer (standaard 20 °C) |
| Stooklijn | Koude punt, warme punt, optioneel aanpassingspunt en verschuiving, zoals op het Ecodan-display (zie *Stooklijn*) |
| Overrides | Koppel entiteiten handmatig als de detectie iets mist |

### Stooklijn

De FTC6 geeft de punten van de stooklijn (compensatiecurve) niet door, alleen het aanvoerdoel dat
eruit volgt (*Zone 1 Setpoint Value*). Daarom neem je de punten over van het Ecodan-display
(**Verwarming → Compensatiecurve**) in **Configureren**:

| Optie | Standaard | Betekenis |
|---|---|---|
| Buitentemperatuur / aanvoer koude punt | −7 °C / 32 °C | Bij −7 °C buiten en kouder is de aanvoer 32 °C |
| Buitentemperatuur / aanvoer warme punt | 12 °C / 24 °C | Bij 12 °C buiten en warmer is de aanvoer 24 °C |
| Aanpassingspunt | uit | Een derde punt ertussen, als dat op het display is ingesteld |
| Verschuiving | 0 °C | Verschuift de hele lijn omhoog of omlaag (−5 tot +5 °C) |

Tussen de punten loopt de lijn recht, net als op het display. In het schema staat de zone
**STOOKLIJN** naast de meterkast:
- de lijn zelf, met de ingestelde punten;
- een groene stip bij de huidige buitentemperatuur: de aanvoer volgens de ingestelde punten, met
  daarnaast het aanvoerdoel dat de FTC6 zelf meldt (die twee horen gelijk te zijn);
- een rode stip met de werkelijke aanvoer (THW1) zodra de vloerverwarming draait, met het verschil
  ten opzichte van de lijn.
- waarden om de 5 °C op beide assen en kleine streepjes om de 2 °C;
- een draadkruis: wijs met de muis of tik in de grafiek, dan staan de buitentemperatuur (in hele
  graden, zoals op het display) en de aanvoer op de lijn in een vakje op beide assen.

Pas je de stooklijn op het display aan, pas dan ook deze opties aan. Staat de regeling niet op
*Heat Compensation Curve*, dan is de lijn grijs.

### Automatische detectie

Per waarde zoekt het panel eerst `<domein>.<voorvoegsel>_<naam>`, bijvoorbeeld
`sensor.technische_ruimte_ecodan_compressor_frequency`, en anders een entiteit met dezelfde naam
en `ecodan` in de entity-id. De namen zijn die van de Asgard-firmware met Engelse labels.

Ontbreken de binaire sensoren voor pomp 1, de 3-wegklep of de booster heater, dan leidt het panel
de stand af: pomp 1 uit het debiet (*Flow Rate*), de klep uit de bedrijfsmodus (*Operation Mode*:
*Heating Water* of *Legionella Prevention* is tapwater) en de booster heater uit *Heat Source*. In
de entiteitenlijst staat dan *afgeleid*. De kWh-meters worden gevonden als
`sensor.meterkast_kwh_meter_ecodan_buitenunit_vermogen` en `..._binnenunit_vermogen`, of een
sensor met `ecodan`, `buitenunit`/`binnenunit` en `vermogen`/`power` in de naam. Bij elke meter
wordt de totaalteller (`..._energie_import`) gezocht. Het verbruik van vandaag is de teller nu
min de stand om middernacht uit de historie. Zonder teller rekent het panel met de
5-minutenstatistiek van het vermogen.

### Kamers

Standaard staan deze kamers met hun temperatuurmeter in het schema:

| Verdieping | Kamer | Entiteit |
|---|---|---|
| 2e verdieping | Slaapkamer 4 | `sensor.kantoor_kantoor_thermo_hygro_co2_temperatuur` |
| 1e verdieping | Slaapkamer 1 | `sensor.slaapkamer_slaapkamer_thermo_hygro_co2_temperatuur` |
| 1e verdieping | Slaapkamer 2 | `sensor.kinderkamer_kinderkamer_thermo_hygro_co2_temperatuur` |
| 1e verdieping | Slaapkamer 3 | `sensor.hobbykamer_thermo_hygro_temperature` |
| Begane grond | Woonkamer | `sensor.woonkamer_woonkamer_thermo_hygro_co2_temperatuur` |

De thermostaten (Möhlenhoff) zijn niet uit te lezen. Hun ingestelde temperatuur vul je per kamer in
onder **Configureren**. In het schema staat die waarde in het display-icoon en de gemeten temperatuur
ernaast. In de lijst *Kamertemperaturen* en in *Wat gebeurt er nu?* zie je beide.

Of de kraan van een kamer open staat is niet uit te lezen; het panel schat het net als een
thermostaat met hysterese: 0,2 °C onder de ingestelde waarde gaat de kraan open (de kamer vraagt
warmte), 0,2 °C erboven gaat hij weer dicht en daartussen blijft de vorige stand staan. Bij een
climate-entiteit geldt `hvac_action: heating`. Op de begane grond en de 2e verdieping gaan alle
lussen samen open of dicht, op de 1e verdieping per kamer; de badkamer volgt slaapkamer 1 en de
overloop stroomt altijd mee. Zonder meting of ingestelde waarde telt een kraan als open. Met de override `verdiepingen` kan een kamer ook een eigen
`instelling` krijgen, bijv. `{naam: Woonkamer, entity: sensor.x, instelling: 21}`.

Bestaat zo'n sensor niet, dan zoekt het panel een climate-entiteit op kamernaam
(`climate.woonkamer` of een climate-entiteit met de naam *Woonkamer*). Een andere indeling stel je
in met de override `verdiepingen`.

### Verdelers en aandrijvingen

Het schema tekent per verdieping de lussen op de verdeler en waar de aandrijvingen (kranen) zitten:

| Verdieping | Lussen | Aandrijving |
|---|---|---|
| 2e verdieping | 3 | Eén op de hoofdaanvoer: alle lussen in slaapkamer 4 gaan samen open of dicht |
| 1e verdieping | 5 | Eigen aandrijving voor badkamer en slaapkamer 1, 2 en 3; de badkamer volgt de thermostaat van slaapkamer 1. De overloop heeft geen aandrijving |
| Begane grond | 5 | Eén op de hoofdaanvoer: de woonkamerthermostaat zet de hele begane grond open of dicht |

Een lus zonder eigen aandrijving staat in het schema met een rond handwiel op de verdeler. Met de
override `verdiepingen` geef je per verdieping `hoofdactuator: true` (één aandrijving op de aanvoer)
en `lussen`: een aantal of een lijst van namen of `{naam, actuator, via}`. Zonder `hoofdactuator`
heeft elke lus een eigen aandrijving, tenzij `actuator: false`. Zonder `lussen` tekent het panel 5
lussen.

### Overrides

Sleutels voor losse entiteiten (met de Asgard-naam waarop het panel zoekt):

| Sleutel | Asgard-entiteit | Sleutel | Asgard-entiteit |
|---|---|---|---|
| `buiten` | `outside_temp` | `tank` | `dhw_current_temp` (THW5B) |
| `freq` | `compressor_frequency` | `tank2` | `dhw_secondary_temp` (THW5A) |
| `comp` | binary `compressor` | `dhw_sp` | `dhw_setpoint_value` |
| `defrost` | binary `defrost` | `dhw_drop` | `dhw_max_temp_drop` |
| `cond` | `refrigerant_condensing_temp` | `dhw_mode` | select `dhw_mode` |
| `th2` | `refrigerant_liquid_temp` | `leg_temp` | `legionella_prevention_temp` |
| `aanvoer` | `feed_temp` | `opstate` | `operation_mode` |
| `retour` | `return_temp` | `opmode` | select `selected_operating_mode` |
| `delta_t` | `delta_t` | `z1_sp` | `zone_1_setpoint_value` |
| `flow` | `flow_rate` | `z1_room` | `zone_1_room_temp` |
| `pump1` | binary `water_pump_status` | `p_est` / `p_heat` | `estimated_output_power` / `output_power` |
| `pump_speed` | `pump_speed` | `cop_est` | `estimated_cop` |
| `pump_w` | `pump_consumption` | `heat_prod` / `heat_cons` / `heat_cop` | `heating_delivered` / `heating_consumed` / `heating_cop` |
| `pump_fb` | `pump_feedback_status` | `dhw_prod` / `dhw_cons` / `dhw_cop` | `dhw_delivered` / `dhw_consumed` / `dhw_cop` |
| `klep` | binary `3_way_valve` | `day_prod` / `day_cons` | `estimated_total_daily_energy_produced` / `reported_total_daily_energy_consumption` |
| `bh1` | binary `booster_heater` | `fault` / `ref_err` | `fault_code` / `refrigerant_error_code` |
| `heatsrc` | `heat_source` | `wifi` / `uptime` | `wifi_signal_db` / `esp_uptime` |
| `imm` | binary `immersion_heater` | `esp_temp` / `esp_version` | `esp_internal_temperature` / `esp_version` |
| `pump2` | binary `water_pump_2_status` | `mixing` | `mixing_tank_temp` |
| `z1_feed` / `z1_return` | `z1_feed_temp` / `z1_return_temp` | `mix_step` | `mixing_valve_step_z1` |

De servicewaarden van de buitenunit: `discharge`, `superheat`, `subcool`, `ou_liquid`, `ou_2phase`,
`ou_suction`, `ou_heatsink`, `ou_surface`, `fan`, `starts` en `runtime`. De kWh-meters: `p_out`,
`p_in`, `e_out` en `e_in`. Daarnaast:

| Sleutel | Uitleg |
|---|---|
| `verdiepingen` | Indeling van de woning (max. 3 verdiepingen, max. 4 kamers per verdieping), van boven naar beneden. Een kamer is een naam of `{naam, entity}` met een temperatuursensor of climate-entiteit; met `entity: false` zoekt het panel niets. Per verdieping beschrijft `lussen` de verdeler (zie *Verdelers en aandrijvingen*) |
| `warmtevraag` | Een binary_sensor voor het warmtevraagcontact naar de FTC6. Standaard *In1 Thermostat* van de Asgard. Zonder die entiteit geldt: warmtevraag = een climate-entiteit met `hvac_action: heating`, of anders: de warmtepomp draait op ruimteverwarming |
| `tapwater_debiet` | Sensor voor de actuele waterdoorstroming. Standaard `sensor.meterkast_watermeter_water_gebruik` (zie *Tapwater en de watermeter*) |

Een voorbeeld:

```yaml
pump1: binary_sensor.technische_ruimte_ecodan_water_pump_status
verdiepingen:
  - naam: 2e verdieping
    hoofdactuator: true
    lussen: 3
    kamers: [Slaapkamer 4]
  - naam: 1e verdieping
    lussen:
      - {naam: Overloop, actuator: false}
      - {naam: Badkamer, via: Slaapkamer 1}
      - Slaapkamer 1
      - Slaapkamer 2
      - Slaapkamer 3
    kamers:
      - Slaapkamer 1
      - {naam: Slaapkamer 2, entity: sensor.kinderkamer_kinderkamer_thermo_hygro_co2_temperatuur}
      - Slaapkamer 3
  - naam: Begane grond
    hoofdactuator: true
    lussen: 5
    kamers: [Woonkamer]
tapwater_debiet: sensor.watermeter_actueel_waterverbruik
```

### Tapwater en de watermeter

De Ecodan neemt zelf geen water uit de waterleiding: het verwarmingscircuit is gesloten. Het vat
krijgt alleen koud leidingwater binnen als er ergens warm water getapt wordt. De watermeter
(`sensor.meterkast_watermeter_water_gebruik`) meet al het water in huis, dus ook toilet en koude
kranen. Daarom toont het schema de stroming door het vat alleen als er water stroomt **én** het
vat onderin (THW5B) in de laatste 15 minuten minstens 0,5 °C is afgekoeld. Stroomt er water zonder dat het vat
afkoelt, dan staat bij de koudwaterleiding *niet via het vat*.

Beperkingen:
- De stroming verschijnt pas als het afkoelen gemeld is; korte tapbeurten (handen wassen) zie je
  niet.
- Tot 15 minuten na een douchebeurt wordt ook een toiletspoeling als *via het vat* getoond.
- Het groene punt op de warmwaterleiding (*1-wire*) is een optie: een DS18B20-voeler op de
  1-wire-aansluiting van de Asgard warmt binnen seconden op zodra er getapt wordt. Die voeler zit er
  nu niet; het panel gebruikt hem nog niet.

## Hoe het werkt

De integratie serveert de frontend vanaf `/ecodash_static/` en registreert een custom panel.
De URL van het panel bevat een hash van het JS-bestand, zodat browsers na een update vanzelf
de nieuwe versie laden. Het panel leest de live waarden uit `hass.states` en tekent alleen opnieuw
als een van de gebruikte entiteiten verandert. De stand van de energietellers om middernacht komt
via de websocket-API uit `history/history_during_period`, met terugval op
`recorder/statistics_during_period`.

De Asgard leest de waarden rechtstreeks uit de FTC6 en geeft ze binnen enkele seconden door, net als
de kWh-meters. Alleen de dagtotalen van energie en COP werkt de FTC6 met vertraging bij.

## Ontwikkeling

```
custom_components/ecodash/
  __init__.py, config_flow.py, const.py   registratie van het panel en de opties
  frontend/ecodash-panel.js               het panel: entiteiten zoeken, SVG-schema en weergave
```

Het panel is één JavaScript-module zonder build-stap: pas `ecodash-panel.js` aan en herlaad
de integratie. Verhoog bij een release `version` in `manifest.json` en `ECODASH_VERSION` in
`ecodash-panel.js`, en maak een GitHub-release met tag `X.Y.Z`, zodat HACS de update meldt.
