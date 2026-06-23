
//18/06/26
const express = require("express");
const customerRoute = express.Router();
const Customer = require("./customer.model");
const multer = require("multer");

const nodemailer = require("nodemailer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require('cloudinary').v2;

require("dotenv").config();


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
    folder: "customer_images", // Folder name in Cloudinary
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => Date.now() + "-" + file.originalname,
  },
});

const upload = multer({ storage });

// ===================
// Vendor Registration
// ===================
customerRoute.post("/register", async (req, res) => {
  try {
    const exists = await Customer.findOne({
      $or: [{ CUserId: req.body.CUserId }, { CEmail: req.body.CEmail }],
    });
    if (exists) return res.status(400).send("CUserId or CEmail already exists");

    const maxCidDoc = await Customer.findOne().sort({ Cid: -1 });
    const newCid = maxCidDoc ? maxCidDoc.Cid + 1 : 1;

    const customer = new Customer({ ...req.body, Cid: newCid });
    await customer.save();
    sendGMail(customer.CEmail);
    res.send("Registration Successful");
  } catch (err) {
    console.error(err);
    res.status(400).send("Registration Failed");
  }
});

// ===================
// Login
// ===================
customerRoute.post("/login", async (req, res) => {
  const { cuid, cupass } = req.body;
  //console.log("Customer Data From Client="+cuid+" "+cupass)
  try {
    const customer = await Customer.findOne({ CUserId: cuid, CUserPass: cupass });
    if (!customer) return res.status(404).send("Invalid credentials");
    res.send(customer);
  } catch (err) {
    res.status(500).send("Something went wrong");
  }
});

// ===================
// Get All Customers
// ===================
customerRoute.get("/getcustomercount", async (req, res) => {
  try {
    const customer = await Customer.find();
    res.send(customer);
  } catch (err) {
    res.status(500).send("Something went wrong");
  }
});

// ===================
// Toggle Customer Status
// ===================
customerRoute.put("/customermanage/:cid/:status", async (req, res) => {
  try {
    await Customer.updateOne(
      { Cid: req.params.cid },
      { Status: req.params.status }
    );
    res.send("Customer Status Updated successfully");
  } catch (err) {
    res.status(500).send(err);
  }
});
//=====================
// Update customer Profile (with Cloudinary upload)
// ===================
// customerRoute.put("/update/:CUserId", async (req, res) => {
//   try {
//     const CUserId = req.params.CUserId;
//     const customer = await Customer.findOne({ CUserId });
//     if (!customer) return res.status(404).send("Customer not found");

//     // Multer will NOT handle files unless we add upload.single("file") middleware
//     const uploadMiddleware = upload.single("file");

//     uploadMiddleware(req, res, async (err) => {
//       if (err) {
//         console.error("Multer/Cloudinary error:", err);
//         return res.status(500).send("File upload failed");
//       }

//       const updatedData = {
//         CustomerName: req.body.CustomerName || customer.CustomerName,
//         CAddress: req.body.CAddress || customer.CAddress,
//         CStId: req.body.CStId || customer.CStId,
//         CCtId: req.body.CCtId || customer.CCtId,
//         CContact: req.body.CContact || customer.CContact,
//         CEmail: req.body.CEmail || customer.CEmail,
//         CPicName: req.file ? req.file.path : customer.CPicName, // Cloudinary image URL
//       };

//       await Customer.updateOne({ CUserId }, { $set: updatedData });

//       res.send({
//         message: "Profile updated successfully",
//         updatedData,
//       });
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Error updating profile");
//   }
// });
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
    subject: "Customer Registration Successful",
    text: "Dear Customer, your registration is successful. Admin approval is required before login.",
  });
  console.log("Mail Sent To Customer");
}
// ---------------- Get Customer Details by ID ----------------
customerRoute.get("/getcustomerdetails/:cid", async (req, res) => {
  try {
    const customer = await Customer.findOne({ Cid: req.params.cid });
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// ---------------- Change Password ----------------
customerRoute.post("/changepassword", async (req, res) => {
  try {
    const { CUserId, OldPassword, NewPassword } = req.body;

    // Validate input
    if (!CUserId || !OldPassword || !NewPassword)
      return res.status(400).json({ message: "All fields are required" });

    // Find the customer
    const customer = await Customer.findOne({ CUserId });
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    // Verify old password
    if (customer.CUserPass !== OldPassword)
      return res.status(400).json({ message: "Old password is incorrect" });

    // Update new password
    customer.CUserPass = NewPassword;
    await customer.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Error changing password:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// // ---------------- Update Customer -------------------
// customerRoute.put("/update/:cid", upload.single("CPicName"), async (req, res) => {
//   console.log("update fun called");
//   try {
//     const { cid } = req.params;
//     const { CEmail, CUserId } = req.body;
//     const customer = await Customer.findOne({ Cid: cid });
//     if (!customer) return res.status(404).json({ message: "Customer not found" });

//     const emailExists = await Customer.findOne({ CEmail, Cid: { $ne: cid } });
//     if (emailExists) return res.status(400).json({ message: "Email already exists" });

//     const userIdExists = await Customer.findOne({ CUserId, Cid: { $ne: cid } });
//     if (userIdExists) return res.status(400).json({ message: "User ID already exists" });

//     // update fields
//     customer.CustomerName = req.body.CustomerName;
//     customer.CAddress = req.body.CAddress;
//     customer.CContact = req.body.CContact;
//     customer.CEmail = CEmail;
//     customer.CUserId = CUserId;
//     customer.StId = req.body.StId;
//     customer.CtId = req.body.CtId;

//     // if image uploaded, replace on cloudinary
//     if (req.file) {
//       const stream = cloudinary.uploader.upload_stream(
//         { folder: "customer_images" },
//         async (error, result) => {
//           if (error) return res.status(500).json({ message: "Cloudinary upload failed" });
//           customer.CPicName = result.secure_url;
//           await customer.save();
//           res.json({ message: "Profile updated successfully", customer });
//         }
//       );
//       stream.end(req.file.buffer);
//     } else {
//       await customer.save();
//       res.json({ message: "Profile updated successfully", customer });
//     }
//   } catch (err) {
//     console.error("Error updating customer:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// ---------------- Update Customer -------------------
customerRoute.put(
  "/update/:cid",
  upload.single("CPicName"),
  async (req, res) => {
    console.log("Update Customer API Called");

    try {
      const { cid } = req.params;
      const { CEmail, CUserId } = req.body;

      const customer = await Customer.findOne({ Cid: cid });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      // Check duplicate email
      const emailExists = await Customer.findOne({
        CEmail,
        Cid: { $ne: cid },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }

      // Check duplicate userid
      const userIdExists = await Customer.findOne({
        CUserId,
        Cid: { $ne: cid },
      });

      if (userIdExists) {
        return res.status(400).json({
          success: false,
          message: "User ID already exists",
        });
      }

      // Update fields
      customer.CustomerName = req.body.CustomerName;
      customer.CUserId = req.body.CUserId;
      customer.StId = req.body.StId;
      customer.CtId = req.body.CtId;
      customer.CAddress = req.body.CAddress;
      customer.CContact = req.body.CContact;
      customer.CEmail = req.body.CEmail;

      // Cloudinary image uploaded automatically
      if (req.file) {
        customer.CPicName = req.file.path;
      }

      await customer.save();

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        customer,
      });
    } catch (err) {
      console.error("Customer Update Error:", err);

      res.status(500).json({
        success: false,
        message: err.message || "Server Error",
      });
    }
  }
);
module.exports = customerRoute;

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



