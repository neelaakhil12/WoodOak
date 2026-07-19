// Wood Oak Wonders - Admin Console Client Logic

let currentSection = 'dashboard';
let categoriesList = [];

// Product list pagination state
let productPage = 1;
let productLimit = 8;
let productPagesCount = 1;

// Image source modes
let productImgSrcMode = 'file'; // 'url' or 'file'
let galleryImgSrcMode = 'file';  // 'url' or 'file'

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide Icons
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Check login status
  await checkSession();

  // Login Form Submission
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.classList.add('hidden');
      const email = document.getElementById('login-email').value;
      const p = document.getElementById('login-password').value;

      try {
        const res = await API.login(email, p);
        if (res.success) {
          loginForm.reset();
          await checkSession();
        } else {
          throw new Error(res.error || 'Invalid credentials');
        }
      } catch (err) {
        loginError.textContent = err.message || 'Login failed';
        loginError.classList.remove('hidden');
      }
    });
  }

  // Forgot Password / Reset Password Card Switching & Forms
  const loginCard = document.getElementById('login-card');
  const forgotCard = document.getElementById('forgot-card');
  const resetCard = document.getElementById('reset-card');
  
  const forgotTrigger = document.getElementById('forgot-password-trigger');
  const forgotBackBtn = document.getElementById('forgot-back-btn');
  const forgotForm = document.getElementById('forgot-form');
  const forgotError = document.getElementById('forgot-error');
  const forgotSuccess = document.getElementById('forgot-success');
  const forgotSubmitBtn = document.getElementById('forgot-submit-btn');

  const resetForm = document.getElementById('reset-form');
  const resetError = document.getElementById('reset-error');
  const resetSuccess = document.getElementById('reset-success');

  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  const emailParam = urlParams.get('email');
  const tokenParam = urlParams.get('token');

  if (action === 'reset' && emailParam && tokenParam) {
    if (loginCard) loginCard.classList.add('hidden');
    if (forgotCard) forgotCard.classList.add('hidden');
    if (resetCard) resetCard.classList.remove('hidden');
  }

  if (forgotTrigger) {
    forgotTrigger.addEventListener('click', () => {
      loginCard.classList.add('hidden');
      forgotCard.classList.remove('hidden');
      forgotForm.reset();
      forgotError.classList.add('hidden');
      forgotSuccess.classList.add('hidden');
    });
  }

  if (forgotBackBtn) {
    forgotBackBtn.addEventListener('click', () => {
      forgotCard.classList.add('hidden');
      loginCard.classList.remove('hidden');
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      forgotError.classList.add('hidden');
      forgotSuccess.classList.add('hidden');
      const email = document.getElementById('forgot-email').value;

      forgotSubmitBtn.disabled = true;
      forgotSubmitBtn.textContent = 'Sending Link...';

      try {
        const res = await API.forgotPassword(email);
        if (res.success) {
          forgotSuccess.textContent = res.message;
          forgotSuccess.classList.remove('hidden');
          forgotForm.reset();
        } else {
          throw new Error(res.error || 'Failed to send recovery email.');
        }
      } catch (err) {
        forgotError.textContent = err.message || 'Verification link dispatch failed';
        forgotError.classList.remove('hidden');
      } finally {
        forgotSubmitBtn.disabled = false;
        forgotSubmitBtn.textContent = 'Send Reset Link';
      }
    });
  }

  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      resetError.classList.add('hidden');
      resetSuccess.classList.add('hidden');

      const newPassword = document.getElementById('reset-password-input').value;
      const confirmPassword = document.getElementById('reset-confirm-password').value;

      if (newPassword !== confirmPassword) {
        resetError.textContent = 'Passwords do not match!';
        resetError.classList.remove('hidden');
        return;
      }

      try {
        const res = await API.resetPassword(emailParam, tokenParam, newPassword);
        if (res.success) {
          resetSuccess.textContent = res.message + ' Redirecting to login...';
          resetSuccess.classList.remove('hidden');
          resetForm.reset();
          
          setTimeout(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
            resetCard.classList.add('hidden');
            if (loginCard) loginCard.classList.remove('hidden');
          }, 3000);
        } else {
          throw new Error(res.error || 'Reset password failed.');
        }
      } catch (err) {
        resetError.textContent = err.message || 'Could not reset password';
        resetError.classList.remove('hidden');
      }
    });
  }

  // Logout Click
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await API.logout();
        await checkSession();
      } catch (err) {
        console.error('Logout error:', err);
      }
    });
  }

  // Sidebar link toggles
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => {
        l.classList.remove('bg-brand-primary', 'text-white', 'active');
        l.classList.add('hover:bg-gray-800');
      });
      link.classList.remove('hover:bg-gray-800');
      link.classList.add('bg-brand-primary', 'text-white', 'active');

      const target = link.getAttribute('data-section');
      switchSection(target);
    });
  });

  // Category Add Form Submit
  const categoryForm = document.getElementById('category-form');
  if (categoryForm) {
    categoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('category-name').value;
      try {
        await API.createCategory(name);
        categoryForm.reset();
        await loadCategoriesData();
      } catch (e) {
        alert('Failed to save category');
      }
    });
  }

  // Gallery Add Form Submit
  const galleryForm = document.getElementById('gallery-form');
  if (galleryForm) {
    galleryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('gallery-title').value;
      const category = document.getElementById('gallery-category').value;
      let image_url = '';

      if (galleryImgSrcMode === 'file') {
        const fileInput = document.getElementById('gallery-img-file');
        if (fileInput.files.length === 0) {
          alert('Please select an image file to upload.');
          return;
        }
        const fd = new FormData();
        fd.append('images', fileInput.files[0]);
        const uploadRes = await API.uploadImages(fd);
        if (uploadRes.success) {
          image_url = uploadRes.urls[0];
        } else {
          alert('Upload failed: ' + uploadRes.error);
          return;
        }
      } else {
        image_url = document.getElementById('gallery-img-url').value;
      }

      try {
        await API.createGalleryItem({ title, category, image_url });
        galleryForm.reset();
        // Reset file inputs
        document.getElementById('gallery-img-file').value = '';
        await loadGalleryData();
      } catch (err) {
        alert('Failed to save gallery item');
      }
    });
  }

  // Service Add Form Submit
  const servicesForm = document.getElementById('services-form');
  if (servicesForm) {
    servicesForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('service-title').value;
      const description = document.getElementById('service-description').value;
      const icon = document.getElementById('service-icon').value;
      let image_url = '';

      if (serviceImgSrcMode === 'file') {
        const fileInput = document.getElementById('service-img-file');
        if (fileInput.files.length > 0) {
          const fd = new FormData();
          fd.append('images', fileInput.files[0]);
          const uploadRes = await API.uploadImages(fd);
          if (uploadRes.success) {
            image_url = uploadRes.urls[0];
          } else {
            alert('Upload failed: ' + uploadRes.error);
            return;
          }
        }
      } else {
        image_url = document.getElementById('service-img-url').value;
      }

      try {
        await API.createService({ title, description, icon, image_url });
        servicesForm.reset();
        document.getElementById('service-img-file').value = '';
        await loadServicesData();
      } catch (err) {
        alert('Failed to save service');
      }
    });
  }

  // Testimonial Add Form Submit
  const testimonialForm = document.getElementById('testimonial-form');
  if (testimonialForm) {
    testimonialForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('testi-name').value;
      const role = document.getElementById('testi-role').value;
      const review = document.getElementById('testi-review').value;
      const rating = parseInt(document.getElementById('testi-rating').value);
      const image_url = document.getElementById('testi-avatar').value;

      try {
        await API.createTestimonial({ name, role, review, rating, image_url });
        testimonialForm.reset();
        await loadTestimonialsData();
      } catch (err) {
        alert('Failed to save testimonial');
      }
    });
  }

  // Page Settings Form Submit
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertBox = document.getElementById('settings-alert');
      alertBox.classList.add('hidden');

      const data = {
        brand_name: document.getElementById('set-brand-name').value,
        tagline: document.getElementById('set-brand-tagline').value,
        contact_phone: document.getElementById('set-phone').value,
        contact_email: document.getElementById('set-email').value,
        whatsapp_number: document.getElementById('set-whatsapp-num').value,
        whatsapp_message: document.getElementById('set-whatsapp-msg').value,
        contact_address: document.getElementById('set-address').value,
        hours_weekdays: document.getElementById('set-hours-weekdays').value,
        hours_sunday: document.getElementById('set-hours-sunday').value
      };

      try {
        const res = await API.updateSettings(data);
        if (res.success) {
          alertBox.textContent = 'Settings updated successfully';
          alertBox.classList.remove('hidden');
          // Scroll to top of panel
          alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } catch (err) {
        alert('Settings update failed');
      }
    });
  }

  // Product Search / Filter list events
  const prodSearch = document.getElementById('product-search');
  if (prodSearch) {
    prodSearch.addEventListener('input', () => {
      productPage = 1;
      loadProductsData();
    });
  }
  const prodCatFilter = document.getElementById('product-filter-category');
  if (prodCatFilter) {
    prodCatFilter.addEventListener('change', () => {
      productPage = 1;
      loadProductsData();
    });
  }

  // Product Pagination Buttons
  const btnPrev = document.getElementById('product-prev-page');
  const btnNext = document.getElementById('product-next-page');
  if (btnPrev && btnNext) {
    btnPrev.addEventListener('click', () => {
      if (productPage > 1) {
        productPage--;
        loadProductsData();
      }
    });
    btnNext.addEventListener('click', () => {
      if (productPage < productPagesCount) {
        productPage++;
        loadProductsData();
      }
    });
  }

  // Product Form modal submit
  const productForm = document.getElementById('product-form');
  if (productForm) {
    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('prod-id').value;
      const name = document.getElementById('prod-name').value;
      const category_id = parseInt(document.getElementById('prod-category').value) || null;
      const price = parseFloat(document.getElementById('prod-price').value);
      const description = document.getElementById('prod-description').value;
      const is_featured = document.getElementById('prod-featured').checked ? 1 : 0;
      let image_url = '';

      if (productImgSrcMode === 'file') {
        const fileInput = document.getElementById('prod-img-file');
        if (fileInput.files.length === 0 && !id) {
          alert('Please select files to upload.');
          return;
        }

        if (fileInput.files.length > 0) {
          const fd = new FormData();
          for (let i = 0; i < fileInput.files.length; i++) {
            fd.append('images', fileInput.files[i]);
          }
          const uploadRes = await API.uploadImages(fd);
          if (uploadRes.success) {
            image_url = uploadRes.urls[0]; // Primary thumbnail
          } else {
            alert('Upload failed: ' + uploadRes.error);
            return;
          }
        } else {
          // If editing and no new files selected, keep existing url
          image_url = document.getElementById('prod-img-url').value;
        }
      } else {
        image_url = document.getElementById('prod-img-url').value;
      }

      const productPayload = { name, category_id, price, description, is_featured, image_url };

      try {
        let res;
        if (id) {
          res = await API.updateProduct(id, productPayload);
        } else {
          res = await API.createProduct(productPayload);
        }
        if (res.success || res.id) {
          alert('Product uploaded successfully!');
          closeProductForm();
          loadProductsData();
        } else {
          alert(res.error || 'Failed to save product');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to save product due to connection issue.');
      }
    });
  }
});

