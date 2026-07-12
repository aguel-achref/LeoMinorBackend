import { db } from '../app.js';

// Function to delete a user
export async function deleteCommande(req, res) {

  try {
    // Delete the user
    const [deletedCommande] = await db.promise().query('DELETE FROM commandes WHERE id = ?', [req.params.id]);

    if (deletedCommande.affectedRows === 0) {
      return res.status(404).json({ message: 'commandes not found' });
    }
    //get user deleted
    const [commande] = await db.promise().query('SELECT * FROM commandes WHERE id = ?', [req.params.id]);

   
    // Return success response
    return res.status(200).json({
      success: true,
      status: 200,
      message: 'commande deleted successfully',
      data: commande,
    });
  } catch (error) {
    // Catch and log any errors
    console.error('Error deleting commande:', error);
    res.status(500).json({ message: 'Error deleting commande' });
  }
}
