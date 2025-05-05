import { pool } from "../config/db";
import UserModel from "./userModel";

export interface UserProfileInput {
  userId: number;
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: string;
  houseNo: number;
  cityTownVillage: string;
  district: string;
  state: string;
  country: string;
  profilePictureUrl?: string;
}

export interface UserProfile extends UserProfileInput {
  id: number;
  email: string;
  phoneNumber: string;
  created_at: Date;
  updated_at: Date;
}

class UserProfileModel {
  // Create a new user profile
  async createUserProfile(
    profileData: UserProfileInput
  ): Promise<UserProfile | null> {
    try {
      // First get the user's email and phone
      const user = await UserModel.findById(profileData.userId);
      if (!user) {
        throw new Error("User not found");
      }

      const result = await pool.query(
        `INSERT INTO users_profiles 
        (user_id, email, phone_number, first_name, middle_name, last_name, 
         gender, house_no, city_town_village, district, state, country, profile_picture_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          profileData.userId,
          user.email,
          user.phone,
          profileData.firstName,
          profileData.middleName || null,
          profileData.lastName,
          profileData.gender,
          profileData.houseNo,
          profileData.cityTownVillage,
          profileData.district,
          profileData.state,
          profileData.country,
          profileData.profilePictureUrl || null,
        ]
      );

      return result.rows[0] ? this.mapToUserProfile(result.rows[0]) : null;
    } catch (error) {
      console.error("Error creating user profile:", error);
      return null;
    }
  }

  // Find user profile by user ID
  async findByUserId(userId: number): Promise<UserProfile | null> {
    try {
      const result = await pool.query(
        "SELECT * FROM users_profiles WHERE user_id = $1",
        [userId]
      );
      return result.rows[0] ? this.mapToUserProfile(result.rows[0]) : null;
    } catch (error) {
      console.error("Error finding user profile:", error);
      return null;
    }
  }

  // Update a user profile
  async updateUserProfile(
    userId: number,
    profileData: Partial<UserProfileInput>
  ): Promise<UserProfile | null> {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const columnMapping: Record<string, string> = {
        firstName: "first_name",
        middleName: "middle_name",
        lastName: "last_name",
        gender: "gender",
        houseNo: "house_no",
        cityTownVillage: "city_town_village",
        district: "district",
        state: "state",
        country: "country",
        profilePictureUrl: "profile_picture_url",
      };

      for (const [key, value] of Object.entries(profileData)) {
        if (key in columnMapping && value !== undefined) {
          setClauses.push(`${columnMapping[key]} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(userId);

      if (setClauses.length === 1) {
        return this.findByUserId(userId);
      }

      const query = `
        UPDATE users_profiles
        SET ${setClauses.join(", ")}
        WHERE user_id = $${paramCount}
        RETURNING *
      `;

      const result = await pool.query(query, values);
      return result.rows[0] ? this.mapToUserProfile(result.rows[0]) : null;
    } catch (error) {
      console.error("Error updating user profile:", error);
      return null;
    }
  }

  // Delete a user profile
  async deleteUserProfile(userId: number): Promise<boolean> {
    try {
      const result = await pool.query(
        "DELETE FROM users_profiles WHERE user_id = $1 RETURNING id",
        [userId]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Error deleting user profile:", error);
      return false;
    }
  }

  // Get complete user data with profile
  async getCompleteUserProfile(userId: number): Promise<any> {
    try {
      const result = await pool.query(
        `
        SELECT 
          u.id, u.email, u.phone, u.is_verified, u.created_at as user_created_at,
          p.first_name, p.middle_name, p.last_name, p.gender, p.house_no,
          p.city_town_village, p.district, p.state, p.country, p.profile_picture_url,
          p.created_at as profile_created_at, p.updated_at as profile_updated_at
        FROM users u
        LEFT JOIN users_profiles p ON u.id = p.user_id
        WHERE u.id = $1
      `,
        [userId]
      );

      if (!result.rows[0]) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        email: row.email,
        phone: row.phone,
        isVerified: row.is_verified,
        profile: {
          firstName: row.first_name,
          middleName: row.middle_name,
          lastName: row.last_name,
          gender: row.gender,
          houseNo: row.house_no,
          cityTownVillage: row.city_town_village,
          district: row.district,
          state: row.state,
          country: row.country,
          profilePictureUrl: row.profile_picture_url,
          createdAt: row.profile_created_at,
          updatedAt: row.profile_updated_at,
        },
        createdAt: row.user_created_at,
      };
    } catch (error) {
      console.error("Error getting complete user profile:", error);
      return null;
    }
  }

  // Update profile picture URL
  async updateProfilePicture(
    userId: number,
    imageUrl: string
  ): Promise<boolean> {
    try {
      await pool.query(
        "UPDATE users_profiles SET profile_picture_url = $1, updated_at = NOW() WHERE user_id = $2",
        [imageUrl, userId]
      );
      return true;
    } catch (error) {
      console.error("Error updating profile picture:", error);
      return false;
    }
  }

  private mapToUserProfile(row: any): UserProfile {
    return {
      id: row.id,
      userId: row.user_id,
      email: row.email,
      phoneNumber: row.phone_number,
      firstName: row.first_name,
      middleName: row.middle_name || undefined,
      lastName: row.last_name,
      gender: row.gender,
      houseNo: row.house_no,
      cityTownVillage: row.city_town_village,
      district: row.district,
      state: row.state,
      country: row.country,
      profilePictureUrl: row.profile_picture_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export default new UserProfileModel();
