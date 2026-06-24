// routes/inventoryActions.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Inventory = require('./inventory.model.js');
const Product = require('../product/product.model.js');

// --- Helper to coerce numbers
const toNum = v => (typeof v === 'number' ? v : Number(v));

// -----------------------------
// 1) Helper: create inventory when vendor adds product
// Use this function from your product creation controller after product is saved.
// e.g. const inv = await createInventoryForNewProduct(newProduct.pid, newProduct.vid, initialStock);
// -----------------------------
async function createInventoryForNewProduct(pid, vid, initialStock = 0, opts = {}) {
  try {
    if (!pid || !vid) throw new Error('pid and vid required');

    // ensure product exists
    const product = await Product.findOne({ pid: toNum(pid) });
    if (!product) throw new Error(`Product pid ${pid} not found`);

    // avoid duplicate inventory for pid+vid
    const existing = await Inventory.findOne({ pid: toNum(pid), vid: toNum(vid) });
    if (existing) {
      // optionally update stock if initialStock provided
      if (initialStock && initialStock > 0) {
        existing.stock = existing.stock + toNum(initialStock);
        if (opts.updatedBy) existing.updatedBy = opts.updatedBy;
        await existing.save();
      }
      return existing;
    }

    const inv = new Inventory({
      pid: toNum(pid),
      vid: toNum(vid),
      stock: toNum(initialStock) || 0,
      reserved: 0,
      soldCount: 0,
      threshold: opts.threshold ?? 5,
      updatedBy: opts.updatedBy || null,
    });

    await inv.save();
    return inv;
  } catch (err) {
    // bubble up error so caller can decide
    throw err;
  }
}

// export helper for use in product controller
module.exports.createInventoryForNewProduct = createInventoryForNewProduct;

// -----------------------------
// 2) Route: vendor updates stock (increments or sets)
//    - PATCH /api/inventory/pid/:pid/vendor/:vid/stock  (already mostly exists in your router)
//    - Two modes supported via query param `mode=set|inc`
//      * mode=set -> set stock to given value (body: { stock })
//      * mode=inc -> increment by delta (body: { delta })
//    - This route checks vendor identity via `req.user` (you must add auth middleware to populate req.user.vid and req.user.role).
// -----------------------------
router.patch('/pid/:pid/vendor/:vid/stock', async (req, res) => {
  try {
    const pid = toNum(req.params.pid);
    const vid = toNum(req.params.vid);

    // === AUTH CHECK (implement in your app) ===
    // TODO: replace this with your auth middleware
    // Expectation: req.user exists and contains { vid: Number, role: 'vendor'|'admin' }
    const user = req.user || {}; // e.g., populated by auth middleware
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    // if user is vendor, ensure they can only modify their own vid
    if (user.role === 'vendor' && Number(user.vid) !== vid) {
      return res.status(403).json({ message: 'Forbidden — cannot modify another vendor inventory' });
    }
    // admins allowed

    const mode = (req.query.mode || 'inc').toLowerCase();

    if (mode === 'set') {
      // set absolute stock
      const stockVal = Number(req.body.stock);
      if (!Number.isFinite(stockVal) || stockVal < 0) return res.status(400).json({ message: 'stock must be >= 0' });

      const inv = await Inventory.findOneAndUpdate(
        { pid, vid },
        { $set: { stock: stockVal, updatedAt: new Date(), updatedBy: user.username || user.id || null } },
        { new: true }
      );
      if (!inv) return res.status(404).json({ message: 'Inventory not found' });
      return res.json(inv);
    } else {
      // increment/decrement by delta
      const delta = Number(req.body.delta);
      if (!Number.isFinite(delta)) return res.status(400).json({ message: 'delta (number) required' });

      // Use atomic $inc to avoid race conditions
      const inv = await Inventory.findOneAndUpdate(
        { pid, vid },
        { $inc: { stock: delta }, $set: { updatedAt: new Date(), updatedBy: user.username || user.id || null } },
        { new: true }
      );
      if (!inv) return res.status(404).json({ message: 'Inventory not found' });

      // Prevent negative stock if you want: roll back if negative
      if (inv.stock < 0) {
        // revert the change
        await Inventory.updateOne({ pid, vid }, { $inc: { stock: -delta } });
        return res.status(400).json({ message: 'Operation would make stock negative' });
      }

      return res.json(inv);
    }
  } catch (err) {
    console.error('vendor update stock error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------
// 3) Route: customer purchase -> transactional stock reduction
//    - POST /api/inventory/purchase
//    - body: { items: [{ pid, vid, qty }], customerId: optional }
//    - Atomically checks stock and decrements stock and increments soldCount
// -----------------------------
router.post('/purchase', async (req, res) => {
console.log('purchase request body:', req.body);  
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'items required' });
    }

    // Normalize and validate
    for (const it of items) {
      if (!it.pid || !it.vid || !it.qty) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'each item must include pid, vid and qty' });
      }
      if (!Number.isFinite(Number(it.qty)) || Number(it.qty) <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'qty must be a positive number' });
      }
    }

    // 1) Verify stock for each item
    for (const it of items) {
      const pid = toNum(it.pid);
      const vid = toNum(it.vid);
      const qty = toNum(it.qty);

      const inv = await Inventory.findOne({ pid, vid }).session(session);
      if (!inv) throw new Error(`Inventory not found for pid ${pid} vid ${vid}`);
      if (inv.stock < qty) throw new Error(`Insufficient stock for pid ${pid} (available ${inv.stock}, requested ${qty})`);
    }

    // 2) Decrement stock and increment soldCount for each item
    for (const it of items) {
      const pid = toNum(it.pid);
      const vid = toNum(it.vid);
      const qty = toNum(it.qty);

      await Inventory.updateOne(
        { pid, vid },
        { $inc: { stock: -qty, soldCount: qty }, $set: { updatedAt: new Date() } }
      ).session(session);
    }

    // OPTIONAL: create Order document here (persist order details)
    // const Order = require('../models/Order');
    // await Order.create([ { customerId, items, ... } ], { session });

    await session.commitTransaction();
    session.endSession();
    return res.json({ success: true, message: 'Purchase completed' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('purchase error:', err);
    return res.status(400).json({ error: err.message });
  }
});

