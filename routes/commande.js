import express from 'express'; 
import { createCommande } from '../commandeExp/create.js';
import { deleteCommande } from '../commandeExp/delete.js';
import { updateCommande } from '../commandeExp/update.js';
import { getOneCommande } from '../commandeExp/getOne.js';
import { getAllCommandes } from '../commandeExp/getAll.js';
import { authenticateToken } from '../utils/middlewares/auth.js';
import { searchCommande } from '../search/searchCommande.js';
import { getAllByAdmin } from '../commandeExp/getAllByAdmin.js';
import { exportCommandes } from '../commandeExp/export.js';
import { importCommandes } from '../commandeExp/import.js';

const router = express.Router(); 

// Define the routes
router.post('/createCommande', authenticateToken, createCommande); 
router.put('/updateCommande/:id', authenticateToken, updateCommande); 
router.delete('/deleteCommande/:id', authenticateToken, deleteCommande);
router.get('/getOneCommande/:id', getOneCommande);
router.get('/getAllCommandes', getAllCommandes);
router.post('/searchCommande', searchCommande);
router.get('/getAllByAdmin', authenticateToken, getAllByAdmin);
router.get('/exportCommandes', authenticateToken, exportCommandes);
router.post('/importCommandes', authMiddleware, upload.single('file'), importCommandes);




export default router; 
