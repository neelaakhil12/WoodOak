const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

class SupabaseDatabaseClient {
  constructor() {
    this.type = 'supabase';
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
  }

  async connect() {
    console.log('Connected to Supabase Database Client.');
  }

  async initialize() {
    console.log('Initializing Supabase Database (checking seed)...');
    await this.seed();
  }

  async query(sql, params = []) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    
    // 1. SELECT * FROM users
    if (cleanSql.includes('SELECT * FROM users')) {
      if (cleanSql.includes('username = ?')) {
        const { data, error } = await this.supabase
          .from('users')
          .select('*')
          .eq('username', params[0]);
        if (error) throw error;
        return data || [];
      } else if (cleanSql.includes('email = ?')) {
        const { data, error } = await this.supabase
          .from('users')
          .select('*')
          .eq('email', params[0]);
        if (error) throw error;
        return data || [];
      } else {
        const { data, error } = await this.supabase.from('users').select('*');
        if (error) throw error;
        return data || [];
      }
    }

    // 2. SELECT * FROM settings
    if (cleanSql.includes('SELECT * FROM settings')) {
      if (cleanSql.includes('setting_key = ?')) {
        const { data, error } = await this.supabase
          .from('settings')
          .select('*')
          .eq('setting_key', params[0]);
        if (error) throw error;
        return data || [];
      } else {
        const { data, error } = await this.supabase.from('settings').select('*');
        if (error) throw error;
        return data || [];
      }
    }

    // 3. SELECT * FROM categories
    if (cleanSql.includes('SELECT * FROM categories')) {
      const { data, error } = await this.supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    }

