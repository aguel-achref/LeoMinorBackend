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

// Function to get all clients
export async function getAllClients(req, res) {
  const userId = req.user?.id;

  // Check authentication
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  try {
    const [clients] = await db.promise().query(
      'SELECT * FROM clients ORDER BY nom ASC'
    );

    const clientsWithModels = clients.map((client) => ({
      ...client,
      models: parseModels(client.models)
    }));

    return res.status(200).json({
      success: true,
      message: 'Clients retrieved successfully.',
      data: clientsWithModels
    });

  } catch (error) {
    console.error('Error retrieving clients:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the clients.',
      error: error.message
    });
  }
}