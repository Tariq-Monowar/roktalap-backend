import nodemailer from "nodemailer";

import dotenv from "dotenv";
import { emailForgotPasswordOTP } from "../constants/email_message";

dotenv.config();

export const generateOTP = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const sendEmail = async (
  to: string,
  subject: string,
  htmlContent: string
): Promise<void> => {
  const mailTransporter = nodemailer.createTransport({
    // host: "smtp.mailtrap.io", // Update if you're using a different SMTP provider
    service: "gmail",
    port: 587,
    auth: {
      user: process.env.NODE_MAILER_USER || "",
      pass: process.env.NODE_MAILER_PASSWORD || "",
    },
  });

  const mailOptions = {
    from: `"kleiton18" <tqmhosain@gmail.com>`,
    to,
    subject,
    html: htmlContent,
  };

  await mailTransporter.sendMail(mailOptions);
};

export const sendForgotPasswordOTP = async (
  userName: string,
  email: string,
  otp: string
): Promise<void> => {
  const htmlContent = emailForgotPasswordOTP(userName, email, otp);
  await sendEmail(email, "otp Code for reset password", htmlContent);
};