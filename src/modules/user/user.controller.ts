import { Request, Response } from "express";
import { pool } from "../../config/db";

class UserController {
  public async getAllUsers(_req: Request, res: Response): Promise<void> {
    try {
      const result = await pool.query("SELECT * FROM users");
      const users = result.rows;
      res.json(users);
    } catch (err) {
      console.error("Error fetching users:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  public async createUser(req: Request, res: Response): Promise<void> {
    const { name, email, password } = JSON.parse(
      req.body as unknown as string
    ) as { name: string; email: string; password: string };

    try {
      const existingUser = await pool.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );
      if (existingUser.rows.length > 0) {
        res.status(400).json({ error: "User with this email already exists" });
        return;
      }

      const newUser = await pool.query(
        "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email",
        [name, email, password]
      );

      res.status(201).json({
        message: "User created successfully",
        user: newUser.rows[0],
      });
    } catch (err) {
      console.error("Error creating user:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

const userController = new UserController();
export default userController;
