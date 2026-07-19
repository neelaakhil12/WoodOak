const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const nodemailer = require('nodemailer');
require('dotenv').config();

const db = require('./database');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const PORT = process.env.PORT || 3000;

// Setup directories
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
const publicDir = path.join(__dirname, 'public');
const uploadsDir = isVercel ? '/tmp/uploads' : path.join(publicDir, 'uploads');

if (!isVercel) {
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} else {
  // On Vercel, only /tmp is writable
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

// On Vercel, serve /tmp/uploads via /uploads path
if (isVercel) {
  app.use('/uploads', express.static('/tmp/uploads'));
}

// Stateless Cookie-Based Session Setup (Vercel Serverless Compatible)
const crypto = require('crypto');
const SESSION_SECRET = process.env.SESSION_SECRET || 'wood_oak_wonders_secret_key_2026';

// Helper to sign a payload
function signPayload(payload, secret) {
  const payloadStr = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadStr);
  const signature = hmac.digest('hex');
  return Buffer.from(payloadStr).toString('base64') + '.' + signature;
}

// Helper to verify and parse a signed token
function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    
    const payloadStr = Buffer.from(parts[0], 'base64').toString('utf8');
    const signature = parts[1];
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadStr);
    const expectedSignature = hmac.digest('hex');
    
    if (signature === expectedSignature) {
      const payload = JSON.parse(payloadStr);
      if (payload.expires && payload.expires > Date.now()) {
        return payload;
      }
    }
  } catch (e) {
    // Ignore error
  }
  return null;
}

