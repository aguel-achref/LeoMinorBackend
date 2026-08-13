import { db } from "../app.js";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export async function createUser(req, res) {
  const { first_name, last_name, email, password, status } = req.body;
  const id = uuidv4();

  try {
    // Validation
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: "First name and last name are required",
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const validStatuses = ["ADMIN", "USER"];
    const userStatus =
      status && validStatuses.includes(status.toUpperCase())
        ? status.toUpperCase()
        : "USER";

    // Check if email already exists
    const [existingUser] = await db
      .promise()
      .query("SELECT id FROM users WHERE email = ?", [email]);

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    await db.promise().query(
      `INSERT INTO users (id, first_name, last_name, email, password, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, first_name, last_name, email, hashedPassword, userStatus]
    );

    // Get inserted user
    const [rows] = await db
      .promise()
      .query("SELECT * FROM users WHERE id = ?", [id]);

    const user = rows[0];

    // Send email (does NOT affect API response)
    transporter
      .sendMail({
        from: `"Rent Car" <${process.env.EMAIL}>`,
        to: email,
        subject: "Welcome to Rent Car",
        html: `
          <h2>Welcome ${first_name}!</h2>
          <p>Your account has been successfully created.</p>
          <p>Thank you for joining Rent Car.</p>
        `,
      })
      .then(() => console.log("Email sent successfully"))
      .catch((err) =>
        console.error("Email could not be sent:", err.message)
      );

    // Success response
    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: user,
    });
  } catch (error) {
    console.error("Create User Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error creating user",
    });
  }
}