// Check Session Authentication
async function checkSession() {
  try {
    const status = await API.getAuthStatus();
    const overlay = document.getElementById('login-overlay');
    const layout = document.getElementById('admin-layout');

    if (status.loggedIn) {
      overlay.classList.add('hidden');
      layout.classList.remove('hidden');
      document.getElementById('user-status').textContent = `Logged in as ${status.username}`;
      
      // Load initial dashboard data
      switchSection(currentSection);
      await loadGlobalData();
    } else {
      overlay.classList.remove('hidden');
      layout.classList.add('hidden');
    }
  } catch (err) {
    console.error('Failed checking credentials session:', err);
  }
}

// Global cached categories/stats loaded on auth
async function loadGlobalData() {
  try {
    categoriesList = await API.getCategories();
    
    // Populate select boxes in forms
    const categorySelect = document.getElementById('prod-category');
    const categoryFilter = document.getElementById('product-filter-category');
    const galleryCatSelect = document.getElementById('gallery-category');
    
    if (categorySelect && categorySelect.tagName === 'SELECT' && categoryFilter) {
      categorySelect.innerHTML = '';
      categoryFilter.innerHTML = '<option value="">All Categories</option>';

      categoriesList.forEach(c => {
        categorySelect.insertAdjacentHTML('beforeend', `<option value="${c.id}">${c.name}</option>`);
        categoryFilter.insertAdjacentHTML('beforeend', `<option value="${c.id}">${c.name}</option>`);
      });
    }

    if (galleryCatSelect) {
      galleryCatSelect.innerHTML = '';
      categoriesList.forEach(c => {
        galleryCatSelect.insertAdjacentHTML('beforeend', `<option value="${c.name}">${c.name}</option>`);
      });
    }
  } catch (e) {
    console.error('Error seeding category select lists:', e);
  }
}

