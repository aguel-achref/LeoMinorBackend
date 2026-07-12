import { db } from '../app.js';

// Function to delete a user
export async function getAllByAdmin(req, res) {

  try {
    userId = req.user.id;
    const [commandes] = await db.promise().query('SELECT * FROM commandes where user_id = ?', [userId]);
    if (commandes.length === 0) {
      return res.status(404).json({ message: 'commandes not found' });
    }
    // Return success response
    return res.status(200).json({
      success: true,
      status: 200,
      message: 'commandes returned successfully',
      data: commandes,
    });
  } catch (error) {
    // Catch and log any errors
    console.error('Error returned commandes:', error);
    res.status(500).json({ message: 'Error returned commandes' });
  }
}
