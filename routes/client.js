import express from 'express'; 
import { createClient } from '../client/create.js';
import { deleteClient } from '../client/delete.js';
import { getAllClients } from '../client/getAll.js';
import { getOneClient } from '../client/getOne.js';
import { authenticateToken } from '../utils/middlewares/auth.js';

const router = express.Router(); 

// Define the routes
router.post('/createClient', authenticateToken, createClient); 
router.delete('/deleteClient/:id', authenticateToken, deleteClient);
router.get('/getOneClient/:id', getOneClient);
router.get('/getAllClient', getAllClients);


export default router; 