const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

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

// Debug: Check environment variables
console.log('=== Environment Variables ===');
console.log('MONGO_URI:', process.env.MONGO_URI);
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '***' : 'NOT SET');
console.log('PUBLIC_VAPID_KEY:', process.env.PUBLIC_VAPID_KEY ? 'SET' : 'NOT SET');
console.log('PRIVATE_VAPID_KEY:', process.env.PRIVATE_VAPID_KEY ? 'SET' : 'NOT SET');
console.log('============================');

// Define ALL routes BEFORE static middleware
app.get('/test', (req, res) => {
  console.log('Test endpoint accessed');
  res.send('Server is working!');
});

app.get('/vapidPublicKey', (req, res) => {
  console.log('VAPID key endpoint accessed');
  
  const publicKey = process.env.PUBLIC_VAPID_KEY;
  if (!publicKey) {
    console.error('ERROR: VAPID public key is not configured');
    return res.status(500).send('VAPID public key is not configured');
  }
  
  console.log('Sending VAPID public key');
  res.send(publicKey);
});

// Test email endpoint
app.get('/test-email', (req, res) => {
  const mailOptions = {
    from: `"TechPulse Test" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER,
    subject: 'Test Email from TechPulse',
    text: 'This is a test email to verify the email configuration is working.',
    html: '<h1>Test Email</h1><p>This is a test email to verify the email configuration is working.</p>'
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Test Email Error:', error);
      console.error('Error Code:', error.code);
      console.error('Error Response:', error.response);
      
      if (error.code === 'EAUTH') {
        console.error('Authentication failed. Check your email and password.');
        console.error('If using Gmail, make sure "Less secure apps" is enabled or use an App Password.');
      } else if (error.code === 'ESOCKET') {
        console.error('Connection error. Check your internet connection and firewall settings.');
      }
      
      res.status(500).send(`Failed to send test email: ${error.message}`);
    } else {
      console.log('Test email sent successfully!');
      console.log('Message ID:', info.messageId);
      res.send('Test email sent successfully! Check your inbox.');
    }
  });
});

// Test notification endpoint
app.get('/test-notification', async (req, res) => {
  try {
    const subscriptions = await Subscription.find();
    console.log(`Found ${subscriptions.length} subscriptions`);
    
    if (subscriptions.length === 0) {
      return res.send('No subscriptions found. Please visit the contact page first.');
    }
    
    const payload = JSON.stringify({
      title: 'Test Notification',
      body: 'This is a test notification from TechPulse Media'
    });
    
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(subscription, payload);
        console.log('Test notification sent successfully');
      } catch (err) {
        console.error('Error sending test notification:', err);
        
        if (err.statusCode === 410) {
          console.log('Removing invalid subscription');
          await Subscription.findByIdAndDelete(subscription._id);
        }
      }
    }
    
    res.send('Test notification sent!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error sending test notification');
  }
});

app.post('/subscribe', async (req, res) => {
  try {
    console.log('Subscription request received');
    const subscription = new Subscription(req.body);
    await subscription.save();
    console.log('Subscription saved to database');
    res.status(201).json({ message: 'Subscribed successfully!' });
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ message: 'Failed to save subscription' });
  }
});

app.post('/contact', async (req, res) => {
  try {
    console.log("Contact form data received:", req.body);
    const { name, email, service, budget, deadline, message } = req.body;

    // Save to MongoDB
    const newContact = new Contact({ name, email, service, budget, deadline, message });
    await newContact.save();
    console.log('Contact form saved to database');

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
        console.error('Error Code:', error.code);
        console.error('Error Response:', error.response);
        
        if (error.code === 'EAUTH') {
          console.error('Authentication failed. Check your email and password.');
          console.error('If using Gmail, make sure "Less secure apps" is enabled or use an App Password.');
        } else if (error.code === 'ESOCKET') {
          console.error('Connection error. Check your internet connection and firewall settings.');
        }
      } else {
        console.log('Email sent successfully!');
        console.log('Message ID:', info.messageId);
      }
    });

    // Send Web Push notifications
    const payload = JSON.stringify({
      title: 'New Contact Form Submission',
      body: `From: ${name} (${email})`
    });

    // Get all subscriptions from database
    const subscriptions = await Subscription.find();
    console.log(`Found ${subscriptions.length} subscriptions to send notifications to`);
    
    // Send notifications to all subscribers
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(subscription, payload);
        console.log('Push notification sent successfully');
      } catch (err) {
        console.error('Error sending push notification:', err);
        
        // If the subscription is no longer valid, remove it from the database
        if (err.statusCode === 410) {
          console.log('Removing invalid subscription');
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

// Nodemailer setup - using EMAIL_PASSWORD from .env
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD  // Using EMAIL_PASSWORD from .env
  }
});

// Web Push Setup
const publicVapidKey = process.env.PUBLIC_VAPID_KEY;
const privateVapidKey = process.env.PRIVATE_VAPID_KEY;

if (!publicVapidKey || !privateVapidKey) {
  console.error('ERROR: VAPID keys are not set in environment variables');
} else {
  webpush.setVapidDetails(
    'mailto:' + process.env.EMAIL_USER,
    publicVapidKey,
    privateVapidKey
  );
}

// Static file middleware should come AFTER all routes
app.use(express.static(path.join(__dirname)));

// Start server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));