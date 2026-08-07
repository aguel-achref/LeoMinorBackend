import ExcelJS from 'exceljs';
import { db } from '../app.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Import en masse de commandes à partir d'un fichier Excel (format export
 * "Toutes les commandes" type Decathlon, avec un bandeau d'en-tête suivi
 * d'une ligne de titres de colonnes quelque part dans les premières lignes).
 *
 * Le fichier NE contient PAS de colonne "chaine" ni "objectif" : ces deux
 * champs sont donc mis à une valeur par défaut (chaine = "", objectif = 0)
 * et devront être corrigés ligne par ligne après import, directement dans
 * le tableau (popup de modification déjà existante).
 *
 * date_fin_production N'EST PAS recalculée ici (contrairement à
 * createCommande) : comme objectif vaut 0, le calcul basé sur
 * qté_commandé / objectif serait impossible. On reprend donc directement
 * la colonne "Date de fin de production" telle qu'elle est présente dans
 * le fichier Excel source.
 *
 * Route attendue : POST /api/commandes/importCommandes
 * - multipart/form-data, champ fichier "file"
 * - champ texte "client" (obligatoire, choisi par l'utilisateur dans le
 *   formulaire d'import, appliqué à toutes les lignes importées)
 * - champ texte optionnel "chaine" (sinon "")
 * - champ texte optionnel "objectif" (sinon 0)
 */

// ---- Helpers de calcul (copies volontaires des fonctions déjà présentes
// dans commande.js, pour rester autonome ; à terme, à déplacer avec le
// reste de la logique dans statutHelper.js comme pour createCommande) ----

function startOfDay(dateInput) {
  const date = new Date(dateInput);
  date.setHours(0, 0, 0, 0);
  return date;
}

function calculerStatut(date_debut_production, date_mise_disposition) {
  const SEUIL_ALERTE_JOURS = 2;
  const MS_PAR_JOUR = 1000 * 60 * 60 * 24;

  if (!date_debut_production && !date_mise_disposition) {
    return 'En attente';
  }

  const today = startOfDay(new Date());
  const dispo = date_mise_disposition ? startOfDay(date_mise_disposition) : null;
  const debut = date_debut_production ? startOfDay(date_debut_production) : null;

  if (dispo) {
    const diffDispoJours = Math.round((dispo - today) / MS_PAR_JOUR);
    if (diffDispoJours === 0) return 'Jour disposition';
    if (diffDispoJours < 0) return 'Fermé';
    if (diffDispoJours > 0 && diffDispoJours < SEUIL_ALERTE_JOURS) return 'Alerte';
  }

  if (debut) {
    if (debut < today) return 'Ouvert';
    if (debut > today) return 'En attente';
  }

  return 'Ouvert';
}

// ecart = date_mise_disposition - date_fin_production (en jours)
function calculerEcart(date_fin_production, date_mise_disposition) {
  if (!date_fin_production || !date_mise_disposition) return null;
  const MS_PAR_JOUR = 1000 * 60 * 60 * 24;
  const fin = startOfDay(date_fin_production);
  const dispo = startOfDay(date_mise_disposition);
  return Math.round((dispo - fin) / MS_PAR_JOUR);
}

// Numéro de semaine ISO 8601 (1 à 53)
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function calculerNumSemaine(date_debut_production, date_mise_disposition) {
  if (!date_debut_production || !date_mise_disposition) return '';
  const wDebut = getWeekNumber(new Date(date_debut_production));
  const wDispo = getWeekNumber(new Date(date_mise_disposition));
  const sDebut = `S${String(wDebut).padStart(2, '0')}`;
  const sDispo = `S${String(wDispo).padStart(2, '0')}`;
  return wDebut === wDispo ? sDebut : `${sDebut}_${sDispo}`;
}

// Formate un objet Date (ou valeur cellule Excel) en "AAAA-MM-JJ" pour MySQL
function toMysqlDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  const annee = d.getFullYear();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

// Repère la ligne d'en-tête (celle qui contient les titres de colonnes,
// ex: "Commande", "Qté commandé", ...) dans les 20 premières lignes, et
// construit une correspondance { "Nom de colonne" -> numéro de colonne }.
function detecterEntetes(worksheet) {
  const COLONNES_CLES = ['Commande', 'Qté commandé', 'Modèle'];

  for (let rowNumber = 1; rowNumber <= 20; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const valeurs = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      valeurs.push(String(cell.value ?? '').trim());
    });

    const contientToutesLesCles = COLONNES_CLES.every((cle) => valeurs.includes(cle));
    if (contientToutesLesCles) {
      const mapping = {};
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        mapping[String(cell.value ?? '').trim()] = colNumber;
      });
      return { headerRowNumber: rowNumber, mapping };
    }
  }

  return null;
}

