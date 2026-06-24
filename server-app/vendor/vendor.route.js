
//16/06/26
const express = require("express");
const venderRoute = express.Router();
const Vender = require("./vendor.model");
const multer = require("multer");
//const path = require("path");
const nodemailer = require("nodemailer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require('cloudinary').v2;

require("dotenv").config();

//open terminal   
// >npm install multer
// >npm install multer-storage-cloudinary
// >npm install cloudinary
// >npm install nodemailer

/* =====================================================
   CLOUDINARY CONFIG
===================================================== */
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// ===================
// Multer Cloudinary Storage
// ===================
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "vendor_images", // Folder name in Cloudinary
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => Date.now() + "-" + file.originalname,
  },
});


const upload = multer({ storage });

// ===================
// Vendor Registration
// ===================
venderRoute.post("/register", async (req, res) => {
  try {
    const exists = await Vender.findOne({
      $or: [{ VUserId: req.body.VUserId }, { VEmail: req.body.VEmail }],
    });
    if (exists) return res.status(400).send("VUserId or VEmail already exists");

    const maxVidDoc = await Vender.findOne().sort({ Vid: -1 });
    const newVid = maxVidDoc ? maxVidDoc.Vid + 1 : 1;

    const vender = new Vender({ ...req.body, Vid: newVid });
    await vender.save();
    sendGMail(vender.VEmail);
    res.send("Registration Successful");
  } catch (err) {
    console.error(err);
    res.status(400).send("Registration Failed");
  }
});

// ===================
// Login
// ===================
venderRoute.post("/login", async (req, res) => {
  const { vuid, vupass } = req.body;
  try {
    const vendor = await Vender.findOne({ VUserId: vuid, VUserPass: vupass });
    if (!vendor) return res.status(404).send("Invalid credentials");
    res.send(vendor);
  } catch (err) {
    res.status(500).send("Something went wrong");
  }
});

// ===================
// Get All Vendors
// ===================
venderRoute.get("/getvendercount", async (req, res) => {
  try {
    const vendors = await Vender.find();
    res.send(vendors);
  } catch (err) {
    res.status(500).send("Something went wrong");
  }
});

// ===================
// Toggle Vendor Status
// ===================
venderRoute.put("/vendermanage/:vid/:status", async (req, res) => {
  try {
    await Vender.updateOne(
      { Vid: req.params.vid },
      { Status: req.params.status }
    );
    res.send("Vender Status Updated successfully");
  } catch (err) {
    res.status(500).send(err);
  }
});

// ===================
// Update Vendor Profile (with Cloudinary upload)
// ===================
// ===================
// Update Vendor Profile (with Cloudinary upload)
// ===================
venderRoute.put("/update/:VUserId", async (req, res) => {
  try {
    const VUserId = req.params.VUserId;
    const vendor = await Vender.findOne({ VUserId });
    if (!vendor) return res.status(404).send("Vendor not found");

    // Multer will NOT handle files unless we add upload.single("file") middleware
    const uploadMiddleware = upload.single("file");

    uploadMiddleware(req, res, async (err) => {
      if (err) {
        console.error("Multer/Cloudinary error:", err);
        return res.status(500).send("File upload failed");
      }

      const updatedData = {
        VenderName: req.body.VenderName || vendor.VenderName,
        VAddress: req.body.VAddress || vendor.VAddress,
        VContact: req.body.VContact || vendor.VContact,
        VEmail: req.body.VEmail || vendor.VEmail,
        VPicName: req.file ? req.file.path : vendor.VPicName, // Cloudinary image URL
      };

      await Vender.updateOne({ VUserId }, { $set: updatedData });

      res.send({
        message: "Profile updated successfully",
        updatedData,
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating profile");
  }
});
/* =====================================================
   EMAIL FUNCTION
===================================================== */
function sendGMail(mailto) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS         
    },
  });
  transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: mailto,
    subject: "Vendor Registration Successful",
    text: "Dear Vendor, your registration is successful. Admin approval is required before login.",
  });
  console.log("Mail Sent To Vendor");
}
module.exports = venderRoute;

// // =========================
// // Forgot Password (OTP)
// // =========================
// let otpStore = {}; // temporary storage

// // Send OTP
// venderRoute.post("/send-otp", async (req, res) => {
//   try {
//     const { VUserId } = req.body;
//     const vendor = await Vender.findOne({ VUserId });

//     if (!vendor) {
//       return res.status(404).json({ success: false, message: "Vendor not found" });
//     }

//     const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     otpStore[VUserId] = otp;

//     // configure mail
//     let transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//        user: process.env.GMAIL_USER,
//            pass: process.env.GMAIL_APP_PASS
         
//       }
//     });

//     await transporter.sendMail({
//      from: "bsmernwala@gmail.com",
//       to: vendor.VEmail,
//       subject: "Vendor Password Reset OTP",
//       text: `Your OTP is ${otp}`
//     });

//     res.json({ success: true, message: "OTP sent to registered email" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Error sending OTP" });
//   }
// });

// // Reset Password
// venderRoute.post("/reset-password", async (req, res) => {
//   try {
//     const { VUserId, otp, newPassword } = req.body;

//     if (!otpStore[VUserId] || otpStore[VUserId] !== otp) {
//       return res.status(400).json({ success: false, message: "Invalid OTP" });
//     }

//     await Vender.updateOne({ VUserId }, { $set: { VUserPass: newPassword } });
//     delete otpStore[VUserId];

//     res.json({ success: true, message: "Password reset successful" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Error resetting password" });
//   }
// });

// // ---------------- Change Password ----------------
// venderRoute.post("/changepassword", async (req, res) => {
//   try {
//     const { VUserId, OldPassword, NewPassword } = req.body;

//     // Validate input
//     if (!VUserId || !OldPassword || !NewPassword)
//       return res.status(400).json({ message: "All fields are required" });

//     // Find the customer
//     const vender = await Vender.findOne({ VUserId });
//     if (!vender)
//       return res.status(404).json({ message: "Vender not found" });

//     // Verify old password
//     if (vender.VUserPass !== OldPassword)
//       return res.status(400).json({ message: "Old password is incorrect" });

//     // Update new password
//     vender.VUserPass = NewPassword;
//     await vender.save();

//     res.json({ message: "Password changed successfully" });
//   } catch (err) {
//     console.error("Error changing password:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });



