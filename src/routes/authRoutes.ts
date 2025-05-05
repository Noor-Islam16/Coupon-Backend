import { Router } from "express";
import AuthController from "../controllers/authController";
import { verifyToken, checkVerification } from "../middlewares/authMiddleware";
import UserProfileController from "../controllers/UserProfileController";

const router = Router();

// Public routes
router.post("/signup", AuthController.signup);
router.post("/login", AuthController.login);

// Routes that require authentication but not verification
router.post("/verify-mode", verifyToken, AuthController.selectVerificationMode);
router.post("/verify-otp", verifyToken, AuthController.verifyOTP);
router.post("/resend-otp", verifyToken, AuthController.resendOTP);

// Routes that require authentication and verification
// router.get(
//   "/profile",
//   verifyToken,
//   checkVerification,
//   AuthController.getProfile
// );
// User profile routes (all protected with authentication)
router.post("/profile", verifyToken, UserProfileController.saveUserProfile);
router.get("/profile", verifyToken, UserProfileController.getUserProfile);
router.delete("/profile", verifyToken, UserProfileController.deleteUserProfile);

export default router;
