import { db } from '../app.js';
import { v4 as uuidv4 } from 'uuid';

// Liste fixe des chaînes de production (pas de table de reference)
const CHAINES_VALIDES = Array.from({ length: 15 }, (_, i) => `CH${i + 1}`); // CH1 ... CH15

function isChaineValide(chaine) {
  return CHAINES_VALIDES.includes(chaine);
}

// Function to create/update the creneaux for a given chaine and date (bulk upsert)
export async function saveSaisieHoraire(req, res) {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  const { chaine, date, entries } = req.body;

  try {
    if (!chaine || !date || !Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: chaine, date, entries (array).'
      });
    }

    if (!isChaineValide(chaine)) {
      return res.status(400).json({
        success: false,
        message: `Chaîne invalide. Valeurs attendues : ${CHAINES_VALIDES.join(', ')}.`
      });
    }

    // Validation de chaque creneau avant toute ecriture en base
    for (const entry of entries) {
      if (!entry.heure_debut || !entry.heure_fin) {
        return res.status(400).json({
          success: false,
          message: 'Chaque créneau doit avoir heure_debut et heure_fin.'
        });
      }
      if (entry.heure_fin <= entry.heure_debut) {
        return res.status(400).json({
          success: false,
          message: `heure_fin doit être après heure_debut (${entry.heure_debut}).`
        });
      }
    }

    const connection = await db.promise().getConnection();

    try {
      await connection.beginTransaction();

      const results = [];

      for (const entry of entries) {
        const {
          id,
          heure_debut,
          heure_fin,
          produit = null,
          quantite_prevue = 0,
          quantite_reelle = null
        } = entry;

        if (id) {
          // Mise a jour d'un creneau existant
          await connection.query(
            `UPDATE saisie_horaire
             SET heure_debut = ?, heure_fin = ?, produit = ?,
                 quantite_prevue = ?, quantite_reelle = ?
             WHERE id = ? AND chaine = ? AND date = ?`,
            [heure_debut, heure_fin, produit, quantite_prevue, quantite_reelle, id, chaine, date]
          );
          results.push({ id, updated: true });
        } else {
          // Nouveau creneau
          const newId = uuidv4();
          await connection.query(
            `INSERT INTO saisie_horaire
               (id, chaine, date, heure_debut, heure_fin, produit, quantite_prevue, quantite_reelle)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               produit = VALUES(produit),
               quantite_prevue = VALUES(quantite_prevue),
               quantite_reelle = VALUES(quantite_reelle)`,
            [newId, chaine, date, heure_debut, heure_fin, produit, quantite_prevue, quantite_reelle]
          );
          results.push({ id: newId, created: true });
        }
      }

      await connection.commit();

      return res.status(200).json({
        success: true,
        message: 'Saisies enregistrées avec succès.',
        data: results
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error saving saisie horaire:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while saving the saisies.',
      error: error.message
    });
  }
}