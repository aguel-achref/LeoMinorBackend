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
 * Parse une date venant de la DB/API en un Date local à minuit (heure zéro),
 * en gérant plusieurs formats possibles :
 * - objet Date natif (cas le plus probable avec une colonne MySQL DATE/DATETIME)
 * - string ISO "YYYY-MM-DD..."
 * - string "JJ/MM/AAAA" ou "MM/JJ/AAAA" (désambiguïsation si un des deux nombres > 12,
 *   sinon on assume JJ/MM/AAAA — contexte français)
 * Retourne null si la valeur est vide ou invalide.
 */
function parseDateFlexible(value) {
  if (!value) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value !== 'string') return null;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    let [, a, b, y] = slashMatch.map(Number) ? slashMatch : slashMatch;
    a = Number(slashMatch[1]);
    b = Number(slashMatch[2]);
    y = Number(slashMatch[3]);

    let day, month;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      day = b;
      month = a;
    } else {
      // ambigu : on assume JJ/MM/AAAA (contexte français)
      day = a;
      month = b;
    }
    return new Date(y, month - 1, day);
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Retourne le lundi (00:00) de la semaine contenant `date`.
 */
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = dimanche, 1 = lundi, ...
  const diff = (day === 0 ? -6 : 1) - day; // décale vers le lundi de la semaine
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateAffichage(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * nombre_heure représente la charge PAR JOUR d'une commande (pas un total à
 * répartir). Une commande "occupe" sa chaîne à raison de nombre_heure chaque
 * jour de date_debut_production à date_fin_production (bornes incluses).
 *
 * Calcule, pour un jour précis (ex: aujourd'hui), la somme des heures de
 * toutes les commandes en cours ce jour-là, groupée par chaîne.
 */
function heuresParChainePourJour(commandes, champNumerique, jourCible) {
  const totaux = {};

  for (const commande of commandes) {
    const chaine = commande.chaine || 'Non défini';
    const heuresParJour = Number(commande[champNumerique]) || 0;
    if (heuresParJour <= 0) continue;

    const debut = parseDateFlexible(commande.date_debut_production);
    let fin = parseDateFlexible(commande.date_fin_production);
    if (!debut) continue;
    if (!fin || fin < debut) fin = debut;

    if (jourCible >= debut && jourCible <= fin) {
      totaux[chaine] = (totaux[chaine] || 0) + heuresParJour;
    }
  }

  return Object.entries(totaux)
    .map(([label, total]) => ({ label, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Calcule, pour une semaine précise (semaineDebut -> semaineFin, bornes
 * incluses), la somme des heures de chaque chaîne : pour chaque commande,
 * on compte le nombre de jours de la semaine réellement couverts par sa
 * période de production, multiplié par ses heures/jour.
 */
function heuresParChainePourSemaine(commandes, champNumerique, semaineDebut, semaineFin) {
  const totaux = {};

  for (const commande of commandes) {
    const chaine = commande.chaine || 'Non défini';
    const heuresParJour = Number(commande[champNumerique]) || 0;
    if (heuresParJour <= 0) continue;

    const debut = parseDateFlexible(commande.date_debut_production);
    let fin = parseDateFlexible(commande.date_fin_production);
    if (!debut) continue;
    if (!fin || fin < debut) fin = debut;

    const chevaucheDebut = debut > semaineDebut ? debut : semaineDebut;
    const chevaucheFin = fin < semaineFin ? fin : semaineFin;
    if (chevaucheDebut > chevaucheFin) continue; // pas de chevauchement avec la semaine

    const joursChevauchement =
      Math.round((chevaucheFin - chevaucheDebut) / 86400000) + 1;

    totaux[chaine] = (totaux[chaine] || 0) + heuresParJour * joursChevauchement;
  }

  return Object.entries(totaux)
    .map(([label, total]) => ({ label, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = getStartOfWeek(today);
    const weekEnd = addDays(weekStart, 6);

    // Charge par chaîne, uniquement pour aujourd'hui
    const heuresParChaineAujourdhui = heuresParChainePourJour(
      commandes,
      'nombre_heure',
      today
    );

    // Charge par chaîne, uniquement pour la semaine en cours
    const heuresParChaineSemaine = heuresParChainePourSemaine(
      commandes,
      'nombre_heure',
      weekStart,
      weekEnd
    );

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
        heuresParChaineAujourdhui,
        heuresParChaineSemaine,
        dateAujourdhuiLabel: formatDateAffichage(today),
        semaineLabel: `${formatDateAffichage(weekStart)} - ${formatDateAffichage(weekEnd)}`,
        commandesAlerte,
      },
    });
  } catch (error) {
    console.error('Error returning dashboard summary:', error);
    res.status(500).json({ message: 'Error returning dashboard summary' });
  }
}