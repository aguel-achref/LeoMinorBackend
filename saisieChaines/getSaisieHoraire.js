import { db } from '../app.js';

// Liste fixe des chaînes de production (pas de table de reference)
const CHAINES_VALIDES = Array.from({ length: 15 }, (_, i) => `CH${i + 1}`); // CH1 ... CH15

function isChaineValide(chaine) {
  return CHAINES_VALIDES.includes(chaine);
}

// Function to get the saisies (creneaux) for a given chaine and date
export async function getSaisieHoraire(req, res) {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  const { chaine, date } = req.query;

  try {
    if (!chaine || !date) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: chaine, date.'
      });
    }

    if (!isChaineValide(chaine)) {
      return res.status(400).json({
        success: false,
        message: `Chaîne invalide. Valeurs attendues : ${CHAINES_VALIDES.join(', ')}.`
      });
    }

    const [rows] = await db.promise().query(
      `SELECT id, chaine, date, heure_debut, heure_fin, produit,
              quantite_prevue, quantite_reelle, created_at, updated_at
       FROM saisie_horaire
       WHERE chaine = ? AND date = ?
       ORDER BY heure_debut ASC`,
      [chaine, date]
    );

    return res.status(200).json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error('Error fetching saisie horaire:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the saisies.',
      error: error.message
    });
  }
}