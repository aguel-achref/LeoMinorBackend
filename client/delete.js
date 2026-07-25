import { db } from '../app.js';

/**
 * Parse le champ "models" stocké en JSON en base vers un tableau JS.
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

// Function to delete a client
export async function deleteClient(req, res) {
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

    // Check the client exists before deleting
    const [existing] = await db.promise().query(
      'SELECT * FROM clients WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found.'
      });
    }

    const [result] = await db.promise().query(
      'DELETE FROM clients WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete the client.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Client deleted successfully.',
      data: { ...existing[0], models: parseModels(existing[0].models) }
    });

  } catch (error) {
    console.error('Error deleting client:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the client.',
      error: error.message
    });
  }
}