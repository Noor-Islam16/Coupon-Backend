// routes/couponRoutes.ts
import express, { Request, Response } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { pool, Coupon } from "../config/db";
import { QueryResult } from "pg";

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
    folder: "coupons", // Folder name in Cloudinary
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [
      { width: 800, height: 600, crop: "limit" }, // Resize images
      { quality: "auto" }, // Optimize quality
    ],
    public_id: (req: Request, file: Express.Multer.File) => {
      // Generate unique public_id using couponId and timestamp
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
    fileSize: 10 * 1024 * 1024, // 10MB limit (Cloudinary can handle larger files)
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

// Extended Coupon interface to include image_url
interface CouponWithImage extends Coupon {
  image_url?: string;
  image_public_id?: string; // Store Cloudinary public_id for deletion
}

// Helper function to delete image from Cloudinary
const deleteCloudinaryImage = async (publicId: string): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId);
    console.log(`Deleted image with public_id: ${publicId}`);
  } catch (error) {
    console.error(`Error deleting image from Cloudinary:`, error);
  }
};

// GET all coupons
router.get("/", async (_req: Request, res: Response) => {
  try {
    const result: QueryResult<CouponWithImage> = await pool.query(
      "SELECT * FROM coupons ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching coupons:", err);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// POST create a new coupon with optional image
router.post(
  "/",
  upload.single("image"), // 'image' is the field name for the uploaded file
  async (req: Request<{}, {}, CreateCouponRequest>, res: Response) => {
    const { brandName, couponId, bogo, discount, audience, duration } =
      req.body;
    const uploadedFile = req.file as Express.Multer.File & {
      path: string;
      filename: string;
    };

    // Basic validation
    if (!brandName || !couponId || !audience || !duration) {
      // Clean up uploaded file from Cloudinary if validation fails
      if (uploadedFile && uploadedFile.filename) {
        await deleteCloudinaryImage(uploadedFile.filename);
      }
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Get image URL and public_id from Cloudinary upload
      const imageUrl = uploadedFile ? uploadedFile.path : null;
      const imagePublicId = uploadedFile ? uploadedFile.filename : null;

      const result: QueryResult<CouponWithImage> = await pool.query(
        `INSERT INTO coupons 
        (brand_name, coupon_id, bogo, discount, audience, duration, image_url, image_public_id) 
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
        [
          brandName,
          couponId,
          bogo || null,
          discount || null,
          audience,
          duration,
          imageUrl,
          imagePublicId,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      console.error("Error creating coupon:", err);

      // Clean up uploaded file from Cloudinary if database operation fails
      if (uploadedFile && uploadedFile.filename) {
        await deleteCloudinaryImage(uploadedFile.filename);
      }

      // Check for duplicate coupon ID
      if (err.code === "23505") {
        return res.status(400).json({ error: "Coupon ID already exists" });
      }

      res.status(500).json({ error: "Failed to create coupon" });
    }
  }
);

// PUT update a coupon (including image)
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
      // First, get the existing coupon to handle old image cleanup
      const existingResult: QueryResult<CouponWithImage> = await pool.query(
        "SELECT * FROM coupons WHERE coupon_id = $1",
        [couponId]
      );

      if (existingResult.rows.length === 0) {
        // Clean up uploaded file from Cloudinary if coupon doesn't exist
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
        // Delete old image from Cloudinary if it exists
        if (existingCoupon.image_public_id) {
          await deleteCloudinaryImage(existingCoupon.image_public_id);
        }

        // Set new image URL and public_id
        imageUrl = uploadedFile.path;
        imagePublicId = uploadedFile.filename;
      }

      // Update the coupon
      const result: QueryResult<CouponWithImage> = await pool.query(
        `UPDATE coupons 
         SET brand_name = $1, bogo = $2, discount = $3, audience = $4, duration = $5, 
             image_url = $6, image_public_id = $7, updated_at = CURRENT_TIMESTAMP
         WHERE coupon_id = $8 
         RETURNING *`,
        [
          brandName || existingCoupon.brand_name,
          bogo || existingCoupon.bogo,
          discount || existingCoupon.discount,
          audience || existingCoupon.audience,
          duration || existingCoupon.duration,
          imageUrl,
          imagePublicId,
          couponId,
        ]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating coupon:", err);

      // Clean up uploaded file from Cloudinary if database operation fails
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

    // Delete associated image from Cloudinary if it exists
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
      "SELECT * FROM coupons WHERE coupon_id = $1",
      [couponId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching coupon:", err);
    res.status(500).json({ error: "Failed to fetch coupon" });
  }
});

export default router;
