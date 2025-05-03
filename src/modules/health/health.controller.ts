import { Request, Response } from "express";
import { pool } from "../../config/db";

class HealthController {
  public async checkHealth(_req: Request, res: Response): Promise<void> {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({
        status: "OK",
        database: "connected",
      });
    } catch (err) {
      res.status(500).json({
        status: "ERROR",
        database: "disconnected",
      });
    }
  }
}

const healthController = new HealthController();
export default healthController;
