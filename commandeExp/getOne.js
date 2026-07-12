import { db } from '../app.js';

// Function to delete a user
export async function getOneCommande(req, res) {

    const id = req.params.id;
  try {

   //get All users
    const [commande] = await db.promise().query('SELECT * FROM commandes where id = ?', [id]);
    if (commande.length === 0) {
      return res.status(404).json({ message: 'commande not found' });
    }
    // Return success response
    return res.status(200).json({
      success: true,
      status: 200,
      message: 'commande returned successfully',
      data: commande,
    });
  } catch (error) {
    // Catch and log any errors
    console.error('Error returned commande:', error);
    res.status(500).json({ message: 'Error returned commande' });
  }
}
