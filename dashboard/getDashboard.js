import { db } from '../app.js';
import { getCommandesData } from '../commandeExp/getAll.js';

/**
 * Regroupe un tableau de commandes par une clé donnée et retourne
 * un tableau [{ label, count }] trié par count décroissant.
 */
function grouperEtCompter(commandes, cle) {
  const compteurs = {};

  for (const commande of commandes) {
    const valeur = commande[cle] || 'Non défini';
    compteurs[valeur] = (compteurs[valeur] || 0) + 1;
  }

  return Object.entries(compteurs)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Regroupe un tableau de commandes par une clé donnée et SOMME un champ
 * numérique (ex: nombre_heure) au lieu de compter les occurrences.
 * Retourne [{ label, total }] trié par total décroissant.
 */
function grouperEtSommer(commandes, cleGroupe, champNumerique) {
  const totaux = {};

  for (const commande of commandes) {
    const valeur = commande[cleGroupe] || 'Non défini';
    const nombre = Number(commande[champNumerique]) || 0;
    totaux[valeur] = (totaux[valeur] || 0) + nombre;
  }

  return Object.entries(totaux)
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Construit un Date à minuit local à partir d'une valeur de date quelconque
 * (string SQL, Date, timestamp). Retourne null si invalide.
 */
function parseDateLocal(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Formate un Date en "YYYY-MM-DD" en utilisant les composants locaux
 * (évite les décalages de fuseau horaire liés à toISOString()).
 */
function formatDateJour(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calcule le label de semaine ISO 8601 ("YYYY-Www") pour une date donnée.
 */
function getISOWeekLabel(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-S${String(weekNum).padStart(2, '0')}`;
}

/**
 * Pour chaque commande, nombre_heure représente la charge PAR JOUR (pas un total
 * à répartir). Une commande "occupe" donc sa chaîne à raison de nombre_heure
 * chaque jour de date_debut_production à date_fin_production (bornes incluses).
 *
 * Pour un jour donné, si plusieurs commandes de la même chaîne se chevauchent,
 * leurs heures s'additionnent (charge cumulée réelle de la chaîne ce jour-là).
 *
 * Seuls les jours compris dans la fenêtre [aujourd'hui - pastDays, aujourd'hui + futureDays]
 * sont conservés, pour éviter un graphique surchargé.
 *
 * @returns {{ parJour: {labels, chaines, series}, parSemaine: {labels, chaines, series} }}
 */
function repartirHeuresParChaine(commandes, champNumerique, pastDays = 3, futureDays = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowStart = addDays(today, -pastDays);
  const windowEnd = addDays(today, futureDays);

  const parJour = {}; // { 'YYYY-MM-DD': { chaine: heures } }
  const parSemaine = {}; // { 'YYYY-Sww': { chaine: heures } }
  const chainesSet = new Set();

  for (const commande of commandes) {
    const chaine = commande.chaine || 'Non défini';
    const heuresParJourCommande = Number(commande[champNumerique]) || 0;
    if (heuresParJourCommande <= 0) continue;

    const debut = parseDateLocal(commande.date_debut_production);
    let fin = parseDateLocal(commande.date_fin_production);

    if (!debut) continue; // pas de date de début exploitable, on ignore cette commande
    if (!fin || fin < debut) fin = debut; // sécurité si fin manquante/incohérente

    chainesSet.add(chaine);

    // Chaque jour de la période reçoit la charge PLEINE (pas divisée) de cette commande
    for (let jour = new Date(debut); jour <= fin; jour = addDays(jour, 1)) {
      if (jour < windowStart || jour > windowEnd) continue; // hors fenêtre affichée

      const jourLabel = formatDateJour(jour);
      const semaineLabel = getISOWeekLabel(jour);

      if (!parJour[jourLabel]) parJour[jourLabel] = {};
      parJour[jourLabel][chaine] =
        (parJour[jourLabel][chaine] || 0) + heuresParJourCommande;

      if (!parSemaine[semaineLabel]) parSemaine[semaineLabel] = {};
      parSemaine[semaineLabel][chaine] =
        (parSemaine[semaineLabel][chaine] || 0) + heuresParJourCommande;
    }
  }

  const chaines = Array.from(chainesSet).sort();

  function buildStructure(map) {
    const labels = Object.keys(map).sort();
    const series = chaines.map((chaine) => ({
      chaine,
      data: labels.map((label) => Math.round((map[label]?.[chaine] || 0) * 100) / 100),
    }));
    return { labels, chaines, series };
  }

  return {
    parJour: buildStructure(parJour),
    parSemaine: buildStructure(parSemaine),
  };
}

/**
 * GET /api/dashboard/summary
 * Retourne les statistiques globales pour le dashboard.
 */
export async function getDashboardSummary(req, res) {
  try {
    const commandes = await getCommandesData();

    const [clientsRows] = await db
      .promise()
      .query('SELECT COUNT(*) AS total FROM clients');

    const commandesParStatut = grouperEtCompter(commandes, 'statut');
    const commandesParClient = grouperEtCompter(commandes, 'client');
    const commandesParChaine = grouperEtCompter(commandes, 'chaine');

    // Total d'heures de production nécessaires, regroupé par client
    const heuresParClient = grouperEtSommer(commandes, 'client', 'nombre_heure');

    // Charge réelle par chaîne, jour par jour (nombre_heure = charge/jour, cumulée
    // si plusieurs commandes se chevauchent sur la même chaîne le même jour)
    const { parJour: heuresParChaineParJour, parSemaine: heuresParChaineParSemaine } =
      repartirHeuresParChaine(commandes, 'nombre_heure', 3, 30);

    const commandesAlerte = commandes.filter((c) =>
      ['Alerte', 'Jour disposition'].includes(c.statut)
    );

    return res.status(200).json({
      success: true,
      status: 200,
      message: 'Dashboard summary returned successfully',
      data: {
        totalCommandes: commandes.length,
        totalClients: clientsRows[0].total,
        commandesParStatut,
        commandesParClient,
        commandesParChaine,
        heuresParClient,
        heuresParChaineParJour,
        heuresParChaineParSemaine,
        commandesAlerte,
      },
    });
  } catch (error) {
    console.error('Error returning dashboard summary:', error);
    res.status(500).json({ message: 'Error returning dashboard summary' });
  }
}