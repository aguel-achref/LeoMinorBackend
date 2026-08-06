import { db } from '../app.js';
import { v4 as uuidv4 } from 'uuid';

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
 * Calcule le nombre de jours necessaires a la production :
 * nombre_jours = qté_commandé / objectif (arrondi au jour superieur)
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

/**
 * Calcule automatiquement le nombre d'heures necessaires a la production :
 * nombre_heure = nombre_jours * heuresParJour (9h de travail par jour)
 */
function calculerNombreHeure(qte_commande, objectif, heuresParJour = 9) {
  const nombreJours = calculerNombreJours(qte_commande, objectif);

  if (!nombreJours) {
    return 0;
  }

  return nombreJours * heuresParJour;
}

/**
 * Calcule automatiquement date_fin_production a partir de date_debut_production
 * en comptant nombre_jours jours de production (le jour de debut compte comme
 * le 1er jour), en excluant les dimanches du calendrier de production.
 *
 * Exemple : qté_commandé = 100, objectif = 100 -> nombre_jours = 1
 * -> date_fin_production = date_debut_production (meme jour).
 *
 * Si un dimanche est rencontre pendant le comptage, il est ignore (ne compte
 * pas comme jour de production) et on passe au jour suivant.
 *
 * Retourne null si date_debut_production est absente ou si le nombre de
 * jours ne peut pas etre calcule (qté_commandé ou objectif invalides).
 *
 * @returns {string|null} date au format "AAAA-MM-JJ"
 */
function calculerDateFinProduction(date_debut_production, qte_commande, objectif) {
  if (!date_debut_production) {
    return null;
  }

  const nombreJours = calculerNombreJours(qte_commande, objectif);

  if (!nombreJours) {
    return null;
  }

  const current = startOfDay(date_debut_production);
  let joursComptes = 0;

  // 0 = dimanche (getDay() de Date JS)
  while (true) {
    if (current.getDay() !== 0) {
      joursComptes++;
      if (joursComptes === nombreJours) break;
    }
    current.setDate(current.getDate() + 1);
  }

  // Formatage en "AAAA-MM-JJ" pour l'insertion MySQL
  const annee = current.getFullYear();
  const mois = String(current.getMonth() + 1).padStart(2, '0');
  const jour = String(current.getDate()).padStart(2, '0');

  return `${annee}-${mois}-${jour}`;
}

/**
 * Calcule automatiquement l'objectif horaire via une requête SQL nommée "obj_heure".
 * Formule : objectif_heure = objectif (quotidien) / nombre d'heures de travail par jour.
 *
 * Le calcul est délégué à MySQL (plutôt qu'à du JS) pour rester cohérent
 * avec la demande : la requête s'appelle obj_heure.
 *
 * @param {number} objectif - objectif quotidien de production
 * @param {number} [heuresParJour=8] - nombre d'heures de travail par jour
 * @returns {Promise<number>} objectif_heure calculé (arrondi à 2 décimales)
 */
async function calculerObjectifHeure(objectif, heuresParJour = 8) {
  const obj = Number(objectif);

  if (!obj || isNaN(obj) || !heuresParJour) {
    return 0;
  }

  // Requête SQL nommée "obj_heure" : calcule objectif_heure = objectif / heuresParJour
  const [obj_heure] = await db.promise().query(
    `SELECT ROUND(? / ?, 2) AS objectif_heure`,
    [obj, heuresParJour]
  );

  return obj_heure[0].objectif_heure;
}

// Function to create a commande
export async function createCommande(req, res) {
  const {
    chaine,
    commande,
    client,
    num_semaine,
    models,
    date_debut_production,
    date_mise_disposition,
    ecart,
    objectif,
    qté_commandé
    // date_fin_production retiree des champs attendus : desormais calculee
    // automatiquement a partir de date_debut_production + nombre de jours
    // (voir calculerDateFinProduction). objectif_heure retire egalement
    // (voir calculerObjectifHeure).
  } = req.body;

  const id = uuidv4();
  const userId = req.user?.id;

  // Check authentication
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  try {
    // Validate required fields (statut, date_fin_production, nombre_heure
    // et objectif_heure retires : calcules automatiquement)
    if (
      !chaine ||
      !commande ||
      !client ||
      !num_semaine ||
      !qté_commandé ||
      !models ||
      !date_debut_production ||
      !date_mise_disposition ||
      ecart === undefined ||
      objectif === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          'All fields are required: chaine, commande, client, num_semaine, qté_commandé, models, date_debut_production, date_mise_disposition, ecart, objectif.'
      });
    }

    // Calcul automatique de la date de fin de production :
    // date_debut_production + nombre de jours (qté_commandé / objectif),
    // dimanches exclus du comptage
    const date_fin_production = calculerDateFinProduction(
      date_debut_production,
      qté_commandé,
      objectif
    );

    if (!date_fin_production) {
      return res.status(400).json({
        success: false,
        message:
          "Impossible de calculer la date de fin de production. Vérifiez que qté_commandé et objectif sont valides."
      });
    }

    // Calcul automatique du statut a partir des dates
    const statut = calculerStatut(date_debut_production, date_mise_disposition);

    // Calcul automatique du nombre d'heures : (qté_commandé / objectif) jours * 9h
    const nombre_heure = calculerNombreHeure(qté_commandé, objectif);

    // Calcul automatique de l'objectif horaire via la requete SQL "obj_heure"
    const objectif_heure = await calculerObjectifHeure(objectif);

    // Insert the commande
    const [result] = await db.promise().query(
      `INSERT INTO commandes (
        id,
        user_id,
        chaine,
        statut,
        commande,
        client,
        num_semaine,
        qté_commandé,
        models,
        date_debut_production,
        date_fin_production,
        date_mise_disposition,
        nombre_heure,
        ecart,
        objectif,
        objectif_heure
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        chaine,
        statut,
        commande,
        client,
        num_semaine,
        qté_commandé,
        models,
        date_debut_production,
        date_fin_production,
        date_mise_disposition,
        nombre_heure,
        ecart,
        objectif,
        objectif_heure
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create the commande.'
      });
    }

    // Retrieve the created commande
    const [commandeData] = await db.promise().query(
      'SELECT * FROM commandes WHERE id = ?',
      [id]
    );

    return res.status(201).json({
      success: true,
      message: 'Commande created successfully.',
      data: commandeData[0]
    });

  } catch (error) {
    console.error('Error creating commande:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating the commande.',
      error: error.message
    });
  }
}