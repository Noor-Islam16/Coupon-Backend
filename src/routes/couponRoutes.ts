// routes/couponRoutes.ts
import express, { Request, Response } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { pool, Coupon } from "../config/db";
import { QueryResult } from "pg";
import cron from "node-cron";

const router = express.Router();

// Debug: Check if environment variables are loaded
console.log("Environment check:");
console.log(
  "CLOUDINARY_CLOUD_NAME:",
  process.env.CLOUDINARY_CLOUD_NAME ? "Set" : "NOT SET"
);
console.log(
  "CLOUDINARY_API_KEY:",
  process.env.CLOUDINARY_API_KEY ? "Set" : "NOT SET"
);
console.log(
  "CLOUDINARY_API_SECRET:",
  process.env.CLOUDINARY_API_SECRET ? "Set" : "NOT SET"
);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify Cloudinary configuration
console.log("Cloudinary config check:", {
  cloud_name: cloudinary.config().cloud_name ? "Set" : "NOT SET",
  api_key: cloudinary.config().api_key ? "Set" : "NOT SET",
  api_secret: cloudinary.config().api_secret ? "Set" : "NOT SET",
});

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "coupons",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [
      { width: 800, height: 600, crop: "limit" },
      { quality: "auto" },
    ],
    public_id: (req: Request, file: Express.Multer.File) => {
      const couponId = req.body.couponId || "coupon";
      const timestamp = Date.now();
      return `${couponId}_${timestamp}`;
    },
  } as any,
});

// Configure multer with Cloudinary storage
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
    }
  },
});

// Interface for coupon creation request
interface CreateCouponRequest {
  brandName: string;
  couponId: string;
  bogo?: string;
  discount?: string;
  audience: string;
  duration: string;
}

// Extended Coupon interface to include image_url and expiration
interface CouponWithImage extends Coupon {
  image_url?: string;
  image_public_id?: string;
  expires_at?: Date;
  is_expired?: boolean;
  expired_at?: Date; // When it was marked as expired
}

// Helper function to parse duration and calculate expiration date
const calculateExpirationDate = (duration: string): Date => {
  const now = new Date();
  const durationMatch = duration.match(
    /(\d+)hrs?\s*(\d+)min?|(\d+)hrs?|(\d+)min?/i
  );

  let totalMinutes = 0;

  if (durationMatch) {
    if (durationMatch[1] && durationMatch[2]) {
      // Format: "2hrs 30min"
      totalMinutes =
        parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
    } else if (durationMatch[3]) {
      // Format: "2hrs"
      totalMinutes = parseInt(durationMatch[3]) * 60;
    } else if (durationMatch[4]) {
      // Format: "30min"
      totalMinutes = parseInt(durationMatch[4]);
    }
  }

  const expirationDate = new Date(now.getTime() + totalMinutes * 60000);
  return expirationDate;
};

// Helper function to delete image from Cloudinary
const deleteCloudinaryImage = async (publicId: string): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId);
    console.log(`Deleted image with public_id: ${publicId}`);
  } catch (error) {
    console.error(`Error deleting image from Cloudinary:`, error);
  }
};

// Function to mark expired coupons (instead of deleting them)
const markExpiredCoupons = async (): Promise<void> => {
  try {
    console.log("Checking for expired coupons to mark...");

    // Mark coupons as expired that have passed their expiration time but aren't marked yet
    const result: QueryResult = await pool.query(
      `UPDATE coupons 
       SET is_expired = true, expired_at = NOW()
       WHERE expires_at <= NOW() AND (is_expired = false OR is_expired IS NULL)
       RETURNING coupon_id, brand_name`
    );

    if (result.rows.length > 0) {
      console.log(`Marked ${result.rows.length} coupons as expired:`);
      result.rows.forEach((row) => {
        console.log(`- ${row.coupon_id} (${row.brand_name})`);
      });
    } else {
      console.log("No new coupons to mark as expired.");
    }
  } catch (error) {
    console.error("Error marking expired coupons:", error);
  }
};

// Function to permanently delete old expired coupons (optional - after certain time)
const cleanupOldExpiredCoupons = async (daysOld: number = 7): Promise<void> => {
  try {
    console.log(`Cleaning up expired coupons older than ${daysOld} days...`);

    // Get expired coupons older than specified days
    const expiredCouponsResult: QueryResult<CouponWithImage> = await pool.query(
      `SELECT * FROM coupons 
       WHERE is_expired = true 
       AND expired_at <= NOW() - INTERVAL '${daysOld} days'`
    );

    const expiredCoupons = expiredCouponsResult.rows;

    if (expiredCoupons.length === 0) {
      console.log(`No expired coupons older than ${daysOld} days found.`);
      return;
    }

    console.log(
      `Found ${expiredCoupons.length} old expired coupons to delete.`
    );

    // Delete images from Cloudinary and coupons from database
    for (const coupon of expiredCoupons) {
      try {
        // Delete image from Cloudinary if it exists
        if (coupon.image_public_id) {
          await deleteCloudinaryImage(coupon.image_public_id);
        }

        // Delete coupon from database
        await pool.query("DELETE FROM coupons WHERE coupon_id = $1", [
          coupon.coupon_id,
        ]);
        console.log(`Permanently deleted old coupon: ${coupon.coupon_id}`);
      } catch (error) {
        console.error(`Error deleting old coupon ${coupon.coupon_id}:`, error);
      }
    }

    console.log(
      `Cleanup completed. Removed ${expiredCoupons.length} old expired coupons.`
    );
  } catch (error) {
    console.error("Error during old expired coupons cleanup:", error);
  }
};

