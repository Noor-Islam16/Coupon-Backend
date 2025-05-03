import { pool } from "../config/db";
import { sendEmail } from "../config/email";

// Generate a random 6-digit OTP
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP in database
export const storeOTP = async (
  userId: number,
  otp: string,
  type: "email" | "phone"
): Promise<boolean> => {
  try {
    // Calculate expiry time (default: 10 minutes from now)
    const otpExpiryMinutes = parseInt(process.env.OTP_EXPIRY || "10");
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + otpExpiryMinutes);

    // Delete any existing OTPs for this user and type
    await pool.query("DELETE FROM otp_codes WHERE user_id = $1 AND type = $2", [
      userId,
      type,
    ]);

    // Insert new OTP
    await pool.query(
      "INSERT INTO otp_codes (user_id, otp, type, expires_at) VALUES ($1, $2, $3, $4)",
      [userId, otp, type, expiresAt]
    );

    return true;
  } catch (error) {
    console.error("Error storing OTP:", error);
    return false;
  }
};

// Verify OTP
export const verifyOTP = async (
  userId: number,
  otp: string,
  type: "email" | "phone"
): Promise<boolean> => {
  try {
    const result = await pool.query(
      "SELECT * FROM otp_codes WHERE user_id = $1 AND otp = $2 AND type = $3 AND expires_at > NOW()",
      [userId, otp, type]
    );

    if (result.rows.length === 0) {
      return false;
    }

    // Delete the OTP after successful verification
    await pool.query("DELETE FROM otp_codes WHERE user_id = $1 AND type = $2", [
      userId,
      type,
    ]);

    // Update user verification status
    await pool.query(
      "UPDATE users SET is_verified = TRUE, updated_at = NOW() WHERE id = $1",
      [userId]
    );

    return true;
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return false;
  }
};

// Send OTP email
export const sendOTPEmail = async (
  email: string,
  otp: string
): Promise<boolean> => {
  const subject = "Email Verification OTP";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333; text-align: center;">Email Verification</h2>
      <p>Thank you for registering with our service. To complete your registration, please use the following One-Time Password (OTP):</p>
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
        ${otp}
      </div>
      <p>This OTP is valid for 10 minutes.</p>
      <p>If you did not request this verification, please ignore this email.</p>
      <p>Best regards,<br>Your App Team</p>
    </div>
  `;

  return await sendEmail(email, subject, html);
};