// Section Switching Panel Router
function switchSection(target) {
  currentSection = target;
  
  // Hide all sections
  const sections = document.querySelectorAll('.admin-section');
  sections.forEach(s => s.classList.add('hidden'));

  // Show target section
  const sectionEl = document.getElementById(`section-${target}`);
  if (sectionEl) sectionEl.classList.remove('hidden');

  // Update header text
  const sectionTitle = document.getElementById('section-title');
  if (sectionTitle) {
    let title = target.charAt(0).toUpperCase() + target.slice(1);
    if (target === 'products') title = 'Services';
    if (target === 'services') title = 'Service Cards';
    sectionTitle.textContent = title;
  }

  // Load specific section records
  if (target === 'dashboard') loadDashboardStats();
  if (target === 'products') loadProductsData();
  if (target === 'categories') loadCategoriesData();
  if (target === 'gallery') loadGalleryData();
  if (target === 'heroslides') loadHeroSlidesData();
  if (target === 'services') loadServicesData();
  if (target === 'testimonials') loadTestimonialsData();
  if (target === 'settings') loadSettingsData();
  if (target === 'inquiries') loadInquiriesData();
}

// ================= SECTION: DASHBOARD DATA =================

async function loadDashboardStats() {
  const table = document.getElementById('recent-inquiries-table');
  try {
    const stats = await API.getStats();
    document.getElementById('stat-products').textContent = stats.totalProducts;
    document.getElementById('stat-inquiries').textContent = stats.pendingEnquiries;
    document.getElementById('stat-gallery').textContent = stats.totalGallery;
    document.getElementById('stat-testimonials').textContent = stats.totalTestimonials;

    // Load recent inquiries
    const enquiries = await API.getEnquiries();
    if (table) {
      table.innerHTML = '';
      const recent = enquiries.slice(0, 5); // Limit to top 5
      
      if (recent.length === 0) {
        table.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-gray-400">No customer inquiries submitted yet.</td></tr>';
        return;
      }

      recent.forEach(e => {
        const dateStr = new Date(e.created_at).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });
        table.insertAdjacentHTML('beforeend', `
          <tr class="border-b border-gray-100 hover:bg-gray-50 text-gray-600 font-medium">
            <td class="py-3 pr-4 whitespace-nowrap">${dateStr}</td>
            <td class="py-3 px-4 font-bold text-gray-900">${e.name}</td>
            <td class="py-3 px-4">${e.email}<br><span class="text-gray-400 font-light">${e.phone}</span></td>
            <td class="py-3 px-4 font-semibold text-brand-primary">${e.subject}</td>
            <td class="py-3 px-4 max-w-xs truncate">${e.message}</td>
          </tr>
        `);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

// ================= SECTION: PRODUCTS DATA =================

async function loadProductsData() {
  const container = document.getElementById('products-table-body');
  if (!container) return;

  const filters = {
    page: productPage,
    limit: productLimit,
    search: document.getElementById('product-search').value,
    category_id: document.getElementById('product-filter-category').value
  };

  try {
    const data = await API.getProducts(filters);
    container.innerHTML = '';

    if (!data.products || data.products.length === 0) {
      container.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-gray-400">No products match search criteria.</td></tr>';
      return;
    }

    productPagesCount = data.pagination.pages;
    document.getElementById('product-pagination-info').textContent = `Showing page ${productPage} of ${productPagesCount} (${data.pagination.total} products)`;
    
    // Disable navigation buttons appropriately
    document.getElementById('product-prev-page').disabled = productPage === 1;
    document.getElementById('product-next-page').disabled = productPage === productPagesCount;

    data.products.forEach(p => {
      const featuredBadge = p.is_featured === 1 
        ? `<span class="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Yes</span>` 
        : `<span class="bg-gray-100 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">No</span>`;

      const rowHtml = `
        <tr class="border-b border-gray-100 hover:bg-gray-50 text-gray-600 font-medium">
          <td class="py-3 px-6"><img src="${p.image_url}" alt="" class="w-10 h-10 object-cover rounded-lg border border-brand-border bg-gray-50"></td>
          <td class="py-3 px-4 font-bold text-gray-900">${p.name}</td>
          <td class="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-brand-primary">${p.category_name || 'Uncategorized'}</td>
          <td class="py-3 px-4 text-center">${featuredBadge}</td>
          <td class="py-3 px-6 text-right space-x-2 whitespace-nowrap">
            <button onclick="editProduct(${JSON.stringify(p).replace(/"/g, '&quot;')})" class="text-brand-primary hover:text-brand-secondary p-1" title="Edit Product"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
            <button onclick="deleteProduct(${p.id})" class="text-red-500 hover:text-red-700 p-1" title="Delete Product"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </td>
        </tr>
      `;
      container.insertAdjacentHTML('beforeend', rowHtml);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    console.error(err);
  }
}

// Product Form Modal operations
function openProductForm() {
  document.getElementById('product-form').reset();
  document.getElementById('prod-id').value = '';
  document.getElementById('product-form-title').textContent = 'Add Handcrafted Service';
  switchProductImgSrc('file');

  const modal = document.getElementById('product-form-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeProductForm() {
  const modal = document.getElementById('product-form-modal');
  modal.classList.remove('flex');
  modal.classList.add('hidden');
}

function switchProductImgSrc(mode) {
  productImgSrcMode = mode;
  const urlBtn = document.getElementById('prod-src-url-btn');
  const fileBtn = document.getElementById('prod-src-file-btn');
  
  const urlBox = document.getElementById('prod-img-url-box');
  const fileBox = document.getElementById('prod-img-file-box');

  if (!urlBtn || !fileBtn || !urlBox || !fileBox) return;

  if (mode === 'url') {
    urlBtn.className = "flex-1 bg-brand-primary text-white px-3 py-1 rounded-lg text-[10px] font-bold";
    fileBtn.className = "flex-1 bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-[10px] font-bold";
    urlBox.classList.remove('hidden');
    fileBox.classList.add('hidden');
  } else {
    fileBtn.className = "flex-1 bg-brand-primary text-white px-3 py-1 rounded-lg text-[10px] font-bold";
    urlBtn.className = "flex-1 bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-[10px] font-bold";
    fileBox.classList.remove('hidden');
    urlBox.classList.add('hidden');
  }
}

function editProduct(product) {
  document.getElementById('product-form').reset();
  document.getElementById('product-form-title').textContent = 'Edit Handcrafted Service';
  
  document.getElementById('prod-id').value = product.id;
  document.getElementById('prod-name').value = product.name;
  document.getElementById('prod-category').value = product.category_id || '';
  document.getElementById('prod-price').value = Math.round(product.price || 0);
  document.getElementById('prod-description').value = product.description;
  document.getElementById('prod-featured').checked = product.is_featured === 1;

  // Set file values
  switchProductImgSrc('file');
  document.getElementById('prod-img-url').value = product.image_url;

  const modal = document.getElementById('product-form-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function deleteProduct(id) {
  if (confirm('Are you sure you want to permanently delete this masterpiece product from your database?')) {
    try {
      const res = await API.deleteProduct(id);
      if (res.success) {
        await loadProductsData();
      }
    } catch (err) {
      alert('Delete failed');
    }
  }
}

// ================= SECTION: CATEGORIES DATA =================

async function loadCategoriesData() {
  const container = document.getElementById('categories-table-body');
  if (!container) return;
  try {
    const list = await API.getCategories();
    container.innerHTML = '';
    
    if (list.length === 0) {
      container.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-gray-400">No categories added yet.</td></tr>';
      return;
    }

    list.forEach(c => {
      container.insertAdjacentHTML('beforeend', `
        <tr class="border-b border-gray-100 hover:bg-gray-50 text-gray-600 font-medium">
          <td class="py-3 px-6 text-gray-400 font-light">${c.id}</td>
          <td class="py-3 px-4 font-bold text-gray-900">${c.name}</td>
          <td class="py-3 px-6 text-right">
            <button onclick="deleteCategory(${c.id})" class="text-red-500 hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </td>
        </tr>
      `);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
    await loadGlobalData(); // refresh select cache
  } catch (err) {
    console.error(err);
  }
}

async function deleteCategory(id) {
  if (confirm('Are you sure you want to delete this category? Products in this category will display as uncategorized.')) {
    try {
      const res = await API.deleteCategory(id);
      if (res.success) loadCategoriesData();
    } catch (e) {
      alert('Delete failed');
    }
  }
}

// ================= SECTION: GALLERY DATA =================

async function loadGalleryData() {
  const container = document.getElementById('gallery-table-body');
  if (!container) return;
  try {
    const list = await API.getGallery();
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-gray-400">No gallery images uploaded.</td></tr>';
      return;
    }

    list.forEach(g => {
      container.insertAdjacentHTML('beforeend', `
        <tr class="border-b border-gray-100 hover:bg-gray-50 text-gray-600 font-medium">
          <td class="py-3 px-6"><img src="${g.image_url}" class="w-10 h-10 object-cover rounded-lg border border-brand-border"></td>
          <td class="py-3 px-4 font-bold text-gray-900">${g.title}</td>
          <td class="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-brand-primary">${g.category}</td>
          <td class="py-3 px-6 text-right">
            <button onclick="deleteGallery(${g.id})" class="text-red-500 hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </td>
        </tr>
      `);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    console.error(err);
  }
}

function switchGalleryImgSrc(mode) {
  galleryImgSrcMode = mode;
  const urlBtn = document.getElementById('gallery-src-url-btn');
  const fileBtn = document.getElementById('gallery-src-file-btn');
  
  const urlBox = document.getElementById('gallery-img-url-box');
  const fileBox = document.getElementById('gallery-img-file-box');

  if (!urlBtn || !fileBtn || !urlBox || !fileBox) return;

  if (mode === 'url') {
    urlBtn.className = "flex-1 bg-brand-primary text-white px-3 py-1 rounded-lg text-[10px] font-bold";
    fileBtn.className = "flex-1 bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-[10px] font-bold";
    urlBox.classList.remove('hidden');
    fileBox.classList.add('hidden');
  } else {
    fileBtn.className = "flex-1 bg-brand-primary text-white px-3 py-1 rounded-lg text-[10px] font-bold";
    urlBtn.className = "flex-1 bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-[10px] font-bold";
    fileBox.classList.remove('hidden');
    urlBox.classList.add('hidden');
  }
}

async function deleteGallery(id) {
  if (confirm('Delete this gallery item?')) {
    try {
      await API.deleteGalleryItem(id);
      loadGalleryData();
    } catch (e) {
      alert('Delete failed');
    }
  }
}

// ================= SECTION: SERVICES DATA =================

async function loadServicesData() {
  const container = document.getElementById('services-table-body');
  if (!container) return;
  try {
    const list = await API.getServices();
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-gray-400">No custom service cards configured.</td></tr>';
      return;
    }

    list.forEach(s => {
      const previewHtml = s.image_url 
        ? `<img src="${s.image_url}" class="w-10 h-10 object-cover rounded-lg border border-brand-border bg-gray-50">`
        : `<i data-lucide="${s.icon.toLowerCase()}" class="w-5 h-5"></i>`;

      container.insertAdjacentHTML('beforeend', `
        <tr class="border-b border-gray-100 hover:bg-gray-50 text-gray-600 font-medium">
          <td class="py-3 px-6 text-brand-primary font-bold flex items-center h-16">${previewHtml}</td>
          <td class="py-3 px-4 font-bold text-gray-900">${s.title}</td>
          <td class="py-3 px-4 text-xs font-light max-w-xs truncate">${s.description}</td>
          <td class="py-3 px-6 text-right">
            <button onclick="deleteService(${s.id})" class="text-red-500 hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </td>
        </tr>
      `);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    console.error(err);
  }
}

async function deleteService(id) {
  if (confirm('Are you sure you want to delete this service card?')) {
    try {
      await API.deleteService(id);
      loadServicesData();
    } catch (e) {
      alert('Delete failed');
    }
  }
}

// ================= SECTION: TESTIMONIALS DATA =================

async function loadTestimonialsData() {
  const container = document.getElementById('testimonials-table-body');
  if (!container) return;
  try {
    const list = await API.getTestimonials();
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-gray-400">No client reviews uploaded.</td></tr>';
      return;
    }

    list.forEach(t => {
      container.insertAdjacentHTML('beforeend', `
        <tr class="border-b border-gray-100 hover:bg-gray-50 text-gray-600 font-medium">
          <td class="py-3 px-6 text-gray-900 font-bold">${t.name}</td>
          <td class="py-3 px-4">${t.role}</td>
          <td class="py-3 px-4 max-w-xs truncate text-xs italic">"${t.review}"</td>
          <td class="py-3 px-4 text-center font-bold text-amber-500">${t.rating} Stars</td>
          <td class="py-3 px-6 text-right">
            <button onclick="deleteTestimonial(${t.id})" class="text-red-500 hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </td>
        </tr>
      `);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    console.error(err);
  }
}

async function deleteTestimonial(id) {
  if (confirm('Delete this client testimonial review?')) {
    try {
      await API.deleteTestimonial(id);
      loadTestimonialsData();
    } catch (e) {
      alert('Delete failed');
    }
  }
}

// ================= SECTION: SETTINGS DATA =================

async function loadSettingsData() {
  try {
    const settings = await API.getSettings();
    document.getElementById('set-brand-name').value = settings.brand_name || '';
    document.getElementById('set-brand-tagline').value = settings.tagline || '';
    document.getElementById('set-phone').value = settings.contact_phone || '';
    document.getElementById('set-email').value = settings.contact_email || '';
    document.getElementById('set-whatsapp-num').value = settings.whatsapp_number || '';
    document.getElementById('set-whatsapp-msg').value = settings.whatsapp_message || '';
    document.getElementById('set-address').value = settings.contact_address || '';
    document.getElementById('set-hours-weekdays').value = settings.hours_weekdays || '';
    document.getElementById('set-hours-sunday').value = settings.hours_sunday || '';
  } catch (err) {
    console.error(err);
  }
}

// ================= SECTION: INQUIRIES DATA =================

async function loadInquiriesData() {
  const container = document.getElementById('inquiries-table-body');
  if (!container) return;
  try {
    const list = await API.getEnquiries();
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-gray-400">All caught up! No inquiries in the inbox.</td></tr>';
      return;
    }

    list.forEach(i => {
      const dateStr = new Date(i.created_at).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      container.insertAdjacentHTML('beforeend', `
        <tr class="border-b border-gray-100 hover:bg-gray-50 text-gray-600 font-medium">
          <td class="py-3 px-6 whitespace-nowrap text-gray-400 font-light">${dateStr}</td>
          <td class="py-3 px-4 font-bold text-gray-900">${i.name}<br><span class="text-gray-400 text-xs font-light">${i.email} | ${i.phone}</span></td>
          <td class="py-3 px-4 font-semibold text-brand-primary">${i.subject}</td>
          <td class="py-3 px-4 max-w-sm text-xs leading-relaxed font-light whitespace-pre-wrap">${i.message}</td>
          <td class="py-3 px-6 text-right">
            <button onclick="deleteInquiry(${i.id})" class="text-red-500 hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </td>
        </tr>
      `);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    console.error(err);
  }
}

async function deleteInquiry(id) {
  if (confirm('Are you sure you want to permanently delete this customer inquiry?')) {
    try {
      await API.deleteEnquiry(id);
      loadInquiriesData();
    } catch (e) {
      alert('Delete failed');
    }
  }
}

// ================= HERO SLIDES CONTROLLER LOGIC =================
let slideImgSrcMode = 'file';
function switchSlideImgSrc(mode) {
  slideImgSrcMode = mode;
  const urlBtn = document.getElementById('slide-src-url-btn');
  const fileBtn = document.getElementById('slide-src-file-btn');
  const urlBox = document.getElementById('slide-img-url-box');
  const fileBox = document.getElementById('slide-img-file-box');

  if (!urlBtn || !fileBtn || !urlBox || !fileBox) return;

  if (mode === 'url') {
    urlBtn.className = "flex-1 bg-brand-primary text-white px-3 py-1 rounded-lg text-[10px] font-bold";
    fileBtn.className = "flex-1 bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-[10px] font-bold";
    urlBox.classList.remove('hidden');
    fileBox.classList.add('hidden');
  } else {
    fileBtn.className = "flex-1 bg-brand-primary text-white px-3 py-1 rounded-lg text-[10px] font-bold";
    urlBtn.className = "flex-1 bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-[10px] font-bold";
    fileBox.classList.remove('hidden');
    urlBox.classList.add('hidden');
  }
}

// Hero Slide submit handling
const heroslidesForm = document.getElementById('heroslides-form');
if (heroslidesForm) {
  heroslidesForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sort_order = parseInt(document.getElementById('slide-sort-order').value || 0);
    let image_url = '';

    if (slideImgSrcMode === 'file') {
      const fileInput = document.getElementById('slide-img-file');
      if (fileInput.files.length === 0) {
        alert('Please select a slide image file to upload.');
        return;
      }
      const fd = new FormData();
      fd.append('images', fileInput.files[0]);
      const uploadRes = await API.uploadImages(fd);
      if (uploadRes.success) {
        image_url = uploadRes.urls[0];
      } else {
        alert('Upload failed: ' + uploadRes.error);
        return;
      }
    } else {
      image_url = document.getElementById('slide-img-url').value;
    }

    try {
      await API.createHeroSlide({ image_url, sort_order });
      heroslidesForm.reset();
      document.getElementById('slide-img-file').value = '';
      await loadHeroSlidesData();
    } catch (err) {
      alert('Failed to save hero slide');
    }
  });
}

async function loadHeroSlidesData() {
  const container = document.getElementById('heroslides-table-body');
  if (!container) return;
  try {
    const list = await API.getHeroSlides();
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-gray-400">No hero slides found.</td></tr>';
      return;
    }

    list.forEach(s => {
      container.insertAdjacentHTML('beforeend', `
        <tr class="border-b border-gray-100 hover:bg-gray-50 text-gray-600 font-medium">
          <td class="py-3 px-6"><img src="${s.image_url}" class="w-24 h-12 object-cover rounded-lg border border-brand-border bg-gray-50"></td>
          <td class="py-3 px-4 font-bold text-gray-900">${s.sort_order}</td>
          <td class="py-3 px-6 text-right">
            <button onclick="deleteHeroSlide(${s.id})" class="text-red-500 hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </td>
        </tr>
      `);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    console.error(err);
  }
}

async function deleteHeroSlide(id) {
  if (confirm('Delete this hero slide?')) {
    try {
      await API.deleteHeroSlide(id);
      await loadHeroSlidesData();
    } catch (e) {
      alert('Delete failed');
    }
  }
}

// ================= SERVICES IMAGE SOURCE SELECTOR =================
let serviceImgSrcMode = 'file';
function switchServiceImgSrc(mode) {
  serviceImgSrcMode = mode;
  const urlBtn = document.getElementById('service-src-url-btn');
  const fileBtn = document.getElementById('service-src-file-btn');
  const urlBox = document.getElementById('service-img-url-box');
  const fileBox = document.getElementById('service-img-file-box');

  if (!urlBtn || !fileBtn || !urlBox || !fileBox) return;

  if (mode === 'url') {
    urlBtn.className = "flex-1 bg-brand-primary text-white px-3 py-1 rounded-lg text-[10px] font-bold";
    fileBtn.className = "flex-1 bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-[10px] font-bold";
    urlBox.classList.remove('hidden');
    fileBox.classList.add('hidden');
  } else {
    fileBtn.className = "flex-1 bg-brand-primary text-white px-3 py-1 rounded-lg text-[10px] font-bold";
    urlBtn.className = "flex-1 bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-[10px] font-bold";
    fileBox.classList.remove('hidden');
    urlBox.classList.add('hidden');
  }
}

// Global exposing of handlers
window.openProductForm = openProductForm;
window.closeProductForm = closeProductForm;
window.switchProductImgSrc = switchProductImgSrc;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.deleteCategory = deleteCategory;
window.switchGalleryImgSrc = switchGalleryImgSrc;
window.deleteGallery = deleteGallery;
window.deleteService = deleteService;
window.deleteTestimonial = deleteTestimonial;
window.deleteInquiry = deleteInquiry;
window.switchSlideImgSrc = switchSlideImgSrc;
window.deleteHeroSlide = deleteHeroSlide;
window.switchServiceImgSrc = switchServiceImgSrc;
