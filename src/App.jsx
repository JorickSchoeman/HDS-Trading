import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  Settings2,
  RefreshCw,
  Edit3,
  ListPlus,
  Search,
  AlertCircle,
  Loader2,
  Upload,
  X,
  Check,
  Copy,
  Moon,
  Sun,
  Sparkles
} from 'lucide-react';
import logo from './assets/logo.png';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '', { apiVersion: 'v1' });

if (!import.meta.env.VITE_GEMINI_API_KEY) {
  console.warn("VITE_GEMINI_API_KEY is missing in your .env file!");
}

// ── RDW API helpers ────────────────────────────────────────────────────────────
const RDW_BASE = 'https://opendata.rdw.nl/resource';

// Normalize license plate: remove dashes/spaces, upper-case
const normalizePlate = (plate) => plate.replace(/[-\s]/g, '').toUpperCase();

// Translate Dutch fuel descriptions to English
const fuelMap = {
  'Benzine': 'Petrol',
  'Diesel': 'Diesel',
  'Elektriciteit': 'Electric',
  'LPG': 'LPG',
  'Waterstof': 'Hydrogen',
  'CNG': 'CNG (Natural Gas)',
  'Hybride (benzine/elektriciteit)': 'Hybrid (Petrol/Electric)',
  'Hybride (diesel/elektriciteit)': 'Hybrid (Diesel/Electric)',
};

// Translate Dutch body type descriptions to English
const bodyMap = {
  'Sedan': 'Sedan',
  'Hatchback': 'Hatchback',
  'Stationwagen': 'Station Wagon',
  'MPV': 'MPV',
  'SUV/Terreinwagen': 'SUV',
  'Coupé': 'Coupé',
  'Cabriolet': 'Convertible',
  'Bestelauto': 'Van',
  'Pick-up': 'Pick-up',
};

const transmissionMap = {
  'Handgeschakeld': 'Manual',
  'Automatisch': 'Automatic',
};

async function fetchRdwVehicle(plate) {
  const normalized = normalizePlate(plate);

  // 1. Main vehicle data
  const mainRes = await fetch(
    `${RDW_BASE}/m9d7-ebf2.json?kenteken=${normalized}&$limit=1`
  );
  if (!mainRes.ok) throw new Error('RDW API not reachable');
  const mainData = await mainRes.json();
  if (!mainData || mainData.length === 0) throw new Error('Kenteken niet gevonden in de RDW database.');
  const v = mainData[0];

  // 2. Fuel data
  let fuel = 'Unknown';
  try {
    const fuelRes = await fetch(`${RDW_BASE}/8ys7-d773.json?kenteken=${normalized}&$limit=1`);
    const fuelData = await fuelRes.json();
    if (fuelData && fuelData.length > 0) {
      const raw = fuelData[0].brandstof_omschrijving || '';
      fuel = fuelMap[raw] || raw;
    }
  } catch (_) { /* tolerate individual sub-endpoint failures */ }

  // 3. Body type data
  let bodyType = v.inrichting || 'Unknown';
  try {
    const bodyRes = await fetch(`${RDW_BASE}/vezc-m2t6.json?kenteken=${normalized}&$limit=1`);
    const bodyData = await bodyRes.json();
    if (bodyData && bodyData.length > 0) {
      const raw = bodyData[0].carrosserie_omschrijving || '';
      bodyType = bodyMap[raw] || raw || bodyType;
    }
  } catch (_) { /* tolerate */ }

  // 4. Parse year from datum_eerste_toelating (format YYYYMMDD)
  const datumStr = v.datum_eerste_toelating || '';
  const year = datumStr.length >= 4 ? datumStr.substring(0, 4) : 'Unknown';

  // 5. Build standardized color string
  const color = [v.eerste_kleur, v.tweede_kleur]
    .filter(c => c && c !== 'N.v.t.' && c !== 'Niet geregistreerd')
    .join(' / ') || 'Unknown';

  return {
    brand:        v.merk             || 'Unknown',
    model:        v.handelsbenaming  || v.type || 'Unknown',
    year,
    fuel,
    bodyType,
    color,
    transmission: v.inrichting ? (transmissionMap[v.inrichting] || v.inrichting) : 'Unknown',
    // raw RDW extras
    apk:       v.vervaldatum_apk   ? formatApkDate(v.vervaldatum_apk) : null,
    mileageJudgement: v.tellerstandoordeel || null,
    seats:     v.aantal_zitplaatsen || null,
    doors:     v.aantal_deuren      || null,
    mass:      v.massa_rijklaar     || null,
  };
}

