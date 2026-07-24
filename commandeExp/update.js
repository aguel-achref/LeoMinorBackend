import { db } from '../app.js';

/**
 * Convertit une date (format ISO "AAAA-MM-JJ" ou objet Date) en Date JS
 * normalisée à minuit, pour ne comparer que les jours entre eux.
 */
function startOfDay(dateInput) {
  const date = new Date(dateInput);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Convertit une date en format ISO "YYYY-MM-DD" attendu par MySQL,
 * qu'elle soit deja au format ISO ou au format francais "JJ/MM/AAAA".
 * Retourne null si le format n'est pas reconnu ou invalide.
 */
function toMySQLDate(dateInput) {
  if (!dateInput) return null;

  // Deja au format ISO "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }

  // Format francais "JJ/MM/AAAA"
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateInput);
  if (match) {
    const [, jour, mois, annee] = match;
    return `${annee}-${mois}-${jour}`;
  }

  // Dernier recours : tenter de parser avec Date natif
  const parsed = new Date(dateInput);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}

/**
 * Determine le statut automatiquement selon les dates.
 *
 * Regles (par ordre de priorite) :
 * 1. date_mise_disposition == aujourd'hui        -> "Jour disposition"
 * 2. date_mise_disposition deja passee           -> "Fermé"
 * 3. date_mise_disposition dans moins de 2 jours -> "Alerte"
 * 4. date_debut_production < aujourd'hui         -> "Ouvert"
 * 5. date_debut_production > aujourd'hui         -> "En attente"
 */
function calculerStatut(date_debut_production, date_mise_disposition) {
  const SEUIL_ALERTE_JOURS = 2;
  const MS_PAR_JOUR = 1000 * 60 * 60 * 24;

  const today = startOfDay(new Date());
  const dispo = startOfDay(date_mise_disposition);
  const debut = startOfDay(date_debut_production);

  const diffDispoJours = Math.round((dispo - today) / MS_PAR_JOUR);

  // 1. date_mise_disposition == aujourd'hui
  if (diffDispoJours === 0) {
    return 'Jour disposition';
  }

  // 2. date_mise_disposition deja passee
  if (diffDispoJours < 0) {
    return 'Fermé';
  }

  // 3. date_mise_disposition dans moins de 2 jours (mais pas aujourd'hui, deja gere ci-dessus)
  if (diffDispoJours > 0 && diffDispoJours < SEUIL_ALERTE_JOURS) {
    return 'Alerte';
  }

  // 4. date_debut_production < aujourd'hui
  if (debut < today) {
    return 'Ouvert';
  }

  // 5. date_debut_production > aujourd'hui
  if (debut > today) {
    return 'En attente';
  }

  // Cas par defaut (debut == aujourd'hui, dispo encore loin)
  return 'Ouvert';
}

/**
 * Calcule automatiquement le nombre de jours necessaires a la production :
 * nombre_jours = qté_commandé / objectif (arrondi au jour superieur).
 *
 * Retourne 0 si objectif est nul, absent ou si les valeurs ne sont pas
 * des nombres valides (evite une division par zero ou un NaN).
 */
function calculerNombreJours(qte_commande, objectif) {
  const qte = Number(qte_commande);
  const obj = Number(objectif);

  if (!obj || isNaN(qte) || isNaN(obj)) {
    return 0;
  }

  return Math.ceil(qte / obj);
}

// Function to update a commande by id
export async function updateCommande(req, res) {
  const { id } = req.params;
  const {
    chaine,
    commande,
    client,
    num_semaine,
    description,
    date_debut_production,
    date_fin_production,
    date_mise_disposition,
    ecart,
    objectif,
    qté_commandé,
    code_commande
  } = req.body;

  const userId = req.user?.id;

  // Check authentication
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  try {
    // Validate required fields (statut et nombre_jours retires : calcules automatiquement)
    if (
      !chaine ||
      !commande ||
      !client ||
      !num_semaine ||
      !qté_commandé ||
      !description ||
      !date_debut_production ||
      !date_fin_production ||
      !date_mise_disposition ||
      ecart === undefined ||
      objectif === undefined ||
      !code_commande
    ) {
      return res.status(400).json({
        success: false,
        message:
          'All fields are required: chaine, commande, client, num_semaine, qté_commandé, description, date_debut_production, date_fin_production, date_mise_disposition, ecart, objectif, code_commande.'
      });
    }

    // Check if the commande exists
    const [existing] = await db.promise().query(
      'SELECT * FROM commandes WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Commande not found.'
      });
    }

    // Normalise les dates au format MySQL (YYYY-MM-DD), qu'elles arrivent
    // en JJ/MM/AAAA (frontend) ou deja en ISO
    const dateDebutMySQL = toMySQLDate(date_debut_production);
    const dateFinMySQL = toMySQLDate(date_fin_production);
    const dateDispoMySQL = toMySQLDate(date_mise_disposition);

    if (!dateDebutMySQL || !dateFinMySQL || !dateDispoMySQL) {
      return res.status(400).json({
        success: false,
        message: 'Format de date invalide. Utilisez JJ/MM/AAAA ou YYYY-MM-DD.'
      });
    }

    // Calcul automatique du statut a partir des dates normalisees
    const statut = calculerStatut(dateDebutMySQL, dateDispoMySQL);

    // Calcul automatique du nombre de jours : qté_commandé / objectif
    const nombre_jours = calculerNombreJours(qté_commandé, objectif);

    // Update the commande
    const [result] = await db.promise().query(
      `UPDATE commandes SET
        chaine = ?,
        statut = ?,
        commande = ?,
        client = ?,
        num_semaine = ?,
        qté_commandé = ?,
        description = ?,
        date_debut_production = ?,
        date_fin_production = ?,
        date_mise_disposition = ?,
        nombre_jours = ?,
        ecart = ?,
        objectif = ?,
        code_commande = ?
      WHERE id = ?`,
      [
        chaine,
        statut,
        commande,
        client,
        num_semaine,
        qté_commandé,
        description,
        dateDebutMySQL,
        dateFinMySQL,
        dateDispoMySQL,
        nombre_jours,
        ecart,
        objectif,
        code_commande,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update the commande.'
      });
    }

    // Retrieve the updated commande
    const [commandeData] = await db.promise().query(
      'SELECT * FROM commandes WHERE id = ?',
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Commande updated successfully.',
      data: commandeData[0]
    });

  } catch (error) {
    console.error('Error updating commande:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the commande.',
      error: error.message
    });
  }
}