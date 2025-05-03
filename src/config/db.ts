import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false, // ✅ important for Render
  },
});

// Interface for Coupon type
export interface Coupon {
  id?: number;
  brand_name: string;
  coupon_id: string;
  bogo?: string;
  discount?: string;
  audience: string;
  duration: string;
  created_at?: Date;
}

// Test connection
pool
  .connect()
  .then((client) => {
    console.log("✅ PostgreSQL connected successfully!");
    client.release();
  })
  .catch((err) => {
    console.error("❌ PostgreSQL connection error:", err);
  });
// Initialize database tables
export const initDb = async (): Promise<void> => {
  try {
    // Create the coupons table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        brand_name VARCHAR(100) NOT NULL,
        coupon_id VARCHAR(50) UNIQUE NOT NULL,
        bogo VARCHAR(100),
        discount VARCHAR(50),
        audience VARCHAR(50) NOT NULL,
        duration VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create OTP table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        otp VARCHAR(6) NOT NULL,
        type VARCHAR(10) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Error initializing database:", err);
    throw err;
  }
};