router.get('/getstock/:pid/:vid', async (req, res) => {
// Export router and helper
    try {
    const pid = toNum(req.params.pid);
    const vid = toNum(req.params.vid);

    const inv = await Inventory.findOne({ pid, vid });
    if (!inv) return res.status(404).json({ message: 'Inventory not found' });

     return res.json({ stock: inv.stock, reserved: inv.reserved, soldCount: inv.soldCount });
  } 
    catch (err) {
    console.error('get stock error:', err);
    return res.status(500).json({ error: err.message });
  }
});
router.get('/inventorybyvendor/:vid', async (req, res) => {
    try {
    const vid = toNum(req.params.vid);

    const invRecords = await Inventory.find({ vid });
    return res.json(invRecords);
  } 
    catch (err) {
    console.error('get inventory by vendor error:', err);
    return res.status(500).json({ error: err.message });
  } 
});
router.get('/inventorybyproduct/:pid', async (req, res) => {
    try {
    const pid = toNum(req.params.pid);

    const invRecords = await Inventory.find({ pid });
    return res.json(invRecords);
  } 
    catch (err) {
    console.error('get inventory by product error:', err);
    return res.status(500).json({ error: err.message });
  } 
}); 
router.get('/allinventory', async (req, res) => {
    try {
    const invRecords = await Inventory.find();
    return res.json(invRecords);
  } 
    catch (err) {
    console.error('get all inventory error:', err);
    return res.status(500).json({ error: err.message });
  } 
});
router.get('/stock', async (req, res) => {
    try {
    const invRecords = await Inventory.find();
    return res.json(invRecords);
  } 
    catch (err) {
    console.error('get all inventory error:', err);
    return res.status(500).json({ error: err.message });
  } 
});
router.delete('/deletestock/:pid/vendor/:vid', async (req, res) => {
  try {
    const pid = toNum(req.params.pid);
    const vid = toNum(req.params.vid);

    const result = await Inventory.deleteOne({ pid, vid });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Inventory not found' });
    }
    return res.json({ message: 'Inventory deleted successfully' });
  } catch (err) {
    console.error('delete inventory error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.createInventoryForNewProduct = createInventoryForNewProduct;
