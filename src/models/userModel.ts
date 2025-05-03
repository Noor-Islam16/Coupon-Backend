import { pool } from "../config/db";
import bcrypt from "bcrypt";

export interface User {
  id: number;
  email: string;
  phone: string;
  password: string;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserInput {
  email: string;
  phone: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
  remember_me?: boolean;
}

class UserModel {
  // Create a new user
  async createUser(userData: UserInput): Promise<User | null> {
    try {
      // Hash the password before storing
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

      const result = await pool.query(
        "INSERT INTO users (email, phone, password) VALUES ($1, $2, $3) RETURNING *",
        [userData.email, userData.phone, hashedPassword]
      );

      return result.rows[0];
    } catch (error) {
      console.error("Error creating user:", error);
      return null;
    }
  }

  // Find user by email
  async findByEmail(email: string): Promise<User | null> {
    try {
      const result = await pool.query("SELECT * FROM users WHERE email = $1", [
        email,
      ]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("Error finding user by email:", error);
      return null;
    }
  }

  // Find user by phone
  async findByPhone(phone: string): Promise<User | null> {
    try {
      const result = await pool.query("SELECT * FROM users WHERE phone = $1", [
        phone,
      ]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("Error finding user by phone:", error);
      return null;
    }
  }

  // Find user by ID
  async findById(id: number): Promise<User | null> {
    try {
      const result = await pool.query("SELECT * FROM users WHERE id = $1", [
        id,
      ]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("Error finding user by ID:", error);
      return null;
    }
  }

  // Update user verification status
  async updateVerificationStatus(
    id: number,
    status: boolean
  ): Promise<boolean> {
    try {
      await pool.query(
        "UPDATE users SET is_verified = $1, updated_at = NOW() WHERE id = $2",
        [status, id]
      );
      return true;
    } catch (error) {
      console.error("Error updating user verification status:", error);
      return false;
    }
  }

  // Verify password
  async verifyPassword(
    plainPassword: string,
    hashedPassword: string
  ): Promise<boolean> {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error("Error verifying password:", error);
      return false;
    }
  }
}

export default new UserModel();
