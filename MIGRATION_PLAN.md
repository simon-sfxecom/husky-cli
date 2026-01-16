# eBay Listings Migration: SeaTable → NocoDB

## 📊 Datenstruktur-Analyse

### SeaTable Source
```
eBay Listings (72 columns, ~719 rows)
  ├─ SKU: "XM4U0004"
  ├─ Title: "Xiaomi Mi 4 Ultra Daumengas..."
  ├─ Compatible with (TEXT): "Xiaomi 4 Ultra"  ← Als Text gespeichert!
  ├─ Compatible (LINK): []                      ← LEER im Sample!
  ├─ CompatibleList (checkbox): true
  └─ Price, GTIN, Images, etc.

Compatible Table (27 columns)
  ├─ Name
  ├─ SKU
  ├─ ProductType
  ├─ CompatibleDevices 0-13 (14 link columns!) → CompatibleDevices Table
  ├─ VehicleModels (link) → VehicleModels Table
  └─ eBayListings (link) → zurück zu eBay Listings

VehicleModels Table (17 columns)
  ├─ Name: "Xiaomi Mi 4 Ultra"
  ├─ Brand (link) → Brands
  ├─ ABE-Nr
  ├─ Tire Size, BrakeType
  └─ Shopify Listings (link)

CompatibleDevices Table (17 columns)
  ├─ Name
  └─ Parts, Tire, BrakeDisc, etc. (links zu Produkten)
```

### NocoDB Target
```
eBayFeed Table (in "Product Data Management")
  └─ 719 rows existing

Vehicles Table
  └─ 403 rows

VehicleModelSources Table
  └─ 693 rows
```

---

## ⚠️ **KRITISCHES PROBLEM GEFUNDEN!**

**Das Sample-Listing zeigt:**
- ✅ `Compatible with` (TEXT): "Xiaomi 4 Ultra"
- ❌ `Compatible` (LINK): `[]` (LEER!)

**Das bedeutet:**
Die Link-Beziehung zwischen eBay Listings und Compatible-Tabelle ist **NICHT** gepflegt!

---

## 🎯 Migrationsstrategien

### **Option A: Text-basiert (EINFACH, aber ungenau)**

**Vorgehen:**
1. eBay Listing lesen
2. TEXT-Feld "Compatible with" parsen (z.B. "Xiaomi 4 Ultra")
3. In NocoDB `VehicleModelSources` nach diesem Namen suchen
4. Listing mit gefundenen Fahrzeugen verknüpfen

**Vorteile:**
- ✅ Einfach
- ✅ Schnell implementierbar
- ✅ Funktioniert mit den vorhandenen Daten

**Nachteile:**
- ❌ Ungenau (Textmatching kann fehlschlagen)
- ❌ Verliert detaillierte Kompatibilitätsinfos (CompatibleDevices)
- ❌ Keine Info über spezifische Teile (Reifen, Bremsen, etc.)

---

### **Option B: Link-basiert über SKU-Matching (MITTEL)**

**Vorgehen:**
1. eBay Listing lesen
2. Über SKU in Compatible-Tabelle suchen
3. Von Compatible → VehicleModels folgen
4. Von Compatible → CompatibleDevices (0-13) folgen
5. Alle Daten sammeln und nach NocoDB migrieren

**Vorteile:**
- ✅ Nutzt strukturierte Daten
- ✅ Behält Kompatibilitätsdetails
- ✅ Präziser

**Nachteile:**
- ❌ Komplex (3-4 Tabellen-Joins)
- ❌ Funktioniert nur wenn SKU gepflegt ist
- ❌ 14 CompatibleDevices-Spalten müssen gemerged werden

---

### **Option C: Hybrid (EMPFOHLEN)**

**Vorgehen:**
1. eBay Listing lesen
2. **PRIMÄR:** Versuche über SKU in Compatible zu finden
3. **FALLBACK:** Wenn leer, parse TEXT "Compatible with"
4. Für gefundene Compatible-Records:
   - Folge VehicleModels link
   - Sammle CompatibleDevices (merge 0-13)
5. Flatten & Insert in NocoDB

**Vorteile:**
- ✅ Robust (funktioniert auch mit fehlenden Links)
- ✅ Nutzt strukturierte Daten wenn vorhanden
- ✅ Fallback für ungepflegte Daten

