// routes/couponRoutes.ts
import express, { Request, Response } from "express";
import { pool, Coupon } from "../config/db";
import { QueryResult } from "pg";

const router = express.Router();

// Interface for coupon creation request
interface CreateCouponRequest {
  brandName: string;
  couponId: string;
  bogo?: string;
  discount?: string;
  audience: string;
  duration: string;
}

// GET all coupons
router.get("/", async (_req: Request, res: Response) => {
  try {
    const result: QueryResult<Coupon> = await pool.query(
      "SELECT * FROM coupons ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching coupons:", err);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// POST create a new coupon
router.post(
  "/",
  async (req: Request<{}, {}, CreateCouponRequest>, res: Response) => {
    const { brandName, couponId, bogo, discount, audience, duration } =
      req.body;

    // Basic validation
    if (!brandName || !couponId || !audience || !duration) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const result: QueryResult<Coupon> = await pool.query(
        `INSERT INTO coupons 
        (brand_name, coupon_id, bogo, discount, audience, duration) 
       VALUES 
        ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
        [
          brandName,
          couponId,
          bogo || null,
          discount || null,
          audience,
          duration,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      console.error("Error creating coupon:", err);

      // Check for duplicate coupon ID
      if (err.code === "23505") {
        return res.status(400).json({ error: "Coupon ID already exists" });
      }

      res.status(500).json({ error: "Failed to create coupon" });
    }
  }
);

// DELETE a coupon
router.delete("/:id", async (req: Request<{ id: string }>, res: Response) => {
  const couponId = req.params.id;

  try {
    const result: QueryResult<Coupon> = await pool.query(
      "DELETE FROM coupons WHERE coupon_id = $1 RETURNING *",
      [couponId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    res.json({
      message: "Coupon deleted successfully",
      coupon: result.rows[0],
    });
  } catch (err) {
    console.error("Error deleting coupon:", err);
    res.status(500).json({ error: "Failed to delete coupon" });
  }
});

export default router;
