import { db } from '../app.js';
import { v4 as uuidv4 } from 'uuid';

// Function to create a commande
export async function createCommande(req, res) {
  const {
    chaine,
    statut,
    commande,
    description,
    date_debut_production,
    date_fin_production,
    date_mise_disposition,
    nombre_jours,
    ecart,
    objectif,
    qté_commandé,
    code_commande
  } = req.body;

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
    if (
      !chaine ||
      !statut ||
      !commande ||
      !qté_commandé ||
      !description ||
      !date_debut_production ||
      !date_fin_production ||
      !date_mise_disposition ||
      nombre_jours === undefined ||
      ecart === undefined ||
      objectif === undefined ||
      !code_commande
    ) {
      return res.status(400).json({
        success: false,
        message:
          'All fields are required: chaine, statut, commande, qté_commandé, description, date_debut_production, date_fin_production, date_mise_disposition, nombre_jours, ecart, objectif, code_commande.'
      });
    }

    // Insert the commande
    const [result] = await db.promise().query(
      `INSERT INTO commandes (
        id,
        user_id,
        chaine,
        statut,
        commande,
        qté_commandé,
        description,
        date_debut_production,
        date_fin_production,
        date_mise_disposition,
        nombre_jours,
        ecart,
        objectif,
        code_commande
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        chaine,
        statut,
        commande,
        qté_commandé,
        description,
        date_debut_production,
        date_fin_production,
        date_mise_disposition,
        nombre_jours,
        ecart,
        objectif,
        code_commande
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create the commande.'
      });
    }

    // Retrieve the created commande
    const [commandeData] = await db.promise().query(
      'SELECT * FROM commandes WHERE id = ?',
      [id]
    );

    return res.status(201).json({
      success: true,
      message: 'Commande created successfully.',
      data: commandeData[0]
    });

  } catch (error) {
    console.error('Error creating commande:', error);

    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating the commande.',
      error: error.message
    });
  }
}