export async function importCommandes(req, res) {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // --- DEBUG TEMPORAIRE : à retirer une fois le problème résolu ---
  console.log('DEBUG import - Content-Type reçu:', req.headers['content-type']);
  console.log('DEBUG import - req.file:', req.file);
  console.log('DEBUG import - req.body:', req.body);
  // -----------------------------------------------------------------

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Aucun fichier reçu. Envoyez le fichier Excel dans le champ 'file'."
    });
  }

  const client = (req.body.client || '').trim();
  const chaineParDefaut = (req.body.chaine || '').trim();
  const objectifParDefaut = Number(req.body.objectif) || 0;

  if (!client) {
    return res.status(400).json({
      success: false,
      message: "Le champ 'client' est obligatoire pour l'import."
    });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];

    const entetes = detecterEntetes(worksheet);
    if (!entetes) {
      return res.status(400).json({
        success: false,
        message:
          "Impossible de trouver la ligne d'en-têtes dans le fichier (colonnes 'Commande', 'Qté commandé', 'Modèle' introuvables)."
      });
    }

    const { headerRowNumber, mapping } = entetes;
    const colCommande = mapping['Commande'];
    const colModele = mapping['Modèle'];
    const colQteCommande = mapping['Qté commandé'];
    const colDateDebut = mapping['Date de début de production'];
    const colDateFin = mapping['Date de fin de production'];
    const colDateDispo = mapping['Date de mise à disposition'];

    const lignesAImporter = [];
    const erreurs = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return; // saute le bandeau + l'en-tête

      const commandeVal = row.getCell(colCommande).value;
      const modeleVal = colModele ? row.getCell(colModele).value : null;
      const qteVal = colQteCommande ? row.getCell(colQteCommande).value : null;

      // Ligne vide (fin du tableau) : on arrête de la considérer comme une commande
      if (commandeVal === null || commandeVal === undefined || commandeVal === '') {
        return;
      }

      const dateDebut = colDateDebut ? row.getCell(colDateDebut).value : null;
      const dateFin = colDateFin ? row.getCell(colDateFin).value : null;
      const dateDispo = colDateDispo ? row.getCell(colDateDispo).value : null;

      if (!dateDebut || !dateDispo) {
        erreurs.push({ ligne: rowNumber, raison: 'Date de début ou de mise à disposition manquante' });
        return;
      }

      lignesAImporter.push({
        commande: String(commandeVal),
        models: modeleVal ? String(modeleVal) : '',
        qté_commandé: Number(qteVal) || 0,
        date_debut_production: toMysqlDate(dateDebut),
        date_fin_production: toMysqlDate(dateFin) || toMysqlDate(dateDebut),
        date_mise_disposition: toMysqlDate(dateDispo)
      });
    });

    if (lignesAImporter.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucune ligne exploitable trouvée dans le fichier.',
        erreurs
      });
    }

    const commandesInserees = [];

    for (const ligne of lignesAImporter) {
      const id = uuidv4();
      const statut = calculerStatut(ligne.date_debut_production, ligne.date_mise_disposition);
      const ecart = calculerEcart(ligne.date_fin_production, ligne.date_mise_disposition);
      const num_semaine = calculerNumSemaine(ligne.date_debut_production, ligne.date_mise_disposition);

      await db.promise().query(
        `INSERT INTO commandes (
          id,
          user_id,
          chaine,
          statut,
          commande,
          client,
          num_semaine,
          qté_commandé,
          models,
          date_debut_production,
          date_fin_production,
          date_mise_disposition,
          nombre_heure,
          ecart,
          objectif,
          objectif_heure
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          chaineParDefaut,
          statut,
          ligne.commande,
          client,
          num_semaine,
          ligne.qté_commandé,
          ligne.models,
          ligne.date_debut_production,
          ligne.date_fin_production,
          ligne.date_mise_disposition,
          0, // nombre_heure : dépend de objectif, recalculé une fois objectif corrigé
          ecart,
          objectifParDefaut,
          0 // objectif_heure : idem
        ]
      );

      commandesInserees.push({ id, commande: ligne.commande, models: ligne.models });
    }

    return res.status(201).json({
      success: true,
      message: `${commandesInserees.length} commande(s) importée(s) avec succès.`,
      imported: commandesInserees.length,
      skipped: erreurs.length,
      erreurs,
      data: commandesInserees
    });
  } catch (error) {
    console.error("Erreur lors de l'import des commandes:", error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue pendant l'import du fichier.",
      error: error.message
    });
  }
}