    // 4. SELECT * FROM gallery
    if (cleanSql.includes('SELECT * FROM gallery')) {
      const { data, error } = await this.supabase
        .from('gallery')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    // 5. SELECT * FROM services
    if (cleanSql.includes('SELECT * FROM services')) {
      const { data, error } = await this.supabase
        .from('services')
        .select('*')
        .order('title', { ascending: true });
      if (error) throw error;
      return data || [];
    }

    // 6. SELECT * FROM testimonials
    if (cleanSql.includes('SELECT * FROM testimonials')) {
      const { data, error } = await this.supabase
        .from('testimonials')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    // 7. SELECT * FROM enquiries
    if (cleanSql.includes('SELECT * FROM enquiries')) {
      const { data, error } = await this.supabase
        .from('enquiries')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    // 8. SELECT * FROM hero_slides
    if (cleanSql.includes('SELECT * FROM hero_slides')) {
      const { data, error } = await this.supabase
        .from('hero_slides')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data || [];
    }

    // 9. Count Queries
    if (cleanSql.includes('SELECT COUNT(*)')) {
      let table = '';
      if (cleanSql.includes('FROM products')) table = 'products';
      else if (cleanSql.includes('FROM enquiries')) table = 'enquiries';
      else if (cleanSql.includes('FROM gallery')) table = 'gallery';
      else if (cleanSql.includes('FROM testimonials')) table = 'testimonials';

      if (table) {
        let query = this.supabase.from(table).select('*', { count: 'exact', head: true });
        if (table === 'enquiries' && cleanSql.includes('status = "Pending"')) {
          query = query.eq('status', 'Pending');
        }
        
        if (table === 'products') {
          return [{ count: await this.getProductCount(cleanSql, params) }];
        }

        const { count, error } = await query;
        if (error) throw error;
        return [{ count: count || 0 }];
      }
    }

    // 10. Products SELECT query (with pagination, joins, and filters)
    if (cleanSql.includes('FROM products')) {
      return await this.getProductsFiltered(cleanSql, params);
    }

    throw new Error(`Unsupported SELECT query: ${sql}`);
  }

  async run(sql, params = []) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    // 1. INSERT INTO users
    if (cleanSql.includes('INSERT INTO users')) {
      const hasEmail = cleanSql.includes('email');
      const payload = hasEmail 
        ? { email: params[0], password_hash: params[1] }
        : { username: params[0], password_hash: params[1] };
      const { data, error } = await this.supabase.from('users').insert(payload).select();
      if (error) throw error;
      return { insertId: data?.[0]?.id || 1, changes: 1 };
    }
    if (cleanSql.includes('UPDATE users SET')) {
      // Expect params: [password_hash, email]
      const { error } = await this.supabase.from('users').update({ password_hash: params[0] }).eq('email', params[1]);
      if (error) throw error;
      return { changes: 1 };
    }

    // 2. Settings (INSERT and UPDATE)
    if (cleanSql.includes('INSERT INTO settings')) {
      const { data, error } = await this.supabase.from('settings').insert({ setting_key: params[0], setting_value: params[1] }).select();
      if (error) throw error;
      return { insertId: params[0], changes: 1 };
    }
    if (cleanSql.includes('UPDATE settings SET')) {
      const { error } = await this.supabase.from('settings').update({ setting_value: params[0] }).eq('setting_key', params[1]);
      if (error) throw error;
      return { changes: 1 };
    }

    // 3. Categories (INSERT, DELETE)
    if (cleanSql.includes('INSERT INTO categories')) {
      const { data, error } = await this.supabase.from('categories').insert({ name: params[0] }).select();
      if (error) throw error;
      return { insertId: data?.[0]?.id || 1, changes: 1 };
    }
    if (cleanSql.includes('DELETE FROM categories')) {
      const { error } = await this.supabase.from('categories').delete().eq('id', params[0]);
      if (error) throw error;
      return { changes: 1 };
    }

    // 4. Products (INSERT, UPDATE, DELETE)
    if (cleanSql.includes('INSERT INTO products')) {
      const { data, error } = await this.supabase.from('products').insert({
        name: params[0],
        description: params[1],
        image_url: params[2],
        category_id: params[3],
        is_featured: params[4],
        price: params[5]
      }).select();
      if (error) throw error;
      return { insertId: data?.[0]?.id || 1, changes: 1 };
    }
    if (cleanSql.includes('UPDATE products SET')) {
      const { error } = await this.supabase.from('products').update({
        name: params[0],
        description: params[1],
        image_url: params[2],
        category_id: params[3],
        is_featured: params[4],
        price: params[5]
      }).eq('id', params[6]);
      if (error) throw error;
      return { changes: 1 };
    }
    if (cleanSql.includes('DELETE FROM products')) {
      const { error } = await this.supabase.from('products').delete().eq('id', params[0]);
      if (error) throw error;
      return { changes: 1 };
    }

    // 5. Gallery (INSERT, DELETE)
    if (cleanSql.includes('INSERT INTO gallery')) {
      const { data, error } = await this.supabase.from('gallery').insert({
        title: params[0],
        image_url: params[1],
        category: params[2]
      }).select();
      if (error) throw error;
      return { insertId: data?.[0]?.id || 1, changes: 1 };
    }
    if (cleanSql.includes('DELETE FROM gallery')) {
      const { error } = await this.supabase.from('gallery').delete().eq('id', params[0]);
      if (error) throw error;
      return { changes: 1 };
    }

    // 6. Services (INSERT, DELETE)
    if (cleanSql.includes('INSERT INTO services')) {
      const hasImg = cleanSql.includes('image_url');
      const payload = hasImg 
        ? { title: params[0], description: params[1], icon: params[2], image_url: params[3] }
        : { title: params[0], description: params[1], icon: params[2] };
      const { data, error } = await this.supabase.from('services').insert(payload).select();
      if (error) throw error;
      return { insertId: data?.[0]?.id || 1, changes: 1 };
    }
    if (cleanSql.includes('DELETE FROM services')) {
      const { error } = await this.supabase.from('services').delete().eq('id', params[0]);
      if (error) throw error;
      return { changes: 1 };
    }

    // 7. Testimonials (INSERT, DELETE)
    if (cleanSql.includes('INSERT INTO testimonials')) {
      const { data, error } = await this.supabase.from('testimonials').insert({
        name: params[0],
        role: params[1],
        review: params[2],
        rating: params[3],
        image_url: params[4]
      }).select();
      if (error) throw error;
      return { insertId: data?.[0]?.id || 1, changes: 1 };
    }
    if (cleanSql.includes('DELETE FROM testimonials')) {
      const { error } = await this.supabase.from('testimonials').delete().eq('id', params[0]);
      if (error) throw error;
      return { changes: 1 };
    }

    // 8. Enquiries (INSERT, DELETE)
    if (cleanSql.includes('INSERT INTO enquiries')) {
      const { data, error } = await this.supabase.from('enquiries').insert({
        name: params[0],
        email: params[1],
        phone: params[2],
        subject: params[3],
        message: params[4]
      }).select();
      if (error) throw error;
      return { insertId: data?.[0]?.id || 1, changes: 1 };
    }
    if (cleanSql.includes('DELETE FROM enquiries')) {
      const { error } = await this.supabase.from('enquiries').delete().eq('id', params[0]);
      if (error) throw error;
      return { changes: 1 };
    }

    // 9. Hero Slides (INSERT, DELETE)
    if (cleanSql.includes('INSERT INTO hero_slides')) {
      const { data, error } = await this.supabase.from('hero_slides').insert({
        image_url: params[0],
        sort_order: params[1]
      }).select();
      if (error) throw error;
      return { insertId: data?.[0]?.id || 1, changes: 1 };
    }
    if (cleanSql.includes('DELETE FROM hero_slides')) {
      const { error } = await this.supabase.from('hero_slides').delete().eq('id', params[0]);
      if (error) throw error;
      return { changes: 1 };
    }

    throw new Error(`Unsupported DML query: ${sql}`);
  }

  async getProductCount(sql, params) {
    let query = this.supabase.from('products').select('*');
    let paramIndex = 0;

    if (sql.includes('category_id = ?')) {
      query = query.eq('category_id', params[paramIndex++]);
    }
    if (sql.includes('is_featured = ?')) {
      query = query.eq('is_featured', params[paramIndex++]);
    }
    if (sql.includes('name LIKE ?')) {
      const searchVal = params[paramIndex].replace(/%/g, '');
      query = query.or(`name.ilike.%${searchVal}%,description.ilike.%${searchVal}%`);
      paramIndex += 2;
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ? data.length : 0;
  }

  async getProductsFiltered(sql, params) {
    let query = this.supabase.from('products').select('*, categories(name)');
    let paramIndex = 0;

    if (sql.includes('p.category_id = ?')) {
      query = query.eq('category_id', params[paramIndex++]);
    }
    if (sql.includes('p.is_featured = ?')) {
      query = query.eq('is_featured', params[paramIndex++]);
    }
    if (sql.includes('name LIKE ?')) {
      const searchVal = params[paramIndex].replace(/%/g, '');
      query = query.or(`name.ilike.%${searchVal}%,description.ilike.%${searchVal}%`);
      paramIndex += 2;
    }

    query = query.order('created_at', { ascending: false });

    if (params.length >= paramIndex + 2) {
      const limit = params[params.length - 2];
      const offset = params[params.length - 1];
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(p => ({
      ...p,
      category_name: p.categories ? p.categories.name : null
    }));
  }

  async seed() {
    console.log('Seeding Supabase Database...');

    // 1. Seed Admin User
    const email = process.env.ADMIN_EMAIL || 'kishorebabu1525@gmail.com';
    const { data: users, error: usersError } = await this.supabase.from('users').select('*').eq('email', email);
    if (usersError) {
      console.warn('Could not check users table. Make sure migrations are run.', usersError.message);
      return;
    }
    if (!users || users.length === 0) {
      const password = process.env.ADMIN_PASSWORD || 'admin123';
      const passwordHash = await bcrypt.hash(password, 10);
      
      await this.supabase.from('users').insert({
        email: email,
        password_hash: passwordHash
      });
      console.log(`Default admin user seeded in Supabase: ${email}`);
    }

    // 2. Seed Categories
    const { data: categories } = await this.supabase.from('categories').select('*');
    if (categories && categories.length === 0) {
      const cats = ['Shelves', 'Corner Stands', 'Bar Cabinets', 'Custom Furniture', 'Sofa Sets', 'Artistic Decor', 'Epoxy Tables'];
      for (const name of cats) {
        await this.supabase.from('categories').insert({ name });
      }
      console.log('Categories seeded in Supabase.');
    }

    const { data: currentCats } = await this.supabase.from('categories').select('*');
    const shelvesCatId = currentCats.find(c => c.name === 'Shelves')?.id || 1;
    const standsCatId = currentCats.find(c => c.name === 'Corner Stands')?.id || 2;
    const cabinetsCatId = currentCats.find(c => c.name === 'Bar Cabinets')?.id || 3;

    // 3. Seed Products
    const { data: products } = await this.supabase.from('products').select('*');
    if (products && products.length === 0) {
      const epoxyCatId = currentCats.find(c => c.name === 'Epoxy Tables')?.id || 7;
      const defaultProducts = [
        {
          name: 'Guitar Inspired Wooden Shelf',
          description: 'Masterfully crafted from premium hardwood, this guitar-inspired shelf is a functional work of art. Ideal for showcasing books, décor, or keepsakes. \n\nKey Features:\n🎸 Unique guitar-inspired artistic design\n🌳 Handcrafted from premium solid wood\n📚 Multiple shelves for books and decorative items\n✨ Smooth, durable, and elegant natural wood finish\n💪 Strong, stable construction built to last\n🏡 Perfect for living rooms, libraries, offices, music studios, and cafés\n🌿 Eco-friendly craftsmanship with timeless appeal',
          image_url: '/guitar_shelf.png',
          category_id: shelvesCatId,
          is_featured: 1,
          price: 0.00
        },
        {
          name: 'Premium S-Shaped Corner Stand',
          description: 'Crafted from premium hardwood with a deep glossy walnut finish, this S-curved corner stand offers two functional tiers in one sculptural form. Compact, sturdy, and endlessly versatile — a refined accent piece for living rooms, bedrooms, or entryway corners.',
          image_url: '/s_shaped_stand.png',
          category_id: standsCatId,
          is_featured: 1,
          price: 0.00
        },
        {
          name: 'Bottle Shaped Wooden Bar Cabinet',
          description: 'Luxury handcrafted wooden bottle cabinet featuring multiple storage compartments with premium polish and elegant craftsmanship. A focal point for hotels, lounges, and fine residential settings.',
          image_url: '/bar_cabinet.png',
          category_id: cabinetsCatId,
          is_featured: 1,
          price: 0.00
        },
        {
          name: 'Epoxy Art Studio',
          description: 'Where art meets function, and every piece tells a story.\n\nWe are an epoxy art studio dedicated to creating stunning, one-of-a-kind furniture and artwork that transforms spaces. By combining natural materials like wood with high-quality epoxy resin, we craft pieces that are as durable as they are beautiful—each one a unique masterpiece designed to be treasured for generations.\n\nOur Promise:\n✨ 100% Handcrafted: Every piece is meticulously made by skilled artisans.\n🎨 Bespoke Designs: We collaborate with you to bring your vision to life.\n🛡️ Premium Quality: We use only the finest materials for lasting beauty and durability.',
          image_url: '/image copy 25.png',
          category_id: epoxyCatId,
          is_featured: 1,
          price: 0.00
        }
      ];

      for (const p of defaultProducts) {
        await this.supabase.from('products').insert(p);
      }
      console.log('Products seeded in Supabase.');
    } else {
      // Ensure Epoxy Art Studio is specifically seeded if not present
      const hasEpoxy = products.some(p => p.name === 'Epoxy Art Studio');
      if (!hasEpoxy) {
        const epoxyCatId = currentCats.find(c => c.name === 'Epoxy Tables')?.id || 7;
        await this.supabase.from('products').insert({
          name: 'Epoxy Art Studio',
          description: 'Where art meets function, and every piece tells a story.\n\nWe are an epoxy art studio dedicated to creating stunning, one-of-a-kind furniture and artwork that transforms spaces. By combining natural materials like wood with high-quality epoxy resin, we craft pieces that are as durable as they are beautiful—each one a unique masterpiece designed to be treasured for generations.\n\nOur Promise:\n✨ 100% Handcrafted: Every piece is meticulously made by skilled artisans.\n🎨 Bespoke Designs: We collaborate with you to bring your vision to life.\n🛡️ Premium Quality: We use only the finest materials for lasting beauty and durability.',
          image_url: '/image copy 25.png',
          category_id: epoxyCatId,
          is_featured: 1,
          price: 0.00
        });
        console.log('Epoxy Art Studio added to products table.');
      }
    }

    // 4. Seed Services
    const { data: services } = await this.supabase.from('services').select('*');
    if (services && services.length === 0) {
      const defaultServices = [
        { title: 'Custom Wooden Furniture', description: 'Premium handcrafted furniture designed according to customer requirements.', icon: 'Hammer' },
        { title: 'Luxury Home Décor', description: 'Elegant wooden décor pieces that elevate interior spaces.', icon: 'Palette' },
        { title: 'Artistic Wooden Shelves', description: 'Creative shelves inspired by music, nature, and modern design.', icon: 'Layers' },
        { title: 'Wooden Corner Stands', description: 'Space-saving decorative stands for homes and offices.', icon: 'Grid' },
        { title: 'Wooden Bar Cabinets', description: 'Luxury handcrafted wooden cabinets for premium interiors.', icon: 'Wine' },
        { title: 'Corporate & Commercial Projects', description: 'Wooden décor solutions for offices, hotels, restaurants, and lounges.', icon: 'Briefcase' },
        { title: 'Epoxy Art Studio', description: 'Stunning one-of-a-kind furniture and artwork combining premium wood with high-quality epoxy resin.', icon: 'Sparkles' }
      ];
      for (const s of defaultServices) {
        await this.supabase.from('services').insert(s);
      }
      console.log('Services seeded in Supabase.');
    }

    // 5. Seed Testimonials
    const { data: testimonials } = await this.supabase.from('testimonials').select('*');
    if (testimonials && testimonials.length === 0) {
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
        await this.supabase.from('testimonials').insert(t);
      }
      console.log('Testimonials seeded in Supabase.');
    }

    // 6. Seed Gallery
    const { data: gallery } = await this.supabase.from('gallery').select('*');
    if (gallery && gallery.length === 0) {
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
        { title: 'Handcrafted Heritage Wooden Work', image_url: '/gallery_15.png', category: 'Custom Furniture' },
        { title: 'Premium Handcrafted L-Shaped Sofa Set', image_url: '/image copy 26.png', category: 'Sofa Sets' },
        { title: 'Luxury Curved Designer Wooden Sofa', image_url: '/image copy 27.png', category: 'Sofa Sets' },
        { title: 'Contemporary Curved Upholstered Sofa', image_url: '/image copy 28.png', category: 'Sofa Sets' },
        { title: 'Artistic Lord Krishna Wooden Wall Panel', image_url: '/image copy 29.png', category: 'Artistic Decor' },
        { title: 'Serene Meditating Buddha Wooden Relief Art', image_url: '/image copy 30.png', category: 'Artistic Decor' },
        { title: 'Magnificent Lord Shiva (Mahadev) Wooden Sculpture', image_url: '/image copy 31.png', category: 'Artistic Decor' },
        { title: 'Luxury Ocean Blue Epoxy River Table', image_url: '/image copy 24.png', category: 'Epoxy Tables' },
        { title: 'Exquisite Live Edge Wood Resin Dining Table', image_url: '/image copy 25.png', category: 'Epoxy Tables' }
      ];
      for (const g of defaultGallery) {
        await this.supabase.from('gallery').insert(g);
      }
      console.log('Gallery items seeded in Supabase.');
    }

    // 7. Seed Settings
    const { data: settings } = await this.supabase.from('settings').select('*');
    if (settings && settings.length === 0) {
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
        await this.supabase.from('settings').insert({ setting_key: key, setting_value: value });
      }
      console.log('Settings seeded in Supabase.');
    }

    // 8. Seed Hero Slides
    const { data: heroSlides } = await this.supabase.from('hero_slides').select('*');
    if (heroSlides && heroSlides.length === 0) {
      const defaultSlides = [
        { image_url: '/image copy 20.png', sort_order: 1 },
        { image_url: '/image copy 21.png', sort_order: 2 },
        { image_url: '/image copy 22.png', sort_order: 3 },
        { image_url: '/image copy 23.png', sort_order: 4 },
        { image_url: '/image copy 24.png', sort_order: 5 },
        { image_url: '/image copy 25.png', sort_order: 6 }
      ];
      for (const s of defaultSlides) {
        await this.supabase.from('hero_slides').insert(s);
      }
      console.log('Hero slides seeded in Supabase.');
    }

    // Set all existing product prices to 0 in Supabase
    await this.supabase.from('products').update({ price: 0.00 }).neq('id', 0);
    console.log('All product prices updated to 0.00 in database.');

    console.log('Supabase Database initialization completed.');
  }
}

const db = new SupabaseDatabaseClient();
db.connect().then(() => db.initialize());

module.exports = db;
