import express from 'express'; 
import { getSaisieHoraire } from '../saisieChaines/getSaisieHoraire.js';
import { saveSaisieHoraire } from '../saisieChaines/saveSaisieHoraire.js';
import { deleteSaisieHoraire } from '../saisieChaines/deleteSaisieHoraire.js';

import { authenticateToken } from '../utils/middlewares/auth.js';

const router = express.Router(); 

// Define the routes
router.get('/getSaisieHoraire', authenticateToken, getSaisieHoraire);
router.post('/saveSaisieHoraire', authenticateToken, saveSaisieHoraire);
router.delete('/deleteSaisieHoraire/:id', authenticateToken, deleteSaisieHoraire);

export default router; 