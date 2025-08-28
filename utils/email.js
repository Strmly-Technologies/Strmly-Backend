const nodemailer=require('nodemailer');
const crypto=require('crypto');

const createTransporter=()=>{
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        secure: true,
        tls: {
            rejectUnauthorized: false,
        },
    });
};

const generateVerificationOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}

const sendVerificationEmail = async (email, username, verificationOTP) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify your Strmly account - OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Welcome to Strmly, ${username}!</h1>
        <p>Thank you for registering with Strmly. To complete your registration, please verify your email address using the OTP below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <div style="background-color: #f8f9fa; border: 2px dashed #007bff; padding: 20px; border-radius: 10px; display: inline-block;">
            <h2 style="color: #007bff; margin: 0; letter-spacing: 3px; font-size: 32px;">${verificationOTP}</h2>
          </div>
        </div>
        
        <p style="text-align: center; font-size: 16px; color: #666;">Enter this 6-digit code in the verification form</p>
        
        <p><strong>This OTP will expire in 10 minutes.</strong></p>
        
        <p>If you didn't create an account with Strmly, please ignore this email.</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message from Strmly. Please do not reply to this email.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};


const sendWelcomeEmail = async (email, username) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Welcome to Strmly!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Welcome to Strmly, ${username}!</h1>
        <p>Your email has been successfully verified. You can now enjoy all the features of Strmly:</p>
        
        <ul>
          <li>Create and share amazing content</li>
          <li>Join communities of like-minded creators</li>
          <li>Earn from your videos and series</li>
          <li>Connect with your audience</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/login" 
             style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Start Creating
          </a>
        </div>
        
        <p>Thank you for joining the Strmly community!</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message from Strmly. Please do not reply to this email.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Welcome email sending error:', error);
    return { success: false, error: error.message };
  }
};

const sendPasswordResetEmail = async (email, username, reset_otp) => {
  const transporter = createTransporter();
  
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Reset your Strmly password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Password Reset Request</h1>
        <p>Hi ${username},</p>
        <p>We received a request to reset your password for your Strmly account. If you didn't make this request, please ignore this email. Here is your OTP</p>
        
       <div style="text-align: center; margin: 30px 0;">
          <div style="background-color: #f8f9fa; border: 2px dashed #007bff; padding: 20px; border-radius: 10px; display: inline-block;">
            <h2 style="color: #007bff; margin: 0; letter-spacing: 3px; font-size: 32px;">${reset_otp}</h2>
          </div>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">Security Tips:</h3>
          <ul style="margin: 0;">
            <li>Never share your password with anyone</li>
            <li>Use a strong, unique password</li>
            <li>Enable two-factor authentication when available</li>
          </ul>
        </div>
        
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message from Strmly. Please do not reply to this email.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Password reset email sending error:', error);
    return { success: false, error: error.message };
  }
};

const sendPasswordResetConfirmationEmail = async (email, username) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password successfully changed - Strmly',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #28a745;">Password Changed Successfully</h1>
        <p>Hi ${username},</p>
        <p>Your Strmly account password has been successfully changed on ${new Date().toLocaleString()}.</p>
        
        <div style="background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>✓ Your account is now secured with your new password.</strong>
        </div>
        
        <p>If you didn't make this change, please contact our support team immediately.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/login" 
             style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Sign In to Your Account
          </a>
        </div>
        
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message from Strmly. Please do not reply to this email.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Password reset confirmation email error:', error);
    return { success: false, error: error.message };
  }
};

const sendAccountDeletionRequestEmail = async (email, username) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: 'Account Deletion Request - Strmly',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc3545;">Account Deletion Request</h1>
        <p>Hi Admin,</p>
        <p>User <strong>${username}</strong> (${email}) has requested to delete their account.</p>
        
        <p>Please review the request and take necessary actions.</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message from Strmly. Please do not reply to this email.
        </p>
      </div>
    `,
  };
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Account deletion email error:', error);
    return { success: false, error: error.message };
  }
}

 const sendDeletionRequestEmailToUser= async (email, username) => {
  const transporter = createTransporter();
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Account Deletion Request Received - Strmly',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc3545;">Account Deletion Request Received</h1>
        <p>Hi ${username},</p>
        <p>We have received your request to delete your Strmly account. Your account will be deleted within 30-45 days.</p>
        
        <p>If you change your mind, please contact us within this period to cancel the deletion.</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message from Strmly. Please do not reply to this email.
        </p>
      </div>
    `,
  };
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Account deletion request confirmation email error:', error);
    return { success: false, error: error.message };
  }
};

const generatePasswordResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const sendEmail = async (to, subject, text) => {
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    };
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
    return { success: true }
  } catch (error) {
    console.error('Email send error:', error)
    return { success: false, error: error.message }
  }
}

module.exports = {
    sendVerificationEmail,
    sendWelcomeEmail,
    generateVerificationOTP,
    sendPasswordResetEmail,
    sendPasswordResetConfirmationEmail,
    generatePasswordResetToken,
    sendAccountDeletionRequestEmail,
    sendDeletionRequestEmailToUser,
    sendEmail
}

