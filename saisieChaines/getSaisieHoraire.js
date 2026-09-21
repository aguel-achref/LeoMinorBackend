import { db } from '../app.js';

// Liste fixe des chaînes de production (pas de table de reference)
const CHAINES_VALIDES = Array.from({ length: 15 }, (_, i) => `CH${i + 1}`); // CH1 ... CH15

function isChaineValide(chaine) {
  return CHAINES_VALIDES.includes(chaine);
}

// Function to get the saisies (creneaux).
// - Si "chaine" ET "date" sont fournis : retourne les créneaux de cette chaîne/date (comportement historique).
// - Sinon : retourne TOUTES les saisies, avec filtres optionnels (chaine, date_debut, date_fin) et pagination.
export async function getSaisieHoraire(req, res) {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  const {
    chaine,
    date,
    date_debut,
    date_fin,
    page = 1,
    limit = 20,
  } = req.query;

  try {
    if (chaine && !isChaineValide(chaine)) {
      return res.status(400).json({
        success: false,
        message: `Chaîne invalide. Valeurs attendues : ${CHAINES_VALIDES.join(', ')}.`
      });
    }

    // --- Cas 1 : chaine + date fournis -> comportement historique (pas de pagination) ---
    if (chaine && date) {
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
    }

    // --- Cas 2 : pas de (chaine + date) -> retourne tout, avec filtres optionnels + pagination ---
    const conditions = [];
    const params = [];

    if (chaine) {
      conditions.push('chaine = ?');
      params.push(chaine);
    }
    if (date) {
      conditions.push('date = ?');
      params.push(date);
    }
    if (date_debut) {
      conditions.push('date >= ?');
      params.push(date_debut);
    }
    if (date_fin) {
      conditions.push('date <= ?');
      params.push(date_fin);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const [countRows] = await db.promise().query(
      `SELECT COUNT(*) AS total FROM saisie_horaire ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    const [rows] = await db.promise().query(
      `SELECT id, chaine, date, heure_debut, heure_fin, produit,
              quantite_prevue, quantite_reelle, created_at, updated_at
       FROM saisie_horaire
       ${whereClause}
       ORDER BY date DESC, heure_debut ASC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      }
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