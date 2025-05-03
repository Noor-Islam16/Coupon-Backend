import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import UserModel, { UserInput, LoginInput } from "../models/userModel";
import { AuthRequest } from "../middlewares/authMiddleware";
import {
  generateOTP,
  storeOTP,
  verifyOTP,
  sendOTPEmail,
} from "../utils/otpUtils";
import Joi from "joi";

// Validation schema for signup
const signupSchema = Joi.object({
  useremail: Joi.string().email().required(),
  userphone: Joi.string().required(),
  password: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match",
  }),
});

// Validation schema for login
const loginSchema = Joi.object({
  useremail: Joi.string().email().required(),
  userpassword: Joi.string().required(),
  RememberMe: Joi.boolean(),
});

// Validation schema for OTP verification
const otpVerificationSchema = Joi.object({
  emailotpfield: Joi.string()
    .length(6)
    .pattern(/^[0-9]+$/)
    .required(),
});

// Validation schema for verification mode
const verificationModeSchema = Joi.object({
  emailcheck: Joi.boolean(),
  phonecheck: Joi.boolean(),
});

class AuthController {
  // Register a new user
  async signup(req: Request, res: Response) {
    try {
      // Validate request body
      const { error, value } = signupSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const { useremail, userphone, password } = value;

      // Check if email already exists
      const existingEmail = await UserModel.findByEmail(useremail);
      if (existingEmail) {
        return res
          .status(205)
          .json({ message: "User with this email already exists" });
      }

      // Check if phone already exists
      const existingPhone = await UserModel.findByPhone(userphone);
      if (existingPhone) {
        return res
          .status(205)
          .json({ message: "User with this phone already exists" });
      }

      // Create new user
      const user = await UserModel.createUser({
        email: useremail,
        phone: userphone,
        password: password,
      });

      if (!user) {
        return res.status(500).json({ message: "Failed to create user" });
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET || "fallback_secret",
        { expiresIn: "1d" }
      );

      return res.status(200).json({
        message: "Signup successful!",
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          is_verified: user.is_verified,
        },
        token,
      });
    } catch (error) {
      console.error("Signup error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // Login user
  async login(req: Request, res: Response) {
    try {
      // Validate request body
      const { error, value } = loginSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const { useremail, userpassword, RememberMe } = value;

      // Find user by email
      const user = await UserModel.findByEmail(useremail);

      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Verify password
      const isPasswordValid = await UserModel.verifyPassword(
        userpassword,
        user.password
      );

      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check if user is verified
      if (!user.is_verified) {
        return res.status(203).json({ message: "Please verify your account" });
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET || "fallback_secret",
        { expiresIn: RememberMe ? "30d" : "1d" }
      );

      return res.status(200).json({
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          is_verified: user.is_verified,
        },
        token,
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // Select verification method (email or phone)
  async selectVerificationMode(req: Request, res: Response) {
    try {
      // Validate request body
      const { error, value } = verificationModeSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const { emailcheck, phonecheck } = value;

      if (!emailcheck && !phonecheck) {
        return res
          .status(400)
          .json({ message: "Please select a verification method" });
      }

      // Get user ID from token
      const token = req.headers.authorization?.split(" ")[1];

      if (!token) {
        return res.status(401).json({ message: "No token provided" });
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "fallback_secret"
      ) as {
        id: number;
        email: string;
      };

      const user = await UserModel.findById(decoded.id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (emailcheck) {
        // Generate and store OTP
        const otp = generateOTP();
        const stored = await storeOTP(user.id, otp, "email");

        if (!stored) {
          return res.status(500).json({ message: "Failed to generate OTP" });
        }

        // Send OTP via email
        const sent = await sendOTPEmail(user.email, otp);

        if (!sent) {
          return res.status(500).json({ message: "Failed to send OTP" });
        }

        return res.status(200).json({ message: "OTP sent successfully" });
      } else if (phonecheck) {
        // Phone verification logic (for future implementation)
        return res.status(200).json({ message: "Phone verification selected" });
      }
    } catch (error) {
      console.error("Verification mode error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // Verify OTP
  async verifyOTP(req: Request, res: Response) {
    try {
      // Validate request body
      const { error, value } = otpVerificationSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const { emailotpfield } = value;

      // Get user ID from token
      const token = req.headers.authorization?.split(" ")[1];

      if (!token) {
        return res.status(401).json({ message: "No token provided" });
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "fallback_secret"
      ) as {
        id: number;
        email: string;
      };

      // Verify OTP
      const isVerified = await verifyOTP(decoded.id, emailotpfield, "email");

      if (!isVerified) {
        return res.status(205).json({ message: "Please enter correct OTP" });
      }

      // Refresh token after verification
      const newToken = jwt.sign(
        { id: decoded.id, email: decoded.email },
        process.env.JWT_SECRET || "fallback_secret",
        { expiresIn: "1d" }
      );

      return res.status(200).json({
        message: "OTP verified successfully",
        token: newToken,
      });
    } catch (error) {
      console.error("OTP verification error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // Get user profile
  async getProfile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await UserModel.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          is_verified: user.is_verified,
          created_at: user.created_at,
        },
      });
    } catch (error) {
      console.error("Get profile error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // Resend OTP
  async resendOTP(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await UserModel.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Generate and store OTP
      const otp = generateOTP();
      const stored = await storeOTP(user.id, otp, "email");

      if (!stored) {
        return res.status(500).json({ message: "Failed to generate OTP" });
      }

      // Send OTP via email
      const sent = await sendOTPEmail(user.email, otp);

      if (!sent) {
        return res.status(500).json({ message: "Failed to send OTP" });
      }

      return res.status(200).json({ message: "OTP resent successfully" });
    } catch (error) {
      console.error("Resend OTP error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
}

export default new AuthController();
