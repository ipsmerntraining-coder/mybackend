require("dotenv").config();
const express = require('express');
const billRoute = express.Router();
let Bill = require('./bill.model');


const Customer = require("../../customer/customer.model"); 
const nodemailer = require("nodemailer");
//save bill
billRoute.route('/billsave').post((req, res)=> {    
let bill = new Bill(req.body);

bill.save().then(bill => {
      res.send({'bill': 
      'bill added successfully'
      });
      Cemail="yesbalram1@gmail.com";
      sendGMail(Cemail);
    }).catch(err => {
    res.send(err);
    });
});
     
//show all bill by customer id
billRoute.route
('/billshow/:cid').get((req, res)=> {        
  Bill.find({"cid":req.params.cid})
    .then(bill => {      
      res.send(bill);
      res.end();
    }).catch(err => {
    res.send(err);
    res.end();
    });
});


billRoute.route('/billshowbillids/:cid').get((req, res) => {
  Bill.find({ cid: req.params.cid })
    .sort({ billid: -1 })
    .select("billid billdate -_id")
    .then(bills => {
      // Remove duplicates manually
      const uniqueBills = [];
      const seen = new Set();

      for (const b of bills) {
        if (!seen.has(b.billid)) {
          seen.add(b.billid);
          uniqueBills.push(b);
        }
      }

      res.send(uniqueBills);
    })
    .catch(err => {
      res.status(500).send(err);
    });
});

billRoute.route('/billshowbilldates/:cid').get((req, res) => {
  Bill.find({ cid: req.params.cid })
    .sort({ billid: -1 })
    .select("billid billdate -_id")
    .then(bills => {
      // Remove duplicates manually
      const uniqueBills = [];
      const seen = new Set();

      for (const b of bills) {
        if (!seen.has(b.billdate)) {
          seen.add(b.billdate);
          uniqueBills.push(b);
        }
      }

      res.send(uniqueBills);
    })
    .catch(err => {
      res.status(500).send(err);
    });
});


//get Id of last Entered bill to generate ID for next bill
billRoute.route
('/getbillid').get((req, res)=> {   
  Bill.find().sort({"billid":-1}).limit(1)
    .then(bill => {     
      console.log(bill);
      res.send(bill);
      res.end();
    }).catch(err => {
        res.send(err);
        res.end();
    });
});       

//get bill details by billid
billRoute.route
('/showbillbyid/:billid').get((req, res)=> {        
  Bill.find({"billid":req.params.billid})
    .then(bill => {      
      res.send(bill);
      res.end();
    }).catch(err => {
        res.send(err);
        res.end();
    });
});

//get bill details by bill date
billRoute.route
('/showbillbydate/:billdate').get((req, res)=> {        
  Bill.find({"billdate":req.params.billdate})
    .then(bill => {      
      res.send(bill);
      res.end();
    }).catch(err => {
        res.send(err);
        res.end();
    });
});

//show all bill 
billRoute.route
('/billshow').get((req, res)=> {        
  Bill.find()
    .then(bill => {      
      res.send(bill);
      res.end();
    }).catch(err => {
    res.send(err);
    res.end();
    });
});

//Track Order by Bill ID (Customer)
billRoute.route('/trackorder/:billid').get((req, res) => {
  Bill.find({ billid: req.params.billid })
    .then(bill => {
      if (bill.length === 0) {
        return res.status(404).send({ message: "Order not found" });
      }

      res.send(bill[0]); // return first record
    })
    .catch(err => {
      res.status(500).send(err);
    });
});
//=================update order status by admin/vender
//update date 15/11/25
billRoute.put("/updatestatus", async (req, res) => {
  const { billid, status, updatedBy } = req.body;

  try {
    // 1️ Update status + updatedBy + updatedAt
    await Bill.updateMany(
      { billid: billid },
      {
        $set: {
          status: status,
          updatedBy: updatedBy || "Admin",
          updatedAt: new Date()
        }
      }
    );

    // 2️ Fetch Bill to find customer ID
    const bill = await Bill.findOne({ billid: billid });

    if (!bill) return res.status(404).send({ msg: "Bill not found" });

    // 3️ Fetch customer using bill.cid
    const customer = await Customer.findOne({ Cid: bill.cid });

    if (!customer)
      return res.status(404).send({ msg: "Customer not found for this bill" });

    const customerEmail = customer.CEmail;
    const customerName = customer.CustomerName;

    // 4️ Email transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASS // Gmail App Password
      }
    });

    // 5️ Email content
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: customerEmail,
      subject: `Order Status Update - Bill #${billid}`,
      html: `
        <h2>Hello ${customerName},</h2>
        <p>Your order <strong>#${billid}</strong> has a new update.</p>

        <p><strong>Status:</strong> ${status}</p>
        <p><strong>Updated By:</strong> ${updatedBy || "Admin"}</p>
        <p><strong>Updated On:</strong> ${new Date().toLocaleString()}</p>

        <hr/>
        <p>You can track your order in your customer dashboard.</p>
        <p>Thank you for shopping with us!</p>
      `
    };

    // 6️ Send Email
    await transporter.sendMail(mailOptions);

    res.send({
      msg: "Status updated & email sent successfully",
      updatedBy: updatedBy || "Admin"
    });
  } catch (err) {
    console.log(err);
    res.status(500).send({ msg: "Error updating status", error: err });
  }
});
//===============================

//GET All bill IDs (Admin)

billRoute.route('/allbillids').get((req, res) => {
  Bill.find()
    .sort({ billid: -1 })
    .select("billid -_id")
    .then(bills => {
      const ids = [...new Set(bills.map(b => b.billid))]; // unique billids
      res.send(ids);
    })
    .catch(err => res.status(500).send(err));
});
//GET Current Status by Bill ID
billRoute.route('/getstatus/:billid').get((req, res) => {
  Bill.findOne({ billid: req.params.billid })
    .select("billid status updatedBy updatedAt -_id")
    .then(result => {
      if (!result) return res.status(404).send({ message: "Bill not found" });
      res.send(result);
    })
    .catch(err => res.status(500).send(err));
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
    subject: "Order Placed Successful",
    text: "Dear Customer, your Order is successfully Placed.You can track your order in your customer dashboard.",
  });
  console.log("Mail Sent To Customer");
}

module.exports = billRoute;



