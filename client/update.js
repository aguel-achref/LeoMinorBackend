import { db } from '../app.js';

/**
 * Parse le champ "models" stocké en JSON en base vers un tableau JS.
 * Gere le cas ou le driver retourne deja un tableau parse, une chaine JSON,
 * ou une valeur nulle/invalide (retourne alors un tableau vide).
 */
function parseModels(models) {
  if (Array.isArray(models)) {
    return models;
  }

  if (typeof models === 'string') {
    try {
      const parsed = JSON.parse(models);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Modifier un client
 *
 * PUT /api/clients/updateClient/:id
 *
 * Body:
 * {
 *   "nom": "CLIENT A",
 *   "models": ["MODEL 1", "MODEL 2"]
 * }
 */
export async function updateClient(req, res) {
  const { id } = req.params;
  const { nom, models } = req.body;
  const userId = req.user?.id;

  // Check authentication
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  try {
    // Vérification de l'id
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Client id is required.'
      });
    }

    // Vérification du nom
    if (!nom || !nom.trim()) {
      return res.status(400).json({
        success: false,
        message: 'The client name is required.'
      });
    }

    // Le nom du client est toujours stocké en majuscules
    // et les espaces inutiles sont supprimés.
    const nomMajuscule = nom.trim().toUpperCase();

    // models est optionnel.
    // Si ce n'est pas un tableau, on utilise un tableau vide.
    const modelsArray = Array.isArray(models) ? models : [];

    // Vérifier que le client existe
    // On vérifie également le user_id pour éviter qu'un utilisateur
    // puisse modifier le client d'un autre utilisateur.
    const [existingClient] = await db.promise().query(
      'SELECT * FROM clients WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (existingClient.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found.'
      });
    }

    // Vérifier qu'un autre client n'utilise pas déjà ce nom.
    // La comparaison est insensible à la casse.
    const [duplicateClients] = await db.promise().query(
      `
        SELECT id
        FROM clients
        WHERE UPPER(nom) = ?
          AND id != ?
          AND user_id = ?
      `,
      [nomMajuscule, id, userId]
    );

    if (duplicateClients.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Un client avec le nom "${nomMajuscule}" existe déjà.`
      });
    }

    // Mise à jour du client
    const [result] = await db.promise().query(
      `
        UPDATE clients
        SET nom = ?, models = ?
        WHERE id = ? AND user_id = ?
      `,
      [
        nomMajuscule,
        JSON.stringify(modelsArray),
        id,
        userId
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found or not updated.'
      });
    }

    // Récupérer le client après modification
    const [clientData] = await db.promise().query(
      'SELECT * FROM clients WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (clientData.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found after update.'
      });
    }

    const client = clientData[0];

    // Transformer models JSON -> tableau JS
    client.models = parseModels(client.models);

    return res.status(200).json({
      success: true,
      message: 'Client updated successfully.',
      data: client
    });

  } catch (error) {
    console.error('Error updating client:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the client.',
      error: error.message
    });
  }
}