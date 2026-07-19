// Wood Oak Wonders - Centralized API Wrapper

const API = {
  // Products
  async getProducts(params = {}) {
    const query = new URLSearchParams();
    if (params.category_id) query.append('category_id', params.category_id);
    if (params.search) query.append('search', params.search);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    if (params.is_featured !== undefined) query.append('is_featured', params.is_featured);

    const res = await fetch(`/api/products?${query.toString()}`);
    return await res.json();
  },

  async createProduct(productData) {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });
    return await res.json();
  },

  async updateProduct(id, productData) {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });
    return await res.json();
  },

  async deleteProduct(id) {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // Categories
  async getCategories() {
    const res = await fetch('/api/categories');
    return await res.json();
  },

  async createCategory(name) {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return await res.json();
  },

  async deleteCategory(id) {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // Gallery
  async getGallery() {
    const res = await fetch('/api/gallery');
    return await res.json();
  },

  async createGalleryItem(itemData) {
    const res = await fetch('/api/gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData)
    });
    return await res.json();
  },

  async deleteGalleryItem(id) {
    const res = await fetch(`/api/gallery/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // Hero Slides
  async getHeroSlides() {
    const res = await fetch('/api/hero_slides');
    return await res.json();
  },

  async createHeroSlide(slideData) {
    const res = await fetch('/api/hero_slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slideData)
    });
    return await res.json();
  },

  async deleteHeroSlide(id) {
    const res = await fetch(`/api/hero_slides/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // Services
  async getServices() {
    const res = await fetch('/api/services');
    return await res.json();
  },

  async createService(serviceData) {
    const res = await fetch('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serviceData)
    });
    return await res.json();
  },

  async deleteService(id) {
    const res = await fetch(`/api/services/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // Testimonials
  async getTestimonials() {
    const res = await fetch('/api/testimonials');
    return await res.json();
  },

  async createTestimonial(testimonialData) {
    const res = await fetch('/api/testimonials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testimonialData)
    });
    return await res.json();
  },

  async deleteTestimonial(id) {
    const res = await fetch(`/api/testimonials/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // Enquiries
  async submitEnquiry(enquiryData) {
    const res = await fetch('/api/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enquiryData)
    });
    return await res.json();
  },

  async getEnquiries() {
    const res = await fetch('/api/enquiries');
    return await res.json();
  },

  async deleteEnquiry(id) {
    const res = await fetch(`/api/enquiries/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // Settings
  async getSettings() {
    const res = await fetch('/api/settings');
    return await res.json();
  },

  async updateSettings(settingsData) {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsData)
    });
    return await res.json();
  },

  // Auth
  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return await res.json();
  },

  async logout() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    return await res.json();
  },

  async getAuthStatus() {
    const res = await fetch('/api/auth/status');
    return await res.json();
  },

  // Stats
  async getStats() {
    const res = await fetch('/api/stats');
    return await res.json();
  },

  // Upload Images
  async uploadImages(formData) {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    return await res.json();
  },

  async forgotPassword(email) {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return await res.json();
  },

  async resetPassword(email, token, newPassword) {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, newPassword })
    });
    return await res.json();
  }
};

window.API = API;
