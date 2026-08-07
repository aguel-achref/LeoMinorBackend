import { db } from "../app.js";

/**
 * Supprime plusieurs commandes en une seule requête.
 *
 * Route : DELETE /api/commandes/deleteMultipleCommandes
 * Body attendu (JSON) : { "ids": ["id1", "id2", "id3", ...] }
 */
export async function deleteMultipleCommandes(req, res) {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Le champ 'ids' doit être un tableau non vide d'identifiants."
    });
  }

  try {
    // 'IN (?)' + passer le tableau directement fonctionne avec mysql2,
    // qui l'étend automatiquement en 'IN (?, ?, ?, ...)'
    const [result] = await db.promise().query("DELETE FROM commandes WHERE id IN (?)", [ids]);

    return res.status(200).json({
      success: true,
      status: 200,
      message: `${result.affectedRows} commande(s) supprimée(s) avec succès.`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error("Error deleting multiple commandes:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting commandes"
    });
  }
}