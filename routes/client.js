import express from 'express'; 
import { createClient } from '../client/create.js';
import { deleteClient } from '../client/delete.js';
import { getAllClient } from '../client/getAll.js';
import { getOneClient } from '../client/getOne.js';

const router = express.Router(); 

// Define the routes
router.post('/createClient', authenticateToken, createClient); 
router.delete('/deleteClient/:id', authenticateToken, deleteClient);
router.get('/getOneClient/:id', getOneClient);
router.get('/getAllClient', getAllClient);


export default router; 