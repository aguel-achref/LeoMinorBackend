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
 *
 * Note : nombre_heure est stocké en string en base (vu dans la réponse API),
 * donc on force la conversion en Number avant de sommer.
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
        commandesAlerte,
      },
    });
  } catch (error) {
    console.error('Error returning dashboard summary:', error);
    res.status(500).json({ message: 'Error returning dashboard summary' });
  }
}