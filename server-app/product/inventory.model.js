// models/Inventory.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const InventorySchema = new Schema({
  pid: { type: Number, required: true, index: true },    // references Product.pid
  vid: { type: Number, required: true, index: true },    // vendor id (same as product.vid)
  stock: { type: Number, default: 0 },                   // available stock
  reserved: { type: Number, default: 0 },                // reserved for carts/checkouts
  soldCount: { type: Number, default: 0 },               // cumulative sold via this inventory record
  threshold: { type: Number, default: 5 },               // low-stock threshold for alerts
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String },                                 // user who made the last update
}, {
  timestamps: true,
  collection: 'Inventory'
});

module.exports = mongoose.model('Inventory', InventorySchema);
