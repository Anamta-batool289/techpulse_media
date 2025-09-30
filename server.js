const path = require('path');
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const notifier = require('node-notifier');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schemas and models
const contactSchema = new mongoose.Schema({
  name: String, 
  email: String, 
  service: String, 
  budget: String, 
  deadline: String, 
  message: String,
  createdAt: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', contactSchema);

const subscriptionSchema = new mongoose.Schema({
  endpoint: String, 
  keys: { 
    p256dh: String, 
    auth: String 
  },
  createdAt: { type: Date, default: Date.now }
});
const Subscription = mongoose.model('Subscription', subscriptionSchema);

const helmet = require("helmet");
app.use(helmet());
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100, // per IP
  message: "Too many requests, please try again later."
});
app.use("/api/", limiter);

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Web Push Setup
if (process.env.PUBLIC_VAPID_KEY && process.env.PRIVATE_VAPID_KEY) {
  webpush.setVapidDetails(
    'mailto:' + process.env.EMAIL_USER,
    process.env.PUBLIC_VAPID_KEY,
    process.env.PRIVATE_VAPID_KEY
  );
}

// API Routes
app.get('/api/vapidPublicKey', (req, res) => {
  const publicKey = process.env.PUBLIC_VAPID_KEY;
  if (!publicKey) {
    return res.status(500).send('VAPID public key is not configured');
  }
  res.send(publicKey);
});

app.post('/api/subscribe', async (req, res) => {
  try {
    const subscription = new Subscription(req.body);
    await subscription.save();
    res.status(201).json({ message: 'Subscribed successfully!' });
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ message: 'Failed to save subscription' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, service, budget, deadline, message } = req.body;

    // Save to MongoDB
    const newContact = new Contact({ name, email, service, budget, deadline, message });
    await newContact.save();

    // Desktop notification
    notifier.notify({
      title: 'New Contact Form Submission',
      message: `From: ${name} (${email})`,
      sound: true,
      wait: false
    });

    // Email notification
    const mailOptions = {
      from: `"TechPulse Contact Form" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: 'New Contact Form Submission',
      html: `<h3>New Contact Form Submission</h3>
             <p><strong>Name:</strong> ${name}</p>
             <p><strong>Email:</strong> ${email}</p>
             <p><strong>Service:</strong> ${service}</p>
             <p><strong>Budget:</strong> ${budget}</p>
             <p><strong>Deadline:</strong> ${deadline}</p>
             <p><strong>Message:</strong><br>${message}</p>`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Email Error:', error);
      } else {
        console.log('Email sent successfully!');
      }
    });

    // Send Web Push notifications
    const payload = JSON.stringify({
      title: 'New Contact Form Submission',
      body: `From: ${name} (${email})`
    });

    const subscriptions = await Subscription.find();
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(subscription, payload);
      } catch (err) {
        if (err.statusCode === 410) {
          await Subscription.findByIdAndDelete(subscription._id);
        }
      }
    }

    res.json({ message: 'Form submitted successfully!' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
