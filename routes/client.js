import express from 'express'; 
import { createClient } from '../client/create';
import { deleteClient } from '../client/delete';
import { getAllClient } from '../client/getAll';
import { getOneClient } from '../client/getOne';

const router = express.Router(); 

// Define the routes
router.post('/createClient', authenticateToken, createClient); 
router.delete('/deleteClient/:id', authenticateToken, deleteClient);
router.get('/getOneClient/:id', getOneClient);
router.get('/getAllClient', getAllClient);


export default router; 