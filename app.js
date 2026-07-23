import express from 'express'; 
import path from 'path'; 
import morgan from 'morgan'; 
import dotenv from 'dotenv'; 
import mysql from 'mysql2'; 
import userRoutes from './routes/authentication.js'; 
import commandeRoutes from './routes/commande.js';
import cors from "cors";


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json()); 

// Get the current directory using import.meta.url
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Middleware
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));  // Now you can safely use __dirname here

// Use the user routes for user-related API endpoints
app.use('/api/users', userRoutes);
app.use('/api/commandes', commandeRoutes);

// Create MySQL connection
export const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err.message);
  } else {
    console.log('Connected to MySQL database');
  }
});

// Define the base route
app.get('/', (req, res) => {
  res.send('Welcome to the Node.js App with MySQL!');
});

// Catch-all route for undefined routes
app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Set the port
const PORT = process.env.PORT || 8080;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
