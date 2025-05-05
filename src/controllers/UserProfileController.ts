import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware";
import UserProfileModel, { UserProfileInput } from "../models/UserProfileModel";
import UserModel from "../models/userModel";
import Joi from "joi";

const userProfileSchema = Joi.object({
  firstName: Joi.string().required(),
  middleName: Joi.string().allow(""),
  lastName: Joi.string().required(),
  gender: Joi.string().valid("Male", "Female", "Other").required(),
  houseNo: Joi.number().required(),
  cityTownVillage: Joi.string().required(),
  district: Joi.string().required(),
  state: Joi.string().required(),
  country: Joi.string().required(),
});

class UserProfileController {
  async saveUserProfile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { error, value } = userProfileSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const existingProfile = await UserProfileModel.findByUserId(req.user.id);
      let profile;

      if (existingProfile) {
        profile = await UserProfileModel.updateUserProfile(
          req.user.id,
          value as Partial<UserProfileInput>
        );
        if (!profile) {
          return res.status(500).json({ message: "Failed to update profile" });
        }
      } else {
        const profileData: UserProfileInput = {
          userId: req.user.id,
          ...value,
        };
        profile = await UserProfileModel.createUserProfile(profileData);
        if (!profile) {
          return res.status(500).json({ message: "Failed to create profile" });
        }
      }

      const completeProfile = await UserProfileModel.getCompleteUserProfile(
        req.user.id
      );
      return res.status(200).json({
        message: "Profile saved successfully",
        profile: completeProfile,
      });
    } catch (error) {
      console.error("Save profile error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  async getUserProfile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const completeProfile = await UserProfileModel.getCompleteUserProfile(
        req.user.id
      );
      if (!completeProfile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      return res.status(200).json(completeProfile);
    } catch (error) {
      console.error("Get profile error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  async deleteUserProfile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const deleted = await UserProfileModel.deleteUserProfile(req.user.id);
      if (!deleted) {
        return res
          .status(404)
          .json({ message: "Profile not found or already deleted" });
      }

      return res.status(200).json({ message: "Profile deleted successfully" });
    } catch (error) {
      console.error("Delete profile error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  async updateProfilePicture(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { imageUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ message: "Image URL is required" });
      }

      const updated = await UserProfileModel.updateProfilePicture(
        req.user.id,
        imageUrl
      );
      if (!updated) {
        return res
          .status(500)
          .json({ message: "Failed to update profile picture" });
      }

      const completeProfile = await UserProfileModel.getCompleteUserProfile(
        req.user.id
      );
      return res.status(200).json({
        message: "Profile picture updated successfully",
        profile: completeProfile,
      });
    } catch (error) {
      console.error("Update profile picture error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
}

export default new UserProfileController();
