import { db } from '../app.js';

// Convertit une valeur de date venant de MySQL (objet Date, string ISO "AAAA-MM-JJ",
// ou deja au format "JJ/MM/AAAA") en une chaine normalisee "JJ/MM/AAAA".
// Utilise les getters UTC pour eviter tout decalage de fuseau horaire.
function formatDateFR(value) {
  if (!value) return null;

  // Deja au bon format
  if (typeof value === 'string' && value.includes('/')) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const jour = String(date.getUTCDate()).padStart(2, '0');
  const mois = String(date.getUTCMonth() + 1).padStart(2, '0');
  const annee = date.getUTCFullYear();
  return `${jour}/${mois}/${annee}`;
}

// Normalise les 3 champs date d'une commande au format "JJ/MM/AAAA"
function normaliserDatesCommande(commande) {
  return {
    ...commande,
    date_debut_production: formatDateFR(commande.date_debut_production),
    date_fin_production: formatDateFR(commande.date_fin_production),
    date_mise_disposition: formatDateFR(commande.date_mise_disposition),
  };
}

// Convertit une date au format "JJ/MM/AAAA" (front) en objet Date JS valide
function parseFrenchDate(dateStr) {
  if (!dateStr) return null;
  const [jour, mois, annee] = dateStr.split('/');
  return new Date(`${annee}-${mois}-${jour}`); // format ISO "AAAA-MM-JJ" compris par Date
}

// Nombre de jours restants entre maintenant et une date donnée (peut être négatif si la date est passée)
function joursRestants(date, currentDate) {
  const msParJour = 1000 * 60 * 60 * 24;
  return (date.getTime() - currentDate.getTime()) / msParJour;
}

// Compare uniquement l'annee/mois/jour, sans tenir compte de l'heure
function isSameDay(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

// Determine le nouveau statut d'une commande selon ses dates.
// Priorite : Jour disposition > Ferme > Alerte > Ouvert / En attente > (pas de changement)
function calculerStatut(commande, currentDate, seuilAlerteJours) {
  const dateMiseDisposition = parseFrenchDate(commande.date_mise_disposition);
  const dateDebutProduction = parseFrenchDate(commande.date_debut_production);

  // 1. Le jour de mise a disposition, c'est aujourd'hui
  if (dateMiseDisposition && isSameDay(dateMiseDisposition, currentDate)) {
    return 'Jour disposition';
  }

  // 2. Deja ferme : date de mise a disposition depassee
  if (dateMiseDisposition && dateMiseDisposition < currentDate) {
    return 'Ferme';
  }

  // 3. Alerte : mise a disposition dans moins de X jours
  if (dateMiseDisposition) {
    const diffJours = joursRestants(dateMiseDisposition, currentDate);
    if (diffJours >= 0 && diffJours <= seuilAlerteJours) {
      return 'Alerte';
    }
  }

  // 4. Ouvert / En attente selon la date de debut de production
  if (dateDebutProduction) {
    if (dateDebutProduction < currentDate) {
      return 'Ouvert';
    }
    if (dateDebutProduction > currentDate) {
      return 'En attente';
    }
  }

  // 5. Aucune regle applicable -> pas de changement
  return null;
}

// Trie les commandes par date_debut_production croissante (plus ancienne en premier)
function trierParDateDebutProductionAsc(commandes) {
  return [...commandes].sort((a, b) => {
    const dateA = parseFrenchDate(a.date_debut_production);
    const dateB = parseFrenchDate(b.date_debut_production);
    if (!dateA || !dateB) return 0;
    return dateA.getTime() - dateB.getTime();
  });
}

// Function to get all commandes
export async function getAllCommandes(req, res) {
  try {
    const [commandesBrutes] = await db.promise().query('SELECT * FROM commandes');

    if (commandesBrutes.length === 0) {
      return res.status(404).json({ message: 'commandes not found' });
    }

    // On normalise d'abord toutes les dates au format "JJ/MM/AAAA",
    // quel que soit le format renvoye par MySQL (objet Date, string ISO, etc.)
    const commandes = commandesBrutes.map(normaliserDatesCommande);

    // Regles de mise a jour automatique du statut :
    // - date_mise_disposition == aujourd'hui         -> "Jour disposition"
    // - date_mise_disposition deja passee           -> "Ferme"
    // - date_mise_disposition dans moins de 2 jours  -> "Alerte"
    // - date_debut_production < aujourd'hui          -> "Ouvert"
    // - date_debut_production > aujourd'hui          -> "En attente"
    const currentDate = new Date();
    const SEUIL_ALERTE_JOURS = 2;

    for (const commande of commandes) {
      const nouveauStatut = calculerStatut(commande, currentDate, SEUIL_ALERTE_JOURS);

      if (nouveauStatut && nouveauStatut !== commande.statut) {
        await db.promise().query('UPDATE commandes SET statut = ? WHERE id = ?', [nouveauStatut, commande.id]);
        commande.statut = nouveauStatut;
      }
    }

    // Tri par date_debut_production croissante avant de renvoyer les donnees
    const commandesTriees = trierParDateDebutProductionAsc(commandes);

    return res.status(200).json({
      success: true,
      status: 200,
      message: 'commandes returned successfully',
      data: commandesTriees,
    });
  } catch (error) {
    console.error('Error returned commandes:', error);
    res.status(500).json({ message: 'Error returned commandes' });
  }
}