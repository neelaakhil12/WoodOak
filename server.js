const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup directories
const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(publicDir, 'uploads');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

// Sessions setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'wood_oak_wonders_secret_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 Hours
    httpOnly: true 
  }
}));

// Multer Storage Configuration for multiple files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
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
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const rows = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    req.session.isAdmin = true;
    req.session.username = user.username;
    res.json({ success: true, message: 'Logged in successfully', username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

app.post('/api/upload', requireAdmin, upload.array('images', 5), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  
  const urls = req.files.map(file => `/uploads/${file.filename}`);
  res.json({ success: true, urls });
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
