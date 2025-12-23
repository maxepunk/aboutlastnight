/**
 * NovaNews Article Interactions
 *
 * Scroll-triggered animations, sticky sidebar management,
 * reading progress tracking, and section navigation.
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================

  const CONFIG = {
    // Scroll animation trigger threshold (0 = bottom of viewport, 1 = top)
    animationThreshold: 0.15,
    // Debounce delay for scroll events (ms)
    scrollDebounce: 16,
    // Progress bar update frequency (ms)
    progressUpdateInterval: 50
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Debounce function calls
   */
  function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Check if element is in viewport
   */
  function isInViewport(element, threshold = 0) {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const triggerPoint = windowHeight * (1 - threshold);
    return rect.top <= triggerPoint && rect.bottom >= 0;
  }

  /**
   * Get scroll percentage through article
   */
  function getScrollProgress() {
    const article = document.querySelector('.nn-article');
    if (!article) return 0;

    const articleRect = article.getBoundingClientRect();
    const articleTop = window.scrollY + articleRect.top;
    const articleHeight = article.offsetHeight;
    const windowHeight = window.innerHeight;
    const scrollY = window.scrollY;

    // Calculate progress from article start to article end
    const scrollableDistance = articleHeight - windowHeight;
    const scrolledDistance = scrollY - articleTop;
    const progress = Math.max(0, Math.min(1, scrolledDistance / scrollableDistance));

    return progress;
  }

  // ============================================
  // SCROLL ANIMATIONS
  // ============================================

  const ScrollAnimations = {
    elements: [],

    init() {
      // Find all animatable elements
      this.elements = [
        ...document.querySelectorAll('.evidence-card'),
        ...document.querySelectorAll('.timeline-marker')
      ];

      // Initial check
      this.checkVisibility();

      // Listen for scroll
      window.addEventListener('scroll', debounce(() => {
        this.checkVisibility();
      }, CONFIG.scrollDebounce), { passive: true });
    },

    checkVisibility() {
      this.elements.forEach(el => {
        if (isInViewport(el, CONFIG.animationThreshold)) {
          el.classList.add(
            el.classList.contains('evidence-card')
              ? 'evidence-card--visible'
              : 'timeline-marker--visible'
          );
        }
      });
    }
  };

  // ============================================
  // READING PROGRESS
  // ============================================

  const ReadingProgress = {
    progressBars: [],
    lastProgress: 0,

    init() {
      // Find all progress bar elements
      this.progressBars = [
        document.querySelector('.nn-progress__bar'),
        document.querySelector('.reading-progress__bar')
      ].filter(Boolean);

      this.progressText = document.querySelector('.reading-progress__text');

      if (this.progressBars.length === 0) return;

      // Update on scroll
      window.addEventListener('scroll', debounce(() => {
        this.update();
      }, CONFIG.progressUpdateInterval), { passive: true });

      // Initial update
      this.update();
    },

    update() {
      const progress = getScrollProgress();

      // Only update if changed significantly
      if (Math.abs(progress - this.lastProgress) < 0.005) return;
      this.lastProgress = progress;

      const percentage = Math.round(progress * 100);

      this.progressBars.forEach(bar => {
        bar.style.width = `${percentage}%`;
      });

      if (this.progressText) {
        this.progressText.textContent = `${percentage}% complete`;
      }
    }
  };

  // ============================================
  // SECTION NAVIGATION
  // ============================================

  const SectionNav = {
    sections: [],
    navLinks: [],
    currentSection: null,

    init() {
      // Find sections with IDs
      this.sections = [...document.querySelectorAll('.nn-section[id]')];
      this.navLinks = [...document.querySelectorAll('.section-nav__link')];

      if (this.sections.length === 0 || this.navLinks.length === 0) return;

      // Listen for scroll
      window.addEventListener('scroll', debounce(() => {
        this.updateActiveSection();
      }, CONFIG.scrollDebounce), { passive: true });

      // Click handlers for smooth scrolling
      this.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const targetId = link.getAttribute('href').slice(1);
          const target = document.getElementById(targetId);
          if (target) {
            const navHeight = document.querySelector('.nn-nav')?.offsetHeight || 60;
            const targetPosition = target.offsetTop - navHeight - 20;
            window.scrollTo({
              top: targetPosition,
              behavior: 'smooth'
            });
          }
        });
      });

      // Initial update
      this.updateActiveSection();
    },

    updateActiveSection() {
      const navHeight = document.querySelector('.nn-nav')?.offsetHeight || 60;
      const scrollY = window.scrollY + navHeight + 100;

      let newActiveSection = null;

      // Find current section (last section that starts before current scroll)
      for (const section of this.sections) {
        if (section.offsetTop <= scrollY) {
          newActiveSection = section.id;
        }
      }

      if (newActiveSection !== this.currentSection) {
        this.currentSection = newActiveSection;
        this.updateNavLinks();
      }
    },

    updateNavLinks() {
      this.navLinks.forEach(link => {
        const targetId = link.getAttribute('href').slice(1);
        if (targetId === this.currentSection) {
          link.classList.add('section-nav__link--active');
        } else {
          link.classList.remove('section-nav__link--active');
        }
      });
    }
  };

  // ============================================
  // MOBILE NAV TOGGLE
  // ============================================

  const MobileNav = {
    init() {
      const toggle = document.querySelector('.nn-nav__toggle');
      const links = document.querySelector('.nn-nav__links');

      if (!toggle || !links) return;

      toggle.addEventListener('click', () => {
        links.classList.toggle('nn-nav__links--open');
        toggle.setAttribute(
          'aria-expanded',
          links.classList.contains('nn-nav__links--open')
        );
      });

      // Close on click outside
      document.addEventListener('click', (e) => {
        if (!toggle.contains(e.target) && !links.contains(e.target)) {
          links.classList.remove('nn-nav__links--open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });

      // Close on escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          links.classList.remove('nn-nav__links--open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  };

  // ============================================
  // SIDEBAR STICKY BEHAVIOR
  // ============================================

  const StickySidebar = {
    sidebar: null,
    footer: null,
    isReleased: false,

    init() {
      this.sidebar = document.querySelector('.nn-sidebar');
      this.footer = document.querySelector('.nn-footer');

      if (!this.sidebar || !this.footer) return;

      window.addEventListener('scroll', debounce(() => {
        this.checkRelease();
      }, CONFIG.scrollDebounce), { passive: true });
    },

    checkRelease() {
      const footerRect = this.footer.getBoundingClientRect();
      const sidebarRect = this.sidebar.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // If footer is about to overlap sidebar, release the sticky
      if (footerRect.top < sidebarRect.bottom + 40) {
        if (!this.isReleased) {
          this.sidebar.style.position = 'absolute';
          this.sidebar.style.top = `${window.scrollY + sidebarRect.top - this.sidebar.offsetParent.offsetTop}px`;
          this.isReleased = true;
        }
      } else {
        if (this.isReleased) {
          this.sidebar.style.position = '';
          this.sidebar.style.top = '';
          this.isReleased = false;
        }
      }
    }
  };

  // ============================================
  // FINANCIAL TRACKER ANIMATION
  // ============================================

  const FinancialTracker = {
    animated: false,

    init() {
      const tracker = document.querySelector('.financial-tracker');
      if (!tracker) return;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !this.animated) {
            this.animateBars();
            this.animated = true;
          }
        });
      }, { threshold: 0.3 });

      observer.observe(tracker);
    },

    animateBars() {
      const bars = document.querySelectorAll('.account-row__bar');
      bars.forEach((bar, index) => {
        const targetWidth = bar.dataset.width || bar.style.width;
        bar.style.width = '0%';

        setTimeout(() => {
          bar.style.width = targetWidth;
        }, index * 100);
      });
    }
  };

  // ============================================
  // INITIALIZE ALL MODULES
  // ============================================

  function init() {
    ScrollAnimations.init();
    ReadingProgress.init();
    SectionNav.init();
    MobileNav.init();
    StickySidebar.init();
    FinancialTracker.init();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