function formatApkDate(raw) {
  if (!raw || raw.length < 8) return raw;
  return `${raw.substring(6,8)}-${raw.substring(4,6)}-${raw.substring(0,4)}`;
}

// ── App ────────────────────────────────────────────────────────────────────────
function App() {
  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState('');

  // RDW lookup state
  const [rdwLookupLoading, setRdwLookupLoading] = useState(false);
  const [rdwData, setRdwData] = useState(null);
  const [rdwError, setRdwError] = useState('');

  // Form State
  const [licensePlate, setLicensePlate] = useState('');
  const [images, setImages] = useState([]);
  const [manualFields, setManualFields] = useState({
    mileage: '',
    price: '',
    warranty: '',
    maintenanceHistory: '',
    numberOfKeys: '',
    vehicleCondition: '',
    vatOrMargin: 'margin'
  });
  const [features, setFeatures] = useState([]);
  const [featureInput, setFeatureInput] = useState('');
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  };

  // ── RDW Lookup ──────────────────────────────────────────────────────────────
  const lookupPlate = async () => {
    if (!licensePlate.trim()) return;
    setRdwLookupLoading(true);
    setRdwError('');
    setRdwData(null);
    try {
      const data = await fetchRdwVehicle(licensePlate);
      setRdwData(data);
    } catch (err) {
      setRdwError(err.message || 'Ophalen voertuiggegevens mislukt.');
    } finally {
      setRdwLookupLoading(false);
    }
  };

  const handlePlateKeyDown = (e) => {
    if (e.key === 'Enter') lookupPlate();
  };

  // ── File Upload ─────────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    if (e.target.files?.length) processFiles(Array.from(e.target.files));
  };

  const handleDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add('active'); };
  const handleDragLeave = (e) => { e.preventDefault(); e.currentTarget.classList.remove('active'); };
  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('active');
    if (e.dataTransfer.files?.length) processFiles(Array.from(e.dataTransfer.files));
  };

  const processFiles = (fileList) => {
    const valid = fileList.filter(f => f.type.startsWith('image/'));
    setImages(prev => [...prev, ...valid.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
  };

  const removeImage = (index) => {
    setImages(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].preview);
      next.splice(index, 1);
      return next;
    });
  };

  // ── Features ────────────────────────────────────────────────────────────────
  const handleFeatureKeyDown = (e) => {
    if (e.key === 'Enter' && featureInput.trim()) {
      e.preventDefault();
      if (!features.includes(featureInput.trim())) setFeatures(f => [...f, featureInput.trim()]);
      setFeatureInput('');
    }
  };

  const removeFeature = (feature) => setFeatures(f => f.filter(x => x !== feature));

  const handleManualFieldChange = (e) => {
    const { name, value } = e.target;
    setManualFields(prev => ({ ...prev, [name]: value }));
  };

  // ── Generate ─────────────────────────────────────────────────────────────────
  const generateAd = async () => {
    if (!licensePlate.trim()) { alert('Voer een kenteken in.'); return; }
    setLoading(true);

    const payload = {
      license_plate: normalizePlate(licensePlate),
      uploaded_images: images.length,
      rdw_data: rdwData,
      manual_input_fields: { ...manualFields, features }
    };

    try {
      const response = await callGemini(payload);
      setResult(response);
    } catch (error) {
      console.error('Gemini API fout:', error);
      alert('Advertentie genereren mislukt. Controleer je API-sleutel of probeer het opnieuw.\n\n' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const callGemini = async (payload) => {
    const rd = payload.rdw_data;
    const mf = payload.manual_input_fields;

    const brand = rd?.brand || 'Onbekend';
    const model = rd?.model || 'Onbekend';
    const year  = rd?.year  || 'Onbekend';
    const fuel  = rd?.fuel  || 'Onbekend';
    const body  = rd?.bodyType || 'Onbekend';
    const color = rd?.color || 'Onbekend';
    const trans = rd?.transmission || 'Onbekend';
    const apk   = rd?.apk ? `APK geldig tot ${rd.apk}` : '';
    const seats = rd?.seats ? `${rd.seats} zitplaatsen` : '';
    const doors = rd?.doors ? `${rd.doors} deuren` : '';

    const prompt = `Je bent een professionele advertentie schrijver voor HDS-Trading, gespecialiseerd in auto’s en scooters.

Schrijf een verkoopgerichte maar zakelijke advertentie in de **wij-vorm**. Je krijgt informatie over een auto of scooter.

BELANGRIJK VOOR BEIDE VOERTUIGEN:
* Gebruik korte, duidelijke zinnen, professioneel, feitelijk en eerlijk.
* Brandstof is ALTIJD een van deze: Benzine, Diesel, Hybride, LPG, Waterstof, of Elektrisch. Geen andere termen gebruiken!
* ZOEK ZELF UIT wat de (waarschijnlijke) standaard opties/specificaties van deze specifieke uitvoering zijn op basis van het model en bouwjaar.
* Voeg de specifiek meegegeven "Extra Opties" (indien ingevuld door de gebruiker) toe aan jouw lijst.
* Zorg voor de exacte opmaak met horizontale streepjes (⸻) tussen de secties zoals in het voorbeeld!

---

💡 **ALS HET EEN AUTO IS**, GEBRUIK EXACT DEZE OPMAAK EN VASTE KOPPEN:

[Boordevol enthousiasme beschrijvende introtekst: Te koop aangeboden: een zeer opvallende... Deze auto onderscheidt zich door... etc.]

[Korte alinea over hoe de auto rijdt, onderhoudsstaat, APK en ideale gebruik/doelgroep]

⸻

Basisgegevens
• Merk / Model: [Merk en Model]
• Carrosserie: [Carrosserie]
• Bouwjaar: [Bouwjaar]
• Kilometerstand: [Kilometerstand]
• Brandstof: [Brandstof - Let op restrictie!]
• Transmissie: [Transmissie]
• Motor: [Motor info]
• Vermogen: [Vermogen]
• Kleur exterieur: [Kleur]
• Interieur: [Interieur indien bekend]
• Aantal zitplaatsen: [Zitplaatsen]

⸻

APK, historie & gebruik
• APK geldig tot: [Datum of n.v.t.]
• Onderhoud: [Onderhoudsstaat]
• Rijeigenschappen: [Bijv. Rijdt en schakelt goed]
• Ideaal voor: [Doelgroep/Gebruik]

⸻

Uitvoering & opties

Interieur & comfort
• [Optie 1]
• [Optie 2]

Infotainment
• [Optie 1]

Exterieur
• [Optie 1]
• [Optie 2]

⸻

Waarom deze [Model]?
• [Reden 1]
• [Reden 2]
• [Reden 3]

⸻

Vraagprijs: €[Bedrag]
📞 Interesse of vragen?
Neem gerust contact op via bellen of een bericht.

Hoewel deze advertentie met de grootste zorg is samengesteld, kunnen aan de inhoud geen rechten worden ontleend. Typefouten en wijzigingen voorbehouden.

---

💡 **ALS HET EEN SCOOTER/BROMMER IS**, GEBRUIK EXACT DEZE OPMAAK EN VASTE KOPPEN:

Hierbij bieden wij deze [unieke/in nieuwstaat verkerende etc.] [Merk en Model] aan, voorzien van [korte beschrijving van opties indien relevant].

De scooter is van het bouwjaar [Bouwjaar] en heeft [Kilometerstand] op de teller. Het betreft een [bromscooter/snorfiets] met een topsnelheid van [snelheid].
[Extra zin over afkomst/garantie indien bekend].

Optielijst:

Optisch:
[Opsomming van alle opties onder elkaar, zonder bullets]

Vraagprijs: €[Bedrag] of een goed bod!

Voor vragen of meer informatie kunt u altijd bellen of een bericht sturen naar:
📞 06-20450541

Met vriendelijke groet,
HDS-Trading

Hoewel deze advertentie met de grootste zorg is samengesteld, kunnen er geen rechten worden ontleend aan de inhoud. Wijzigingen en typefouten voorbehouden.

---

EXTRA OUTPUT (VERPLICHT VOOR BEIDE):

Na de advertentie genereer je:

1. **Highlights (3–6 bullets)**
   Korte krachtige verkooppunten

2. **Social media tekst (6–10 regels)**
* Kort
* Aantrekkelijk
* Inclusief prijs
* Call-to-action

---

INPUT DIE JE KRIJGT:
* Merk: ${brand}
* Model: ${model}
* Bouwjaar: ${year}
* Kilometerstand: ${mf.mileage ? mf.mileage + ' km' : 'niet opgegeven'}
* Brandstof RDW: ${fuel}
* Transmissie: ${trans}
* APK (indien auto): ${apk ? apk.replace('APK geldig tot ', '') : 'niet opgegeven'}
* Extra Opties (Door gebruiker): ${mf.features?.length ? mf.features.join(', ') : 'niet opgegeven'}
* Staat: ${mf.vehicleCondition || 'niet opgegeven'}
* Prijs: ${mf.price ? mf.price : 'niet opgegeven'}
* Carrosserie: ${body}
* Kleur: ${color}
${seats ? `* Zitplaatsen: ${seats}` : ''}
${doors ? `* Deuren: ${doors}` : ''}
* Onderhoudshistorie: ${mf.maintenanceHistory || 'niet opgegeven'}
* Aantal sleutels: ${mf.numberOfKeys || 'niet opgegeven'}
* Garantie: ${mf.warranty || 'niet opgegeven'}
* BTW/Marge: ${mf.vatOrMargin === 'vat' ? 'BTW auto' : 'Marge auto'}

Gebruik je kennis om waarschijnlijke opties aan te vullen naast de Extra Opties.
Bepaal zelf of dit een Auto of Scooter is op basis van de input en kies de juiste template.

Gebruik EXACT dit JSON format voor de output (geef je antwoord UITSLUITEND als geldig JSON terug, geen markdown, geen uitleg, gebruik \\n voor regeleinden):
{
  "title": "Pakkende advertentietitel (max 80 tekens)",
  "marketplace_ad": "Volledige marktplaatsadvertentie inclusief het verplichte format en contactblok",
  "social_caption": "Instagram/Facebook caption met emoji's",
  "highlights": ["Hoogtepunt 1", "Hoogtepunt 2", "Hoogtepunt 3"],
  "hashtags": ["#hashtag1", "#hashtag2"]
}`;

    const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    let result;
    try {
      result = await geminiModel.generateContent(prompt);
    } catch (err) {
      console.warn("Gemini 2.5 Flash gefaald, probeer fallback naar gemini-flash-latest...", err);
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
      result = await fallbackModel.generateContent(prompt);
    }
    
    const text = result.response.text().trim();

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      vehicle_summary: { brand, model, year, fuel, transmission: trans, bodyType: body, color },
      title:           parsed.title,
      marketplace_ad:  parsed.marketplace_ad,
      social_caption:  parsed.social_caption,
      highlights:      parsed.highlights || [],
      hashtags:        parsed.hashtags   || [],
    };
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} gekopieerd!`);
  };

  const copyAll = () => {
    if (!result) return;
    const text = `${result.title}\n\n${result.marketplace_ad}\n\n${result.social_caption}\n\nTags: ${result.hashtags.join(' ')}`;
    copyToClipboard(text, 'Alle content');
  };

  // ── Loading Screen ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="app-container">
        <div className="loading-container card">
          <div className="spinner"></div>
          <div className="loading-text">Voertuiggegevens analyseren en advertentie genereren…</div>
        </div>
      </div>
    );
  }

  // ── Results Screen ───────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="app-container">
        <header>
          <div className="brand">
            <img src={logo} alt="HDS-Trading" className="logo" />
          </div>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </header>

        <div className="result-header">
          <h2>Advertentie klaar!</h2>
          <button className="btn btn-outline btn-sm" onClick={() => setResult(null)}>
            <Edit3 size={16} /> Bewerken
          </button>
        </div>

        {/* Vehicle summary */}
        <div className="card">
          <div className="section-title">Voertuiggegevens (RDW)</div>
          <div className="spec-grid">
            {Object.entries(result.vehicle_summary).map(([key, val]) => (
              <div key={key} className="spec-item">
                <div className="spec-label">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                <div className="spec-value">{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="highlight-box">
          <div className="highlight-title">{result.title}</div>
          <div className="copy-btn-wrapper">
            <button className="btn btn-outline btn-sm" onClick={() => copyToClipboard(result.title, 'Titel')}>
              <Copy size={16} /> Kopieer titel
            </button>
          </div>
        </div>

        {/* Marketplace ad */}
        <div className="card">
          <div className="section-title">Marktplaats Advertentie</div>
          <textarea className="form-group" value={result.marketplace_ad} readOnly style={{ height: '250px' }} />
          <div className="copy-btn-wrapper">
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => copyToClipboard(result.marketplace_ad, 'Advertentietekst')}>
              <Copy size={16} /> Kopieer tekst
            </button>
          </div>
        </div>

        <div className="grid-2">
          {/* Social caption */}
          <div className="card">
            <div className="section-title">Social Media Caption</div>
            <textarea className="form-group" value={result.social_caption} readOnly style={{ height: '150px' }} />
            <div className="copy-btn-wrapper">
              <button className="btn btn-outline btn-sm" onClick={() => copyToClipboard(result.social_caption, 'Caption')}>
                <Copy size={16} /> Kopieer caption
              </button>
            </div>
          </div>

          {/* Highlights & hashtags */}
          <div className="card">
            <div className="section-title">Highlights & Tags</div>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
              {result.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
            <div className="hashtag-container">
              {result.hashtags.map((tag, i) => (
                <span key={i} className="hashtag" onClick={() => copyToClipboard(tag, 'Hashtag')}>{tag}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="actions-footer">
          <button className="btn btn-primary" onClick={copyAll}>
            <Copy size={20} /> Alles kopiëren
          </button>
          <button className="btn btn-outline" onClick={generateAd}>
            <RefreshCw size={20} /> Opnieuw genereren
          </button>
        </div>

        {toast && (
          <div className="toast">
            <Check size={20} color="var(--success)" /> {toast}
          </div>
        )}
      </div>
    );
  }

  // ── Main Form ────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <header>
        <div className="brand">
          <img src={logo} alt="HDS-Trading" className="logo" />
        </div>
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
      </header>

      {/* ── Section 1: License Plate ─────────────────────────────────────── */}
      <div className="card">
        <div className="section-title">Kenteken</div>
        <div className="helper-text">Voer een Nederlands kenteken in om voertuiggegevens automatisch op te halen via de RDW.</div>

        <div className="plate-row">
          <input
            type="text"
            className="license-plate-input"
            value={licensePlate}
            onChange={(e) => {
              setLicensePlate(e.target.value);
              setRdwData(null);
              setRdwError('');
            }}
            onKeyDown={handlePlateKeyDown}
            placeholder="XX-123-X"
            maxLength={10}
          />
          <button
            className="btn btn-primary lookup-btn"
            onClick={lookupPlate}
            disabled={rdwLookupLoading || !licensePlate.trim()}
          >
            {rdwLookupLoading
              ? <><Loader2 size={18} className="spin-icon" /> Ophalen…</>
              : <><Search size={18} /> Kenteken opzoeken</>
            }
          </button>
        </div>

        {/* RDW Error */}
        {rdwError && (
          <div className="rdw-error">
            <AlertCircle size={16} />
            {rdwError}
          </div>
        )}

        {/* RDW Result Preview */}
        {rdwData && (
          <div className="rdw-result">
            <div className="rdw-result-header">
              <Check size={16} color="var(--success)" />
              <strong>Voertuig gevonden in RDW</strong>
            </div>
            <div className="spec-grid" style={{ marginTop: '1rem' }}>
              {[
                ['Merk', rdwData.brand],
                ['Model', rdwData.model],
                ['Jaar', rdwData.year],
                ['Brandstof', rdwData.fuel],
                ['Carrosserie', rdwData.bodyType],
                ['Kleur', rdwData.color],
                rdwData.apk ? ['APK vervaldatum', rdwData.apk] : null,
                rdwData.seats ? ['Zitplaatsen', rdwData.seats] : null,
                rdwData.doors ? ['Deuren', rdwData.doors] : null,
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} className="spec-item">
                  <div className="spec-label">{label}</div>
                  <div className="spec-value">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: Photo Upload ──────────────────────────────────────── */}
      <div className="card">
        <div className="section-title">Foto's uploaden</div>
        <div className="helper-text">Upload voertuigfoto's zodat AI kenmerken en conditie kan detecteren.</div>
        <div
          className="upload-zone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="upload-icon" />
          <div>
            <div className="upload-text">Klik of sleep afbeeldingen hierheen</div>
            <div className="upload-subtext">PNG, JPG tot 10 MB</div>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} multiple accept="image/*" />
        </div>

        {images.length > 0 && (
          <div className="image-preview-grid">
            {images.map((img, index) => (
              <div key={index} className="image-preview">
                <img src={img.preview} alt={`Preview ${index}`} />
                <button className="remove-image" onClick={() => removeImage(index)} title="Verwijderen">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: Additional Fields ─────────────────────────────────── */}
      <div className="card">
        <div className="section-title">Extra voertuiginformatie</div>
        <div className="helper-text">Optioneel – vul aan voor een betere advertentie.</div>

        <div className="grid-2">
          <div className="form-group">
            <label>Kilometerstand (km)</label>
            <input type="number" name="mileage" placeholder="bijv. 45000" value={manualFields.mileage} onChange={handleManualFieldChange} />
          </div>
          <div className="form-group">
            <label>Vraagprijs (€)</label>
            <input type="number" name="price" placeholder="bijv. 24950" value={manualFields.price} onChange={handleManualFieldChange} />
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>Garantie</label>
            <select name="warranty" value={manualFields.warranty} onChange={handleManualFieldChange}>
              <option value="">Kies garantie…</option>
              <option value="6 maanden BOVAG">6 maanden BOVAG</option>
              <option value="12 maanden BOVAG">12 maanden BOVAG</option>
              <option value="Dealer garantie">Dealer garantie</option>
              <option value="Geen garantie">Geen garantie</option>
            </select>
          </div>
          <div className="form-group">
            <label>Conditie</label>
            <select name="vehicleCondition" value={manualFields.vehicleCondition} onChange={handleManualFieldChange}>
              <option value="">Kies conditie…</option>
              <option value="Uitstekend (Showroom)">Uitstekend (Showroom)</option>
              <option value="Goed (Lichte gebruikssporen)">Goed (Lichte gebruikssporen)</option>
              <option value="Redelijk (Zichtbare krassen)">Redelijk (Zichtbare krassen)</option>
            </select>
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>BTW of Marge</label>
            <select name="vatOrMargin" value={manualFields.vatOrMargin} onChange={handleManualFieldChange}>
              <option value="margin">Marge auto</option>
              <option value="vat">BTW auto</option>
            </select>
          </div>
          <div className="form-group">
            <label>Aantal sleutels</label>
            <input type="number" name="numberOfKeys" placeholder="bijv. 2" value={manualFields.numberOfKeys} onChange={handleManualFieldChange} />
          </div>
        </div>

        <div className="form-group">
          <label>Onderhoudshistorie</label>
          <input type="text" name="maintenanceHistory" placeholder="bijv. Volledig dealer onderhouden" value={manualFields.maintenanceHistory} onChange={handleManualFieldChange} />
        </div>

        <br />
        <label>Bevestigde opties</label>
        <div className="helper-text" style={{ marginTop: '-0.25rem' }}>Druk Enter om een optie toe te voegen (bijv. Apple CarPlay, Trekhaak)</div>
        <div className="tag-input-container">
          {features.map((feature, i) => (
            <span key={i} className="tag">
              {feature}
              <span className="tag-remove" onClick={() => removeFeature(feature)}><X size={14} /></span>
            </span>
          ))}
          <input
            type="text"
            className="tag-input"
            placeholder={features.length === 0 ? 'Typ en druk Enter…' : ''}
            value={featureInput}
            onChange={(e) => setFeatureInput(e.target.value)}
            onKeyDown={handleFeatureKeyDown}
          />
        </div>
      </div>

      {/* ── Section 4: Generate Button ────────────────────────────────────── */}
      <button
        className="btn btn-primary"
        onClick={generateAd}
        disabled={!licensePlate.trim()}
      >
        <Sparkles size={20} /> Advertentie genereren
      </button>

      {toast && (
        <div className="toast">
          <Check size={20} color="var(--success)" /> {toast}
        </div>
      )}
    </div>
  );
}

export default App;