// Schedule to mark expired coupons every minute
cron.schedule("* * * * *", markExpiredCoupons);

// Schedule to clean up old expired coupons daily at 2 AM
cron.schedule("0 2 * * *", () => {
  cleanupOldExpiredCoupons(7); // Delete expired coupons after 7 days
});

console.log("Automatic coupon expiration marking scheduled.");

// GET all active coupons (excluding expired ones)
router.get("/", async (_req: Request, res: Response) => {
  try {
    // First, mark any expired coupons
    await markExpiredCoupons();

    const result: QueryResult<CouponWithImage> = await pool.query(
      `SELECT *, 
       CASE WHEN expires_at <= NOW() THEN true ELSE false END as is_expired,
       EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
       FROM coupons 
       WHERE (is_expired = false OR is_expired IS NULL) AND expires_at > NOW()
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching coupons:", err);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// GET all coupons including expired ones (for admin purposes)
router.get("/all", async (_req: Request, res: Response) => {
  try {
    // First, mark any expired coupons
    await markExpiredCoupons();

    const result: QueryResult<CouponWithImage> = await pool.query(
      `SELECT *, 
       CASE WHEN expires_at <= NOW() THEN true ELSE false END as is_expired,
       EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
       FROM coupons 
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching all coupons:", err);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// GET coupon counts
router.get("/stats/counts", async (_req: Request, res: Response) => {
  try {
    // First, mark any expired coupons
    await markExpiredCoupons();

    const result: QueryResult = await pool.query(
      `SELECT 
        COUNT(*) as total_coupons,
        COUNT(CASE WHEN (is_expired = false OR is_expired IS NULL) AND expires_at > NOW() THEN 1 END) as active_coupons,
        COUNT(CASE WHEN is_expired = true OR expires_at <= NOW() THEN 1 END) as expired_coupons
       FROM coupons`
    );

    res.json({
      total: parseInt(result.rows[0].total_coupons),
      active: parseInt(result.rows[0].active_coupons),
      expired: parseInt(result.rows[0].expired_coupons),
    });
  } catch (err) {
    console.error("Error fetching coupon counts:", err);
    res.status(500).json({ error: "Failed to fetch coupon counts" });
  }
});

// POST create a new coupon with expiration
router.post(
  "/",
  upload.single("image"),
  async (req: Request<{}, {}, CreateCouponRequest>, res: Response) => {
    const { brandName, couponId, bogo, discount, audience, duration } =
      req.body;
    const uploadedFile = req.file as Express.Multer.File & {
      path: string;
      filename: string;
    };

    // Basic validation
    if (!brandName || !couponId || !audience || !duration) {
      if (uploadedFile && uploadedFile.filename) {
        await deleteCloudinaryImage(uploadedFile.filename);
      }
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Calculate expiration date
      const expiresAt = calculateExpirationDate(duration);

      // Get image URL and public_id from Cloudinary upload
      const imageUrl = uploadedFile ? uploadedFile.path : null;
      const imagePublicId = uploadedFile ? uploadedFile.filename : null;

      const result: QueryResult<CouponWithImage> = await pool.query(
        `INSERT INTO coupons 
        (brand_name, coupon_id, bogo, discount, audience, duration, image_url, image_public_id, expires_at, is_expired) 
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, false) 
       RETURNING *, 
       CASE WHEN expires_at <= NOW() THEN true ELSE false END as is_expired,
       EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining`,
        [
          brandName,
          couponId,
          bogo || null,
          discount || null,
          audience,
          duration,
          imageUrl,
          imagePublicId,
          expiresAt,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      console.error("Error creating coupon:", err);

      if (uploadedFile && uploadedFile.filename) {
        await deleteCloudinaryImage(uploadedFile.filename);
      }

      if (err.code === "23505") {
        return res.status(400).json({ error: "Coupon ID already exists" });
      }

      res.status(500).json({ error: "Failed to create coupon" });
    }
  }
);

// PUT update a coupon (including image and expiration)
router.put(
  "/:id",
  upload.single("image"),
  async (
    req: Request<{ id: string }, {}, CreateCouponRequest>,
    res: Response
  ) => {
    const couponId = req.params.id;
    const { brandName, bogo, discount, audience, duration } = req.body;
    const uploadedFile = req.file as Express.Multer.File & {
      path: string;
      filename: string;
    };

    try {
      const existingResult: QueryResult<CouponWithImage> = await pool.query(
        "SELECT * FROM coupons WHERE coupon_id = $1",
        [couponId]
      );

      if (existingResult.rows.length === 0) {
        if (uploadedFile && uploadedFile.filename) {
          await deleteCloudinaryImage(uploadedFile.filename);
        }
        return res.status(404).json({ error: "Coupon not found" });
      }

      const existingCoupon = existingResult.rows[0];
      let imageUrl = existingCoupon.image_url;
      let imagePublicId = existingCoupon.image_public_id;

      // Handle new image upload
      if (uploadedFile) {
        if (existingCoupon.image_public_id) {
          await deleteCloudinaryImage(existingCoupon.image_public_id);
        }
        imageUrl = uploadedFile.path;
        imagePublicId = uploadedFile.filename;
      }

      // Calculate new expiration date if duration is updated
      let expiresAt = existingCoupon.expires_at;
      let isExpired = existingCoupon.is_expired;
      if (duration && duration !== existingCoupon.duration) {
        expiresAt = calculateExpirationDate(duration);
        // Reset expiration status if new duration extends the coupon
        isExpired = false;
      }

      const result: QueryResult<CouponWithImage> = await pool.query(
        `UPDATE coupons 
         SET brand_name = $1, bogo = $2, discount = $3, audience = $4, duration = $5, 
             image_url = $6, image_public_id = $7, expires_at = $8, is_expired = $9, updated_at = CURRENT_TIMESTAMP
         WHERE coupon_id = $10 
         RETURNING *,
         CASE WHEN expires_at <= NOW() THEN true ELSE false END as is_expired,
         EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining`,
        [
          brandName || existingCoupon.brand_name,
          bogo || existingCoupon.bogo,
          discount || existingCoupon.discount,
          audience || existingCoupon.audience,
          duration || existingCoupon.duration,
          imageUrl,
          imagePublicId,
          expiresAt,
          isExpired,
          couponId,
        ]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating coupon:", err);

      if (uploadedFile && uploadedFile.filename) {
        await deleteCloudinaryImage(uploadedFile.filename);
      }

      res.status(500).json({ error: "Failed to update coupon" });
    }
  }
);

// DELETE a coupon
router.delete("/:id", async (req: Request<{ id: string }>, res: Response) => {
  const couponId = req.params.id;

  try {
    const result: QueryResult<CouponWithImage> = await pool.query(
      "DELETE FROM coupons WHERE coupon_id = $1 RETURNING *",
      [couponId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    const deletedCoupon = result.rows[0];

    if (deletedCoupon.image_public_id) {
      await deleteCloudinaryImage(deletedCoupon.image_public_id);
    }

    res.json({
      message: "Coupon deleted successfully",
      coupon: deletedCoupon,
    });
  } catch (err) {
    console.error("Error deleting coupon:", err);
    res.status(500).json({ error: "Failed to delete coupon" });
  }
});

// GET coupon by ID
router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  const couponId = req.params.id;

  try {
    const result: QueryResult<CouponWithImage> = await pool.query(
      `SELECT *, 
       CASE WHEN expires_at <= NOW() THEN true ELSE false END as is_expired,
       EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
       FROM coupons 
       WHERE coupon_id = $1`,
      [couponId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    const coupon = result.rows[0];

    // Mark as expired if it has expired but not marked yet
    // Add null check for expires_at
    if (
      coupon.expires_at &&
      coupon.expires_at <= new Date() &&
      !coupon.is_expired
    ) {
      await pool.query(
        "UPDATE coupons SET is_expired = true, expired_at = NOW() WHERE coupon_id = $1",
        [couponId]
      );
      coupon.is_expired = true;
    }

    res.json(coupon);
  } catch (err) {
    console.error("Error fetching coupon:", err);
    res.status(500).json({ error: "Failed to fetch coupon" });
  }
});

// Manual cleanup endpoint for marking expired coupons
router.post("/mark-expired", async (_req: Request, res: Response) => {
  try {
    await markExpiredCoupons();
    res.json({ message: "Expired coupons marked successfully" });
  } catch (err) {
    console.error("Error during manual mark expired:", err);
    res.status(500).json({ error: "Failed to mark expired coupons" });
  }
});

// Manual cleanup endpoint for deleting old expired coupons
router.post("/cleanup-old-expired", async (req: Request, res: Response) => {
  try {
    const daysOld = req.body.daysOld || 7;
    await cleanupOldExpiredCoupons(daysOld);
    res.json({
      message: `Old expired coupons cleanup completed successfully (${daysOld} days old)`,
    });
  } catch (err) {
    console.error("Error during manual cleanup:", err);
    res.status(500).json({ error: "Failed to cleanup old expired coupons" });
  }
});

export default router;
