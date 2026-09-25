const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { Parser } = require('json2csv');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let historiqueScans = [];
const LOCAL_DB_FILE = './base_mondiale.json';
let registreMondial = [];

// Initialisation de la base
if (fs.existsSync(LOCAL_DB_FILE)) {
  registreMondial = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8'));
} else {
  registreMondial = [
    { plate: "DP-953-ZB", country: "FR", model: "Peugeot 508", color: "Gris" },
    { plate: "AA-123-BB", country: "FR", model: "Renault Clio", color: "Noir" },
    { plate: "1-XYZ-99", country: "BE", model: "Audi A3", color: "Blanc" }
  ];
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(registreMondial, null, 2));
}

// 1. Récupérer l'historique des scans
app.get('/api/scans-history', (req, res) => {
  res.json(historiqueScans);
});

// 2. Exporter la liste des scans au format Excel/CSV
app.get('/api/export-csv', (req, res) => {
  try {
    const fields = ['time', 'plate', 'country', 'model', 'color', 'status', 'lat', 'lng'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(historiqueScans);

    res.header('Content-Type', 'text/csv');
    res.attachment(`Rapport_Scans_${Date.now()}.csv`);
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de l'export" });
  }
});

// 3. Réception du Scan avec GPS

app.post('/api/scan', (req, res) => {
  const { plate, lat, lng } = req.body;
  const plaqueLue = plate ? plate.toUpperCase().replace(/\s+/g, '') : "";
  const timestamp = new Date().toLocaleTimeString('fr-FR');

  let result = {
    id: Date.now(),
    time: timestamp,
    plate: plaqueLue,
    country: "FR",
    model: "-",
    color: "-",
    lat: lat || null,
    lng: lng || null
  };

  // 1. Validation de la syntaxe/format (Ex: SIV Français AA-123-AA)
  const regexSIV = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
  const estValideFormat = regexSIV.test(plaqueLue.replace(/-/g, ''));

  // 2. Détection de Doublette par GPS
  const dernierScan = historiqueScans.find(s => s.plate === plaqueLue);
  let estDoublette = false;

  if (dernierScan && lat && lng && dernierScan.lat && dernierScan.lng) {
    const distanceKm = Math.hypot(lat - dernierScan.lat, lng - dernierScan.lng) * 111;
    if (distanceKm > 5) {
      estDoublette = true;
    }
  }

  // Attribution du statut
  if (!estValideFormat) {
    result.status = "FAUSSE";
    result.message = "🚨 FAUSSE PLAQUE (Format non conforme) !";
  } else if (estDoublette) {
    result.status = "DOUBLETTE";
    result.message = "⚠️ SUSPICION DE DOUBLETTE (Position incohérente) !";
  } else {
    result.status = "VALIDE";
    result.message = "✅ PLAQUE CONFORME";
  }

  // Enrichissement optionnel si la plaque existe dans base_mondiale.json
  const vehiculeTrouve = registreMondial.find(v => v.plate === plaqueLue);
  if (vehiculeTrouve) {
    result.country = vehiculeTrouve.country || result.country;
    result.model = vehiculeTrouve.model || result.model;
    result.color = vehiculeTrouve.color || result.color;
  }

  historiqueScans.unshift(result);
  console.log(`[${timestamp}] Scan: ${plaqueLue} | Statut: ${result.status} | GPS: ${lat},${lng}`);

  res.json({
    status: result.status,
    message: result.message,
    details: result
  });
});
app.listen(3000, '0.0.0.0', () => {
  console.log("🚀 Serveur AutoCheck V2 (GPS & Export) prêt sur le port 3000 !");
});