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

// Function to get one client by id
export async function getOneClient(req, res) {
  const { id } = req.params;
  const userId = req.user?.id;

  // Check authentication
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  try {
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Client id is required.'
      });
    }

    const [clientData] = await db.promise().query(
      'SELECT * FROM clients WHERE id = ?',
      [id]
    );

    if (clientData.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found.'
      });
    }

    const client = clientData[0];
    client.models = parseModels(client.models);

    return res.status(200).json({
      success: true,
      message: 'Client retrieved successfully.',
      data: client
    });

  } catch (error) {
    console.error('Error retrieving client:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the client.',
      error: error.message
    });
  }
}