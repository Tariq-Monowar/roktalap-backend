export const RegistrationOTPEmailMessage = (userName: string, email: string, OTP: string) => {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="https://via.placeholder.com/150x50?text=MasterEnergy" alt="Master Energy Logo" style="max-width: 100%; height: auto;">
    </div>
    <h2 style="color: #007bff;">Welcome to Master Energy!</h2>
    <p style="color: #333; font-size: 18px;">Hi ${userName},</p>
    <p style="color: #333; font-size: 16px;">Thank you for signing up with Master Energy. To complete your registration, please use the OTP code below:</p>
    <div style="text-align: center; margin: 20px 0;">
      <div style="display: inline-block; padding: 15px 30px; background-color: #007bff; color: #fff; font-size: 24px; font-weight: bold; border-radius: 5px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">${OTP}</div>
    </div>
    <p style="color: #333; font-size: 16px;">This OTP is valid for 10 minutes. If you did not request this code, please ignore this email.</p>
    <p style="color: #333; font-size: 16px;">Best Regards,</p>
    <p style="color: #333; font-size: 16px;">The Master Energy Team</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
    <p style="color: #777; font-size: 12px; text-align: center;">This email was sent to ${email}. If you did not sign up for Master Energy, please disregard this email.</p>
  </div>
`;
};





export const emailForgotPasswordOTP = (
    userName: string,
    email: string,
    OTP: string
  ): string => {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="https://via.placeholder.com/150x50?text=Vigitade+Side+Hotel" alt="Vigitade Side Hotel Logo" style="max-width: 100%; height: auto;">
        </div>
        <h2 style="color: #007bff;">Password Reset Request</h2>
        <p style="color: #333; font-size: 18px;">Hi ${userName},</p>
        <p style="color: #333; font-size: 16px;">We received a request to reset your password for your account with Vigitade Side Hotel. Please use the OTP code below to proceed:</p>
        <div style="text-align: center; margin: 20px 0;">
          <div style="display: inline-block; padding: 15px 30px; background-color: #007bff; color: #fff; font-size: 24px; font-weight: bold; border-radius: 5px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
            ${OTP}
          </div>
        </div>
        <p style="color: #333; font-size: 16px;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        <p style="color: #333; font-size: 16px;">Warm regards,</p>
        <p style="color: #333; font-size: 16px;">The Vigitade Side Hotel Team</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #777; font-size: 12px; text-align: center;">This email was sent to ${email}. If you did not request a password reset, please disregard this message.</p>
      </div>
    `;
  };
  