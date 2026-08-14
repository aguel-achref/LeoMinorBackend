import { db } from '../app.js';
import { getCommandesData } from '../commandeExp/getAll.js';

const HEURES_JOUR_NORMAL = 8;
const HEURES_SAMEDI = 5;
const SAMEDI = 6; // Date.getDay() : 0 = dimanche, 6 = samedi

/**
 * Taux d'heures théorique pour un jour donné (avant application du "reste"
 * du dernier jour) : 5h le samedi, 8h les autres jours.
 */
function tauxJournalier(date) {
  return date.getDay() === SAMEDI ? HEURES_SAMEDI : HEURES_JOUR_NORMAL;
}

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
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const y = Number(slashMatch[3]);

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

function diffEnJours(dateA, dateB) {
  return Math.round((dateB - dateA) / 86400000);
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
 * Construit une map { chaine: objectif_heure } à partir des commandes.
 * objectif_heure étant censé représenter une capacité fixe de la chaîne,
 * on garde la dernière valeur non nulle rencontrée pour chaque chaîne.
 */
function buildObjectifParChaine(commandes, champObjectif) {
  const map = {};
  for (const commande of commandes) {
    const chaine = commande.chaine || 'Non défini';
    const valeur = Number(commande[champObjectif]);
    if (!isNaN(valeur) && valeur > 0) {
      map[chaine] = valeur;
    }
  }
  return map;
}

/**
 * Somme des taux journaliers théoriques (8h / 5h le samedi) sur une plage
 * de jours [debut, fin] incluse. Retourne 0 si debut > fin.
 */
function sommeTauxJournaliers(debut, fin) {
  if (debut > fin) return 0;
  let total = 0;
  for (let jour = new Date(debut); jour <= fin; jour = addDays(jour, 1)) {
    total += tauxJournalier(jour);
  }
  return total;
}

/**
 * Pour une commande donnée, calcule combien d'heures elle occupe sa chaîne
 * un jour précis de sa période de production :
 * - taux théorique du jour (8h, ou 5h si samedi) pour chaque jour actif,
 * - SAUF le dernier jour de la période, qui prend le reste
 *   (nombre_heure - somme des taux théoriques de tous les jours précédents),
 *   résultat borné à 0 minimum en cas de données incohérentes.
 *
 * Retourne 0 si le jour n'est pas dans la période de la commande.
 */
function heuresCommandePourJour(commande, jourCible, champNumerique) {
  const nombreHeureTotal = Number(commande[champNumerique]) || 0;
  if (nombreHeureTotal <= 0) return 0;

  const debut = parseDateFlexible(commande.date_debut_production);
  let fin = parseDateFlexible(commande.date_fin_production);
  if (!debut) return 0;
  if (!fin || fin < debut) fin = debut;

  if (jourCible < debut || jourCible > fin) return 0;

  const estDernierJour = diffEnJours(jourCible, fin) === 0;

  if (!estDernierJour) {
    return tauxJournalier(jourCible);
  }

  const avantDernier = addDays(fin, -1);
  const sommeJoursPrecedents = sommeTauxJournaliers(debut, avantDernier);
  const reste = nombreHeureTotal - sommeJoursPrecedents;
  return Math.max(0, reste);
}

/**
 * Calcule, pour un jour précis (ex: aujourd'hui), la somme des heures de
 * toutes les commandes en cours ce jour-là, groupée par chaîne, enrichie
 * avec l'objectif de la chaîne et le pourcentage de charge.
 */
function heuresParChainePourJour(commandes, champNumerique, jourCible, objectifParChaine) {
  const totaux = {};

  for (const commande of commandes) {
    const heures = heuresCommandePourJour(commande, jourCible, champNumerique);
    if (heures <= 0) continue;

    const chaine = commande.chaine || 'Non défini';
    totaux[chaine] = (totaux[chaine] || 0) + heures;
  }

  return Object.entries(totaux)
    .map(([label, total]) => {
      const objectif = objectifParChaine[label] || null;
      const totalArrondi = Math.round(total * 100) / 100;
      const pourcentage = objectif ? Math.round((totalArrondi / objectif) * 100) : null;
      return { label, total: totalArrondi, objectif, pourcentage };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Calcule, pour une semaine précise (semaineDebut -> semaineFin, bornes
 * incluses), la somme des heures de chaque chaîne, en additionnant, pour
 * chaque commande, la contribution jour par jour (taux journalier, reste sur
 * le dernier jour de la PÉRIODE DE LA COMMANDE — pas de la semaine) sur les
 * seuls jours qui tombent dans la semaine.
 */
function heuresParChainePourSemaine(commandes, champNumerique, semaineDebut, semaineFin) {
  const totaux = {};

  for (const commande of commandes) {
    const debut = parseDateFlexible(commande.date_debut_production);
    let fin = parseDateFlexible(commande.date_fin_production);
    if (!debut) continue;
    if (!fin || fin < debut) fin = debut;

    const chevaucheDebut = debut > semaineDebut ? debut : semaineDebut;
    const chevaucheFin = fin < semaineFin ? fin : semaineFin;
    if (chevaucheDebut > chevaucheFin) continue; // pas de chevauchement avec la semaine

    const chaine = commande.chaine || 'Non défini';

    for (let jour = new Date(chevaucheDebut); jour <= chevaucheFin; jour = addDays(jour, 1)) {
      const heures = heuresCommandePourJour(commande, jour, champNumerique);
      if (heures <= 0) continue;
      totaux[chaine] = (totaux[chaine] || 0) + heures;
    }
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

    // Capacité (objectif_heure) par chaîne, dérivée des commandes
    const objectifParChaine = buildObjectifParChaine(commandes, 'objectif_heure');

    // Charge par chaîne pour aujourd'hui (8h/jour, 5h le samedi, reste sur le dernier jour)
    const heuresParChaineAujourdhui = heuresParChainePourJour(
      commandes,
      'nombre_heure',
      today,
      objectifParChaine
    );

    // Charge par chaîne pour la semaine en cours (même logique, sommée jour par jour)
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