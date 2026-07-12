// Wood Oak Wonders - General Frontend Scripts

document.addEventListener('DOMContentLoaded', async () => {
  // Hero Heading Typewriter Animation (no cursor)
  function typewriterHero() {
    const segments = [
      { id: 'hero-type-1', text: 'Crafting Timeless' },
      { id: 'hero-type-2', text: 'Wooden Wonders' },
      { id: 'hero-type-3', text: 'That Last Generations' }
    ];
    const speed = 55; // ms per character

    // Reset all spans to empty before typing
    segments.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) el.textContent = '';
    });

    let segIndex = 0;
    let charIndex = 0;

    function typeNext() {
      if (segIndex >= segments.length) return;
      const { id, text } = segments[segIndex];
      const el = document.getElementById(id);
      if (!el) return;

      if (charIndex < text.length) {
        el.textContent += text.charAt(charIndex);
        charIndex++;
        setTimeout(typeNext, speed);
      } else {
        // Move to next segment
        segIndex++;
        charIndex = 0;
        setTimeout(typeNext, 120); // brief pause between segments
      }
    }

    typeNext();
  }

  // Fade out loader (for other pages)
  const loader = document.getElementById('loader-wrapper');
  if (loader) {
    setTimeout(() => {
      loader.classList.add('fade-out');
    }, 400);
  }

  // Fade out and hide Leaf Fall splash screen (for homepage)
  const splash = document.getElementById('splash-screen');
  if (splash) {
    // Typewriter effect for Splash Screen title (without cursor line)
    const splashTitle = document.getElementById('splash-title');
    if (splashTitle) {
      const text = "WOOD OAK WONDERS";
      splashTitle.textContent = ""; // Clear text initially
      
      // Delay typing until the logo reveal begins (2.0s)
      setTimeout(() => {
        let i = 0;
        function typeChar() {
          if (i < text.length) {
            splashTitle.textContent += text.charAt(i);
            i++;
            setTimeout(typeChar, 75); // 75ms typing speed per char
          }
        }
        typeChar();
      }, 1900);
    }

    setTimeout(() => {
      splash.classList.add('fade-out');
      setTimeout(() => {
        splash.style.display = 'none';
        // Start hero typewriter EXACTLY when the website appears
        typewriterHero();
      }, 800);
    }, 3800); // 3.8s is perfect timing for full leaf fall & logo reveal sequence
  } else {
    // No splash (other pages or direct load) — start typing after short delay
    setTimeout(typewriterHero, 300);
  }

  // Load and apply brand settings globally
  let settings = {};
  try {
    settings = await window.API.getSettings();
    applyDynamicSettings(settings);
  } catch (err) {
    console.error('Failed to load dynamic settings:', err);
  }

  // Initialize AOS
  if (typeof AOS !== 'undefined') {
    AOS.init({
      duration: 1000,
      once: false,
      easing: 'ease-out-quad'
    });
  }

  // Lucide Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Sticky Header Logic
  const header = document.querySelector('header');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  // Mobile Hamburger Toggle
  const menuBtn = document.getElementById('menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
      mobileMenu.classList.toggle('flex');
    });
  }

  // Scroll to Top Button
  const scrollTopBtn = document.getElementById('scroll-top-btn');
  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        scrollTopBtn.classList.remove('opacity-0', 'invisible');
        scrollTopBtn.classList.add('opacity-100', 'visible');
      } else {
        scrollTopBtn.classList.remove('opacity-100', 'visible');
        scrollTopBtn.classList.add('opacity-0', 'invisible');
      }
    });

    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});

// Apply Settings dynamically to UI elements
function applyDynamicSettings(settings) {
  // Update Whatsapp links
  const whatsappBtns = document.querySelectorAll('.whatsapp-link');
  if (whatsappBtns.length > 0 && settings.whatsapp_number) {
    const number = settings.whatsapp_number;
    const msg = encodeURIComponent(settings.whatsapp_message || "Hello Wood Oak Wonders, I would like to know more about your handcrafted wooden products.");
    const url = `https://wa.me/${number}?text=${msg}`;
    
    whatsappBtns.forEach(btn => {
      btn.href = url;
    });
  }

  // Global settings like contact info
  const textPhone = document.querySelectorAll('.dynamic-phone');
  const textEmail = document.querySelectorAll('.dynamic-email');
  const textAddress = document.querySelectorAll('.dynamic-address');
  const brandName = document.querySelectorAll('.dynamic-brand-name');

  if (settings.contact_phone) {
    textPhone.forEach(el => {
      el.textContent = settings.contact_phone;
      if (el.tagName === 'A') el.href = `tel:${settings.contact_phone.replace(/\s+/g, '')}`;
    });
  }
  if (settings.contact_email) {
    textEmail.forEach(el => {
      el.textContent = settings.contact_email;
      if (el.tagName === 'A') el.href = `mailto:${settings.contact_email}`;
    });
  }
  if (settings.contact_address) {
    textAddress.forEach(el => {
      el.textContent = settings.contact_address;
    });
  }
  if (settings.brand_name) {
    brandName.forEach(el => {
      el.textContent = settings.brand_name;
    });
  }
}
