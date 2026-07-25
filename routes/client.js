import express from 'express'; 
import { createClient } from '../client/create';
import { deleteClient } from '../client/delete';
import { getAllClient } from '../client/getAll';
import { getOneClient } from '../client/getOne';

const router = express.Router(); 

// Define the routes
router.post('/createClient', authenticateToken, createCommande); 
router.delete('/deleteClient/:id', authenticateToken, deleteCommande);
router.get('/getOneClient/:id', getOneCommande);
router.get('/getAllClient', getAllCommandes);


export default router; 