**Nachteile:**
- ⚠️ Mittlere Komplexität
- ⚠️ Braucht gutes Error-Handling

---

## 📋 Implementierungsplan (Option C)

### Phase 1: Data Extraction
```typescript
interface ExtractedListing {
  // Core eBay Data
  sku: string;
  title: string;
  price: number;
  gtin: string;
  sourceId: string; // eBay Item ID

  // Compatibility
  compatibleVehicles: Array<{
    name: string;
    brand: string;
    abeNr?: string;
    source: 'link' | 'text'; // Woher kam die Info?
  }>;

  compatibleDevices: Array<{
    name: string;
    parts: string[]; // Reifen, Bremsen, etc.
  }>;

  // Metadata
  images: string[];
  description: string;
}
```

### Phase 2: Data Transformation
```typescript
// Flatten 14 CompatibleDevices columns
const allDevices = [
  ...compatible.CompatibleDevices,
  ...compatible['CompatibleDevices 1'],
  ...compatible['CompatibleDevices 2'],
  // ... bis 13
].filter(Boolean);

// Merge vehicle data
const vehicleData = await Promise.all(
  vehicleModelIds.map(id =>
    seatable.getRow('VehicleModels', id)
  )
);
```

### Phase 3: NocoDB Insert
```typescript
await nocodb.records.create('eBayFeed', {
  sku: extracted.sku,
  title: extracted.title,
  price: extracted.price,
  // ... weitere Felder

  // Vehicle compatibility (als JSON oder separate Relation)
  compatible_vehicles: JSON.stringify(extracted.compatibleVehicles),

  // Oder: Relation-Tabelle erstellen
  // → eBayFeed_VehicleModels junction table
});
```

---

## 🔧 Technische Details

### 1. **Batch Processing**
```typescript
// Process in chunks to avoid memory issues
const BATCH_SIZE = 50;
for (let i = 0; i < totalListings; i += BATCH_SIZE) {
  const batch = await seatable.listRows({
    table_name: 'eBay Listings',
    offset: i,
    limit: BATCH_SIZE
  });

  await processBatch(batch);
}
```

### 2. **Error Handling**
```typescript
const errors: Array<{sku: string, error: string}> = [];

try {
  await migrateL listing(listing);
} catch (error) {
  errors.push({
    sku: listing.SKU,
    error: error.message
  });
  // Continue with next listing
}

// Save errors for review
fs.writeFileSync('migration-errors.json', JSON.stringify(errors));
```

### 3. **Deduplication**
```typescript
// Check if already migrated
const existing = await nocodb.records.find(
  'Product Data Management',
  'eBayFeed',
  'SKU',
  listing.SKU
);

if (existing.length > 0) {
  console.log(`SKU ${listing.SKU} already exists, skipping...`);
  continue;
}
```

---

## 📊 Erwartetes Ergebnis

### Input: 719 eBay Listings (SeaTable)
### Output: NocoDB eBayFeed mit:
- ✅ Alle Basis-Produktdaten
- ✅ Fahrzeugkompatibilität (flatened oder als Relation)
- ✅ Device-Kompatibilität (zusammengefasst)
- ✅ Fehlerlog für problematische Einträge

---

## 🚀 Nächste Schritte

1. **Entscheidung:** Welche Option (A/B/C)?
2. **Schema-Design:** Wie sollen Fahrzeuge in NocoDB gespeichert werden?
   - Als JSON-Feld?
   - Als separate Junction-Tabelle?
   - Als Text (komma-separiert)?
3. **Dry-Run:** Migration mit 10 Listings testen
4. **Full Migration:** Alle 719 Listings

---

## ❓ Offene Fragen

1. **Wie soll die Fahrzeugkompatibilität in NocoDB strukturiert sein?**
   - Möchtest du die Link-Beziehungen beibehalten?
   - Oder reicht ein Text/JSON-Feld?

2. **Was passiert mit den CompatibleDevices?**
   - Sollen die auch migriert werden?
   - Oder nur die Fahrzeug-Kompatibilität?

3. **Duplikate?**
   - Was wenn SKU schon in NocoDB existiert?
   - Update oder Skip?

4. **Bilder?**
   - Sollen die Bild-URLs kopiert werden?
   - Oder die Bilder selbst migriert werden?
