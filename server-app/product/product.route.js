
const express = require("express");
const productRoute = express.Router();
const Product = require("./product.model");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { createInventoryForNewProduct } = require("./inventory.route");

require("dotenv").config();

/* ================= CLOUDINARY ================= */
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

/* ================= MULTER ================= */
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "product_images",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const upload = multer({ storage });

/* ================= SAVE PRODUCT ================= */
productRoute.post("/saveproduct", async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();

    await createInventoryForNewProduct(
      product.pid,
      product.vid,
      0,
      { updatedBy: product.vid }
    );

    res.json({ message: "Product added", product });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
});

/* ================= UPLOAD IMAGE ================= */
productRoute.post("/saveproductimage", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  res.json({
    imageUrl: req.file.path,      // Cloudinary URL
    publicId: req.file.filename,
  });
});

/* ================= FETCH ================= */
productRoute.get("/showproductbyvender/:vid", async (req, res) => {
  const data = await Product.find({ vid: req.params.vid });
  res.send(data);
});

productRoute.get("/showproduct", async (req, res) => {
  res.send(await Product.find());
});
productRoute.get("/showproductbycatgid/:pcatgid", async (req, res) => {
  res.send(await Product.find({pcatgid:req.params.pcatgid}));
});
productRoute.get("/showproductbystatus/:status", async (req, res) => {
  res.send(await Product.find({status:req.params.status}));
});


productRoute.get("/getmaxpid", async (req, res) => {
  res.send(await Product.find());
});

/* ================= UPDATE ================= */
productRoute.put("/updateproduct/:pid", async (req, res) => {
  await Product.updateOne({ pid: req.params.pid }, { $set: req.body });
  res.send("Updated");
});

productRoute.put("/updateproductstatus/:pid/:status", async (req, res) => {
  await Product.updateOne(
    { pid: req.params.pid },
    { status: req.params.status }
  );
  res.send("Status updated");
});

/* =====================================
   SHOW PRODUCT STATUS
===================================== */
productRoute.get("/showproductstatus/:pid", async (req, res) => {
  try {
    const product = await Product.findOne({ pid: req.params.pid });
    res.send(product);
  } catch {
    res.status(400).send("Data not found");
  }
});

module.exports = productRoute;
