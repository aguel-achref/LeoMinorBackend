import { db } from '../app.js';
import { v4 as uuidv4 } from 'uuid';

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

// Function to create a client
export async function createClient(req, res) {
  const { nom, models } = req.body;

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
    // Validate required fields
    if (!nom || !nom.trim()) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: nom.'
      });
    }

    // Le nom du client est toujours stocké en majuscules, et on retire
    // les espaces superflus au debut/fin pour eviter les doublons du type
    // "Client A" / " client a ".
    const nomMajuscule = nom.trim().toUpperCase();

    // Verification qu'un client avec ce nom n'existe pas deja (insensible a
    // la casse, au cas ou d'anciens clients auraient ete crees avant ce
    // changement et ne soient pas encore en majuscules).
    const [existingClients] = await db.promise().query(
      'SELECT id FROM clients WHERE UPPER(nom) = ?',
      [nomMajuscule]
    );

    if (existingClients.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Un client avec le nom "${nomMajuscule}" existe déjà.`
      });
    }

    // models est optionnel : tableau de chaines libres saisies par l'utilisateur
    // (tags/chips). On s'assure que c'est bien un tableau avant de le stocker.
    const modelsArray = Array.isArray(models) ? models : [];

    // Insert the client
    const [result] = await db.promise().query(
      `INSERT INTO clients (id, user_id, nom, models) VALUES (?, ?, ?, ?)`,
      [id, userId, nomMajuscule, JSON.stringify(modelsArray)]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create the client.'
      });
    }

    // Retrieve the created client
    const [clientData] = await db.promise().query(
      'SELECT * FROM clients WHERE id = ?',
      [id]
    );

    const client = clientData[0];
    client.models = parseModels(client.models);

    return res.status(201).json({
      success: true,
      message: 'Client created successfully.',
      data: client
    });

  } catch (error) {
    console.error('Error creating client:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating the client.',
      error: error.message
    });
  }
}