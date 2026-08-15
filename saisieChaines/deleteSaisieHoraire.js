import { db } from '../app.js';

// Function to delete a single creneau
export async function deleteSaisieHoraire(req, res) {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  const { id } = req.params;

  try {
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: id.'
      });
    }

    const [result] = await db.promise().query(
      'DELETE FROM saisie_horaire WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Créneau introuvable.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Créneau supprimé avec succès.'
    });

  } catch (error) {
    console.error('Error deleting saisie horaire:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the creneau.',
      error: error.message
    });
  }
}