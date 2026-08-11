import express from 'express'; 
import { authenticateToken } from '../utils/middlewares/auth.js';
import { getDashboardSummary } from '../dashboard/getDashboard.js';
const router = express.Router();


// Define the routes
router.get('/summary', authenticateToken, getDashboardSummary);

export default router; 