// Custom Session Middleware
app.use((req, res, next) => {
  const cookieHeader = req.headers.cookie || '';
  let token = '';
  const cookies = cookieHeader.split(';');
  for (let c of cookies) {
    const parts = c.trim().split('=');
    if (parts[0] === 'admin_sid') {
      token = parts[1];
      break;
    }
  }

  let sessionObj = {};
  if (token) {
    const verified = verifyToken(token, SESSION_SECRET);
    if (verified) {
      sessionObj = verified;
    }
  }

  req.session = sessionObj;

  req.session.destroy = (callback) => {
    res.clearCookie('admin_sid');
    req.session = {};
    if (callback) callback();
  };

  // Intercept response sends to auto-save session state
  const originalJson = res.json;
  res.json = function(data) {
    if (req.session && req.session.isAdmin) {
      req.session.expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      const newToken = signPayload(req.session, SESSION_SECRET);
      res.cookie('admin_sid', newToken, { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
    }
    return originalJson.apply(this, arguments);
  };

  const originalSend = res.send;
  res.send = function(data) {
    if (req.session && req.session.isAdmin) {
      req.session.expires = Date.now() + 24 * 60 * 60 * 1000;
      const newToken = signPayload(req.session, SESSION_SECRET);
      res.cookie('admin_sid', newToken, { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
    }
    return originalSend.apply(this, arguments);
  };

  next();
});

// Multer Storage Configuration (in-memory for Cloudinary upload streaming)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Authentication middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Admin access required' });
  }
}

// ================= AUTHENTICATION APIs =================

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const rows = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.isAdmin = true;
    req.session.username = user.email;
    res.json({ success: true, message: 'Logged in successfully', username: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Temporary in-memory token store (email -> { token, expires })
const resetsStore = new Map();

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const rows = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Admin account with this email not found' });
    }

    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    resetsStore.set(email.toLowerCase(), {
      token,
      expires: Date.now() + 15 * 60 * 1000 // 15 minutes
    });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });

    const resetLink = `http://localhost:3000/adminlogin?action=reset&email=${encodeURIComponent(email)}&token=${token}`;

    const mailOptions = {
      from: process.env.SMTP_FROM || `"Wood Oak Wonders" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Reset Password Link - Wood Oak Wonders Admin',
      text: `Click this link to reset your admin password: ${resetLink}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0B192C; text-align: center;">Reset Admin Password</h2>
          <p>Hello,</p>
          <p>We received a request to reset your admin account password for <strong>Wood Oak Wonders</strong>.</p>
          <p>Click the button below to choose a new password. This link is valid for 15 minutes:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #0B192C; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Or copy and paste this URL into your browser:</p>
          <p style="color: #3b82f6; font-size: 13px; word-break: break-all;"><a href="${resetLink}">${resetLink}</a></p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">Wood Oak Wonders &copy; 2026</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Password reset link sent to your email successfully.' });
  } catch (err) {
    console.error('Error in forgot-password:', err);
    res.status(500).json({ error: 'Failed to send recovery email. Details: ' + err.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'All fields (email, token, new password) are required' });
  }

  const record = resetsStore.get(email.toLowerCase());
  if (!record) {
    return res.status(400).json({ error: 'No active reset request found for this email' });
  }

  if (record.token !== token) {
    return res.status(400).json({ error: 'Invalid reset token' });
  }

  if (record.expires < Date.now()) {
    resetsStore.delete(email.toLowerCase());
    return res.status(400).json({ error: 'Reset token has expired' });
  }

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE email = ?', [hashed, email.toLowerCase()]);
    
    resetsStore.delete(email.toLowerCase());
    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password: ' + err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Failed to log out' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

app.get('/api/auth/status', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json({ loggedIn: true, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

// ================= DYNAMIC SETTINGS APIs =================

app.get('/api/settings', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM settings');
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  const settingsData = req.body; // Expects object e.g., { brand_name: 'WOW', tagline: '...' }
  try {
    for (const [key, value] of Object.entries(settingsData)) {
      // Check if exists
      const exist = await db.query('SELECT * FROM settings WHERE setting_key = ?', [key]);
      if (exist.length > 0) {
        await db.run('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [value, key]);
      } else {
        await db.run('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, value]);
      }
    }
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= CATEGORY APIs =================

app.get('/api/categories', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  try {
    const result = await db.run('INSERT INTO categories (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= PRODUCT APIs =================

app.get('/api/products', async (req, res) => {
  const { category_id, search, page = 1, limit = 9, is_featured } = req.query;
  const offset = (page - 1) * limit;

  let queryStr = `
    SELECT p.*, c.name as category_name 
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (category_id) {
    queryStr += ' AND p.category_id = ?';
    params.push(category_id);
  }

  if (is_featured !== undefined) {
    queryStr += ' AND p.is_featured = ?';
    params.push(parseInt(is_featured));
  }

  if (search) {
    queryStr += ' AND (p.name LIKE ? OR p.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  queryStr += ' ORDER BY p.created_at DESC';

  // Count query for pagination
  let countQueryStr = `
    SELECT COUNT(*) as count 
    FROM products p
    WHERE 1=1
  `;
  const countParams = [...params];

  if (category_id) {
    countQueryStr += ' AND p.category_id = ?';
  }
  if (is_featured !== undefined) {
    countQueryStr += ' AND p.is_featured = ?';
  }
  if (search) {
    countQueryStr += ' AND (p.name LIKE ? OR p.description LIKE ?)';
  }

  // Append pagination to actual query
  queryStr += ' LIMIT ? OFFSET ?';
  // Standard conversion to integers for safety
  params.push(parseInt(limit), parseInt(offset));

  try {
    const products = await db.query(queryStr, params);
    const countResult = await db.query(countQueryStr, countParams);
    const totalCount = countResult[0].count;

    res.json({
      products,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', requireAdmin, async (req, res) => {
  const { name, description, image_url, category_id, is_featured, price } = req.body;
  if (!name || !description || !image_url) {
    return res.status(400).json({ error: 'Name, description, and image URL are required' });
  }
  try {
    const result = await db.run(
      'INSERT INTO products (name, description, image_url, category_id, is_featured, price) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description, image_url, category_id || null, is_featured ? 1 : 0, price || 0.00]
    );
    res.status(201).json({ id: result.insertId, name, description, image_url, category_id, is_featured, price });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const { name, description, image_url, category_id, is_featured, price } = req.body;
  try {
    await db.run(
      'UPDATE products SET name = ?, description = ?, image_url = ?, category_id = ?, is_featured = ?, price = ? WHERE id = ?',
      [name, description, image_url, category_id || null, is_featured ? 1 : 0, price || 0.00, req.params.id]
    );
    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= GALLERY APIs =================

app.get('/api/gallery', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM gallery ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gallery', requireAdmin, async (req, res) => {
  const { title, image_url, category } = req.body;
  if (!title || !image_url || !category) {
    return res.status(400).json({ error: 'Title, image URL, and category are required' });
  }
  try {
    const result = await db.run(
      'INSERT INTO gallery (title, image_url, category) VALUES (?, ?, ?)',
      [title, image_url, category]
    );
    res.status(201).json({ id: result.insertId, title, image_url, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/gallery/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM gallery WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Gallery item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= SERVICES APIs =================

app.get('/api/services', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM services ORDER BY title ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/services', requireAdmin, async (req, res) => {
  const { title, description, icon } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }
  try {
    const result = await db.run(
      'INSERT INTO services (title, description, icon) VALUES (?, ?, ?)',
      [title, description, icon || 'Wrench']
    );
    res.status(201).json({ id: result.insertId, title, description, icon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/services/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM services WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= TESTIMONIAL APIs =================

app.get('/api/testimonials', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM testimonials ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/testimonials', requireAdmin, async (req, res) => {
  const { name, role, review, rating, image_url } = req.body;
  if (!name || !role || !review) {
    return res.status(400).json({ error: 'Name, role, and review are required' });
  }
  try {
    const result = await db.run(
      'INSERT INTO testimonials (name, role, review, rating, image_url) VALUES (?, ?, ?, ?, ?)',
      [name, role, review, rating || 5, image_url || null]
    );
    res.status(201).json({ id: result.insertId, name, role, review, rating, image_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/testimonials/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM testimonials WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Testimonial deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= ENQUIRIES (CONTACT FORM) APIs =================

app.get('/api/enquiries', requireAdmin, async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM enquiries ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/enquiries', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !phone || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    await db.run(
      'INSERT INTO enquiries (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone, subject, message]
    );
    res.status(201).json({ success: true, message: 'Your enquiry has been submitted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/enquiries/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM enquiries WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Enquiry deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= DASHBOARD STATISTICS API =================

app.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    const productsCount = await db.query('SELECT COUNT(*) as count FROM products');
    const enquiriesCount = await db.query('SELECT COUNT(*) as count FROM enquiries WHERE status = "Pending"');
    const galleryCount = await db.query('SELECT COUNT(*) as count FROM gallery');
    const testimonialsCount = await db.query('SELECT COUNT(*) as count FROM testimonials');
    
    res.json({
      totalProducts: productsCount[0].count,
      pendingEnquiries: enquiriesCount[0].count,
      totalGallery: galleryCount[0].count,
      totalTestimonials: testimonialsCount[0].count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= FILE UPLOAD API (SUPPORT MULTIPLE IMAGES) =================

app.post('/api/upload', requireAdmin, upload.array('images', 5), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  
  try {
    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'wood_oak_wonders' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });
    });

    const urls = await Promise.all(uploadPromises);
    res.json({ success: true, urls });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload to Cloudinary: ' + err.message });
  }
});

// ================= HERO SLIDES APIs =================

app.get('/api/hero_slides', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM hero_slides ORDER BY sort_order ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hero_slides', requireAdmin, async (req, res) => {
  const { image_url, sort_order } = req.body;
  if (!image_url) {
    return res.status(400).json({ error: 'Image URL is required' });
  }
  try {
    const result = await db.run(
      'INSERT INTO hero_slides (image_url, sort_order) VALUES (?, ?)',
      [image_url, sort_order || 0]
    );
    res.status(201).json({ id: result.insertId, image_url, sort_order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/hero_slides/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM hero_slides WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Hero slide deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Panel Access Route (serves public/admin.html)
app.get('/adminlogin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// Redirect direct requests from admin.html to adminlogin
app.get('/admin.html', (req, res) => {
  res.redirect('/adminlogin');
});

// Fallback for SPA routing if needed (optional)
app.get('*', (req, res, next) => {
  // If requesting api routes, do not serve html
  if (req.url.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Wood Oak Wonders Server is running on http://localhost:${PORT}`);
});
