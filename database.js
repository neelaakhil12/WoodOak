const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbType = process.env.DB_TYPE || 'sqlite';
let dbInstance = null;

// Helper to check if file exists
function ensureDirExists(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirExists(dirname);
  fs.mkdirSync(dirname);
}

// Unified Database Client
class DatabaseClient {
  constructor() {
    this.type = dbType;
  }

  async connect() {
    if (this.type === 'mysql') {
      try {
        console.log('Connecting to MySQL Database...');
        // Create pool configuration
        this.pool = mysql.createPool({
          host: process.env.DB_HOST || 'localhost',
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'wood_oak_wonders',
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0
        });
        // Test connection
        const conn = await this.pool.getConnection();
        conn.release();
        console.log('MySQL Connected successfully.');
        dbInstance = this;
      } catch (err) {
        console.error('Failed to connect to MySQL database! Falling back to SQLite.', err.message);
        this.type = 'sqlite';
        await this.connectSQLite();
      }
    } else {
      await this.connectSQLite();
    }
  }

  async connectSQLite() {
    console.log('Connecting to SQLite Database...');
    const dbPath = path.join(__dirname, 'database.sqlite');
    ensureDirExists(dbPath);
    
    return new Promise((resolve, reject) => {
      this.sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('SQLite connection error:', err.message);
          reject(err);
        } else {
          console.log(`SQLite connected. Database stored at: ${dbPath}`);
          dbInstance = this;
          resolve();
        }
      });
    });
  }

  // Unified Query (mainly for SELECT, returns array of rows)
  async query(sql, params = []) {
    if (this.type === 'mysql') {
      // mysql2 returns [rows, fields]
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } else {
      return new Promise((resolve, reject) => {
        this.sqliteDb.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    }
  }

  // Unified Run (for INSERT, UPDATE, DELETE, returns { insertId, changes })
  async run(sql, params = []) {
    if (this.type === 'mysql') {
      const [result] = await this.pool.execute(sql, params);
      return {
        insertId: result.insertId,
        changes: result.affectedRows
      };
    } else {
      return new Promise((resolve, reject) => {
        this.sqliteDb.run(sql, params, function (err) {
          if (err) reject(err);
          else {
            resolve({
              insertId: this.lastID,
              changes: this.changes
            });
          }
        });
      });
    }
  }

  // Database initialization logic
  async initialize() {
    console.log('Initializing database tables...');
    
    const isMySQL = this.type === 'mysql';
    const primaryKeyAuto = isMySQL ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const textType = isMySQL ? 'LONGTEXT' : 'TEXT';

    // 1. Users Table
    await this.run(`
      CREATE TABLE IF NOT EXISTS users (
        id ${primaryKeyAuto},
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Categories Table
    await this.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id ${primaryKeyAuto},
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Products Table
    await this.run(`
      CREATE TABLE IF NOT EXISTS products (
        id ${primaryKeyAuto},
        name VARCHAR(255) NOT NULL,
        description ${textType} NOT NULL,
        image_url ${textType} NOT NULL,
        category_id INTEGER,
        is_featured INTEGER DEFAULT 0,
        price DECIMAL(10,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Services Table
    await this.run(`
      CREATE TABLE IF NOT EXISTS services (
        id ${primaryKeyAuto},
        title VARCHAR(255) NOT NULL,
        description ${textType} NOT NULL,
        icon VARCHAR(100) DEFAULT 'Wrench',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Gallery Table
    await this.run(`
      CREATE TABLE IF NOT EXISTS gallery (
        id ${primaryKeyAuto},
        title VARCHAR(255) NOT NULL,
        image_url ${textType} NOT NULL,
        category VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Testimonials Table
    await this.run(`
      CREATE TABLE IF NOT EXISTS testimonials (
        id ${primaryKeyAuto},
        name VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        review ${textType} NOT NULL,
        rating INTEGER DEFAULT 5,
        image_url ${textType},
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 7. Enquiries Table
    await this.run(`
      CREATE TABLE IF NOT EXISTS enquiries (
        id ${primaryKeyAuto},
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        message ${textType} NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 8. Settings Table (key-value storage for page sections)
    await this.run(`
      CREATE TABLE IF NOT EXISTS settings (
        setting_key VARCHAR(255) PRIMARY KEY,
        setting_value ${textType} NOT NULL
      )
    `);

    await this.seed();
  }

  async seed() {
    console.log('Seeding initial database data...');

    // 1. Seed Admin User
    const users = await this.query('SELECT * FROM users');
    if (users.length === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'admin123';
      const passwordHash = await bcrypt.hash(password, 10);
      await this.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
      console.log(`Default admin user seeded: ${username}`);
    }

    // 2. Seed Categories
    const categories = await this.query('SELECT * FROM categories');
    let shelvesCatId, standsCatId, cabinetsCatId, customCatId;
    if (categories.length === 0) {
      const cats = ['Shelves', 'Corner Stands', 'Bar Cabinets', 'Custom Furniture'];
      for (const cat of cats) {
        await this.run('INSERT INTO categories (name) VALUES (?)', [cat]);
      }
      console.log('Categories seeded.');
    }
    
    // Fetch Category IDs
    const currentCats = await this.query('SELECT * FROM categories');
    shelvesCatId = currentCats.find(c => c.name === 'Shelves')?.id || 1;
    standsCatId = currentCats.find(c => c.name === 'Corner Stands')?.id || 2;
    cabinetsCatId = currentCats.find(c => c.name === 'Bar Cabinets')?.id || 3;
    customCatId = currentCats.find(c => c.name === 'Custom Furniture')?.id || 4;

    // 3. Seed Products
    const products = await this.query('SELECT * FROM products');
    if (products.length === 0) {
      const defaultProducts = [
        {
          name: 'Guitar Inspired Wooden Shelf',
          description: 'Masterfully crafted from premium hardwood, this guitar-inspired shelf is a functional work of art. Ideal for showcasing books, décor, or keepsakes. \n\nKey Features:\n🎸 Unique guitar-inspired artistic design\n🌳 Handcrafted from premium solid wood\n📚 Multiple shelves for books and decorative items\n✨ Smooth, durable, and elegant natural wood finish\n💪 Strong, stable construction built to last\n🏡 Perfect for living rooms, libraries, offices, music studios, and cafés\n🌿 Eco-friendly craftsmanship with timeless appeal',
          image_url: '/guitar_shelf.png',
          category_id: shelvesCatId,
          is_featured: 1,
          price: 18500.00
        },
        {
          name: 'Premium S-Shaped Corner Stand',
          description: 'Crafted from premium hardwood with a deep glossy walnut finish, this S-curved corner stand offers two functional tiers in one sculptural form. Compact, sturdy, and endlessly versatile — a refined accent piece for living rooms, bedrooms, or entryway corners.',
          image_url: '/s_shaped_stand.png',
          category_id: standsCatId,
          is_featured: 1,
          price: 9800.00
        },
        {
          name: 'Bottle Shaped Wooden Bar Cabinet',
          description: 'Luxury handcrafted wooden bottle cabinet featuring multiple storage compartments with premium polish and elegant craftsmanship. A focal point for hotels, lounges, and fine residential settings.',
          image_url: '/bar_cabinet.png',
          category_id: cabinetsCatId,
          is_featured: 1,
          price: 34500.00
        }
      ];

      for (const p of defaultProducts) {
        await this.run(
          'INSERT INTO products (name, description, image_url, category_id, is_featured, price) VALUES (?, ?, ?, ?, ?, ?)',
          [p.name, p.description, p.image_url, p.category_id, p.is_featured, p.price]
        );
      }
      console.log('Featured products seeded.');
    }

    // 4. Seed Services
    const services = await this.query('SELECT * FROM services');
    if (services.length === 0) {
      const defaultServices = [
        {
          title: 'Custom Wooden Furniture',
          description: 'Premium handcrafted furniture designed according to customer requirements.',
          icon: 'Hammer'
        },
        {
          title: 'Luxury Home Décor',
          description: 'Elegant wooden décor pieces that elevate interior spaces.',
          icon: 'Palette'
        },
        {
          title: 'Artistic Wooden Shelves',
          description: 'Creative shelves inspired by music, nature, and modern design.',
          icon: 'Layers'
        },
        {
          title: 'Wooden Corner Stands',
          description: 'Space-saving decorative stands for homes and offices.',
          icon: 'Grid'
        },
        {
          title: 'Wooden Bar Cabinets',
          description: 'Luxury handcrafted wooden cabinets for premium interiors.',
          icon: 'Wine'
        },
        {
          title: 'Corporate & Commercial Projects',
          description: 'Wooden décor solutions for offices, hotels, restaurants, and lounges.',
          icon: 'Briefcase'
        }
      ];

      for (const s of defaultServices) {
        await this.run(
          'INSERT INTO services (title, description, icon) VALUES (?, ?, ?)',
          [s.title, s.description, s.icon]
        );
      }
      console.log('Services seeded.');
    }

    // 5. Seed Testimonials
    const testimonials = await this.query('SELECT * FROM testimonials');
    if (testimonials.length === 0) {
      const defaultTestimonials = [
        {
          name: 'Aarav Sharma',
          role: 'Architect, Delhi',
          review: 'The guitar shelf is an absolute masterpiece. Every single guest asks about it. The wood finish is incredibly premium and tactile. Highly recommended!',
          rating: 5,
          image_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80'
        },
        {
          name: 'Meera Patel',
          role: 'Interior Designer, Mumbai',
          review: 'Wood Oak Wonders is my go-to for premium woodcraft. The S-shaped corner stand was perfect for a client project. Sturdy, elegant, and beautifully sand-finished.',
          rating: 5,
          image_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80'
        },
        {
          name: 'Vikram Malhotra',
          role: 'Lounge Owner, Bangalore',
          review: 'We commissioned two custom bottle-shaped bar cabinets for our luxury lounge. The detail in carving, structural integrity, and deep walnut polish are extraordinary.',
          rating: 5,
          image_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80'
        }
      ];

      for (const t of defaultTestimonials) {
        await this.run(
          'INSERT INTO testimonials (name, role, review, rating, image_url) VALUES (?, ?, ?, ?, ?)',
          [t.name, t.role, t.review, t.rating, t.image_url]
        );
      }
      console.log('Testimonials seeded.');
    }

    // 6. Seed Gallery
    const gallery = await this.query('SELECT * FROM gallery');
    if (gallery.length === 0) {
      const defaultGallery = [
        { title: 'Modern Artistic Wall Shelf', image_url: '/gallery_4.png', category: 'Shelves' },
        { title: 'Classic Solid Wood Bookshelf', image_url: '/gallery_5.png', category: 'Shelves' },
        { title: 'Premium Multi-tier Plant Stand', image_url: '/gallery_6.png', category: 'Corner Stands' },
        { title: 'S-Shaped Walnut Side Table', image_url: '/gallery_7.png', category: 'Corner Stands' },
        { title: 'Bottle Silhouette Bar Cabinet', image_url: '/gallery_8.png', category: 'Bar Cabinets' },
        { title: 'Contemporary Living Room Display', image_url: '/gallery_9.png', category: 'Custom Furniture' },
        { title: 'Sleek Oak Corner Shelving Unit', image_url: '/gallery_10.png', category: 'Corner Stands' },
        { title: 'Handcarved Artisan Study Desk', image_url: '/gallery_11.png', category: 'Custom Furniture' },
        { title: 'Luxury Wine Storage Cabinet', image_url: '/gallery_12.png', category: 'Bar Cabinets' },
        { title: 'Minimalist Wooden Decor Shelf', image_url: '/gallery_13.png', category: 'Shelves' },
        { title: 'Vintage Hardwood Accent Cabinet', image_url: '/gallery_14.png', category: 'Bar Cabinets' },
        { title: 'Handcrafted Heritage Wooden Work', image_url: '/gallery_15.png', category: 'Custom Furniture' }
      ];

      for (const g of defaultGallery) {
        await this.run(
          'INSERT INTO gallery (title, image_url, category) VALUES (?, ?, ?)',
          [g.title, g.image_url, g.category]
        );
      }
      console.log('Gallery seeded.');
    }

    // 7. Seed Settings
    const settings = await this.query('SELECT * FROM settings');
    if (settings.length === 0) {
      const defaultSettings = {
        'brand_name': 'Wood Oak Wonders',
        'tagline': 'Handcrafted Wooden Masterpieces That Last Generations',
        'hero_title': 'Crafting Timeless Wooden Wonders That Become Family Heirlooms',
        'hero_subheading': 'From premium hardwood to extraordinary masterpieces, every creation is handcrafted with passion, precision, and uncompromising attention to detail.',
        'about_title': 'Welcome to Wood Oak Wonders',
        'about_description': 'Wood Oak Wonders transforms premium hardwood into handcrafted masterpieces through uncompromising craftsmanship, artistic excellence, and generations of woodworking expertise. Every grain, every curve, and every finish reflects our passion for perfection.',
        'about_mission': 'At Wood Oak Wonders, our mission is to transform premium, high-grade timber into heirloom-quality masterpieces through uncompromising craftsmanship.',
        'about_vision': 'To become India\'s most admired woodcraft brand and redefine how the world experiences handcrafted wood by creating furniture that lasts generations.',
        'about_global': 'We are proudly Indian in our soul but global in our ambition. Every international shipment receives the same attention, care, and craftsmanship as every local delivery.',
        'contact_address': 'Flat No. 4-94, Kattempudi Road, Near Sri Veda High School, Kattempudi Village, Dandamudi, Guntur District, Andhra Pradesh - 522316',
        'contact_phone': '+91 9848677678',
        'contact_email': 'info@woodoakwonders.com',
        'hours_weekdays': 'Monday - Saturday : 9:00 AM - 7:00 PM',
        'hours_sunday': 'Sunday : Closed',
        'whatsapp_number': '919848677678',
        'whatsapp_message': 'Hello Wood Oak Wonders, I would like to know more about your handcrafted wooden products.'
      };

      for (const [key, value] of Object.entries(defaultSettings)) {
        await this.run('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, value]);
      }
      console.log('Settings seeded.');
    }

    console.log('Database initialization completed.');
  }
}

const db = new DatabaseClient();
db.connect().then(() => db.initialize());

module.exports = db;
