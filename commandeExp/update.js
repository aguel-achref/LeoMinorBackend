import { db } from '../app.js';

// Function to delete a user
export async function updateCommande(req, res) {

  try {
    const { name , agency_name, disponibility, price_per_day, description, localisation, color, seats, gearbox, brand, price_under_two_month, price_more_two_month, price_more_six_month  } = req.body;
    const id = req.params.id;
    //edit command
    const [UpdateCommande] = await db.promise().query('UPDATE commandes SET name = ?, agency_name = ?, disponibility = ?, price_per_day = ?, description = ?, localisation = ?, color = ?, seats = ?, gearbox = ?, brand = ?, price_under_two_month = ?, price_more_two_month = ?, price_more_six_month = ? WHERE id = ?', [name, agency_name, disponibility, price_per_day, description, localisation, color, seats, gearbox, brand, price_under_two_month, price_more_two_month, price_more_six_month, id]);
   
    if (UpdateCommande.affectedRows === 0) {
      return res.status(404).json({ message: 'Commande not found' });
    }
   
    //get commande updated
    const [commande] = await db.promise().query('SELECT * FROM commandes WHERE id = ?', [id]);
    
   
    // Return success response
    return res.status(200).json({
      success: true,
      status: 200,
      message: 'commande updated successfully',
      data: commande,
    });
  } catch (error) {
    // Catch and log any errors
    console.error('Error updating commande:', error);
    res.status(500).json({ message: 'Error updating commande' });
  }
}
