import { db } from '../app.js';
import { getCommandesData } from '../commandeExp/getAll.js'; // adapte le chemin si besoin

/**
 * Regroupe un tableau de commandes par une clé donnée (ex: "client", "statut", "chaine")
 * et retourne un tableau [{ label, count }] trié par count décroissant.
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
 * GET /api/dashboard/summary
 * Retourne les statistiques globales pour le dashboard :
 * - totaux (commandes, clients)
 * - répartition par statut / par client / par chaîne
 * - commandes à surveiller (Alerte, Jour disposition)
 */
export async function getDashboardSummary(req, res) {
  try {
    // Réutilise la logique métier existante -> statuts toujours à jour
    const commandes = await getCommandesData();

    const [clientsRows] = await db
      .promise()
      .query('SELECT COUNT(*) AS total FROM clients');

    const commandesParStatut = grouperEtCompter(commandes, 'statut');
    const commandesParClient = grouperEtCompter(commandes, 'client');
    const commandesParChaine = grouperEtCompter(commandes, 'chaine');

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
        commandesAlerte,
      },
    });
  } catch (error) {
    console.error('Error returning dashboard summary:', error);
    res.status(500).json({ message: 'Error returning dashboard summary' });
  }
}