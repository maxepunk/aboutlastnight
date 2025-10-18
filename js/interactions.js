/**
 * interactions.js - Interactive behaviors for About Last Night landing page
 *
 * Contains: Accordions, sticky header, parallax, scroll effects, animations
 * Dependencies: None (vanilla JavaScript)
 * Accessibility: WCAG AA compliant with keyboard navigation
 */

// ═══════════════════════════════════════════════════════
// SMOOTH SCROLLING
// ═══════════════════════════════════════════════════════

function initSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// ═══════════════════════════════════════════════════════
// PARALLAX EFFECT
// ═══════════════════════════════════════════════════════

function setupParallax() {
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        return; // Respect user preference
    }

    const parallaxElements = document.querySelectorAll('.hero-bg-image');
    if (!parallaxElements.length) return;

    let lastY = window.pageYOffset || document.documentElement.scrollTop || 0;
    let ticking = false;
    const speed = 0.5;

    function update() {
        parallaxElements.forEach(element => {
            element.style.transform = `translateY(${lastY * speed}px)`;
        });
        ticking = false;
    }

    function onScroll() {
        lastY = window.pageYOffset || document.documentElement.scrollTop || 0;
        if (!ticking) {
            window.requestAnimationFrame(update);
            ticking = true;
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    // Initial position
    update();
}

// ═══════════════════════════════════════════════════════
// HOVER EFFECTS - Evidence Items
// ═══════════════════════════════════════════════════════

function initEvidenceHoverEffects() {
    document.querySelectorAll('.evidence-item').forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.animation = 'policeLights 1s infinite';
        });
        item.addEventListener('mouseleave', function() {
            this.style.animation = '';
        });
    });
}

// ═══════════════════════════════════════════════════════
// INTELLIGENT ANIMATION CONTROL
// ═══════════════════════════════════════════════════════

function setupIntelligentAnimations() {
    const scanline = document.querySelector('.scanline');
    const scanline2 = document.querySelector('.scanline-secondary');
    const heroTitle = document.querySelector('h1');
    const heroSection = document.querySelector('.hero');

    let scrollTimer = null;
    let isScrolling = false;

    // Pause scanline while scrolling for better readability
    window.addEventListener('scroll', function() {
        if (!isScrolling) {
            isScrolling = true;
            if (scanline) scanline.style.animationPlayState = 'paused';
            if (scanline2) scanline2.style.animationPlayState = 'paused';
        }

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function() {
            isScrolling = false;
            if (scanline) scanline.style.animationPlayState = 'running';
            if (scanline2) scanline2.style.animationPlayState = 'running';
        }, 500);
    }, { passive: true });

    // Reduce animation intensity when user is reading (no mouse movement)
    let mouseTimer;
    let reduceAnimations = false;

    function handleMouseMove() {
        if (reduceAnimations) {
            reduceAnimations = false;
            if (scanline) scanline.style.opacity = '1';
            if (heroTitle) heroTitle.style.animationDuration = '15s';
        }

        clearTimeout(mouseTimer);
        mouseTimer = setTimeout(function() {
            reduceAnimations = true;
            if (scanline) scanline.style.opacity = '0.3';
            if (heroTitle) heroTitle.style.animationDuration = '30s';
        }, 10000); // After 10 seconds of no movement
    }

    document.addEventListener('mousemove', handleMouseMove);
    handleMouseMove(); // Initialize

    // Fast scan when hovering hero section
    if (heroSection && scanline) {
        heroSection.addEventListener('mouseenter', function() {
            scanline.style.animationDuration = '3s';
            if (scanline2) scanline2.style.animationDuration = '4s';
        });
        heroSection.addEventListener('mouseleave', function() {
            scanline.style.animationDuration = '30s';
            if (scanline2) scanline2.style.animationDuration = '45s';
        });
    }
}

// ═══════════════════════════════════════════════════════
// SCROLL REVEAL ANIMATIONS
// ═══════════════════════════════════════════════════════

function initScrollReveal() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateX(0)';
                if (entry.target.classList.contains('fade-in-section')) {
                    entry.target.style.transform = 'translateY(0)';
                }
            }
        });
    }, observerOptions);

    // Memory blocks
    document.querySelectorAll('.memory-block').forEach(block => {
        block.style.opacity = '0';
        block.style.transform = 'translateX(-50px)';
        block.style.transition = 'all 0.8s ease-out';
        observer.observe(block);
    });

    // Fade-in sections
    document.querySelectorAll('.fade-in-section').forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(30px)';
        section.style.transition = 'all 1s ease-out';
        observer.observe(section);
    });
}

// ═══════════════════════════════════════════════════════
// PROGRESSIVE DISCLOSURE ACCORDIONS
// ═══════════════════════════════════════════════════════

function initAccordions() {
    // Helper function to close all accordions in a container
    function closeOtherAccordions(container, currentTrigger) {
        container.querySelectorAll('.accordion-trigger, .process-step, .evidence-item, .personnel-file, .faq-item').forEach(item => {
            if (item !== currentTrigger) {
                item.classList.remove('expanded');
                item.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Generic accordion toggle function
    function toggleAccordion(trigger, container) {
        const isExpanded = trigger.classList.contains('expanded');

        // Close other accordions in the same container
        closeOtherAccordions(container, trigger);

        // Toggle current accordion
        if (!isExpanded) {
            trigger.classList.add('expanded');
            trigger.setAttribute('aria-expanded', 'true');
        } else {
            trigger.classList.remove('expanded');
            trigger.setAttribute('aria-expanded', 'false');
        }
    }

    // Process Steps Accordions
    const processSteps = document.querySelectorAll('.process-step');
    processSteps.forEach((step, index) => {
        // Add accordion classes and attributes
        step.classList.add('accordion-trigger');
        step.setAttribute('aria-expanded', 'false');
        step.setAttribute('aria-controls', `process-content-${index}`);
        step.setAttribute('tabindex', '0');
        step.setAttribute('role', 'button');

        // Wrap content in accordion-content div
        const title = step.querySelector('h3');
        const content = step.querySelector('p');
        if (content) {
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'process-content accordion-content';
            contentWrapper.id = `process-content-${index}`;
            contentWrapper.setAttribute('role', 'region');
            contentWrapper.setAttribute('aria-labelledby', title ? title.id : '');
            content.parentNode.insertBefore(contentWrapper, content);
            contentWrapper.appendChild(content);
        }

        // Add click handler
        step.addEventListener('click', (e) => {
            e.preventDefault();
            toggleAccordion(step, step.parentElement);
        });

        // Add keyboard handler
        step.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleAccordion(step, step.parentElement);
            }
        });
    });

    // Evidence Section Accordions
    const evidenceItems = document.querySelectorAll('.evidence-item');
    evidenceItems.forEach((item, index) => {
        item.classList.add('accordion-trigger');
        item.setAttribute('aria-expanded', 'false');
        item.setAttribute('aria-controls', `evidence-content-${index}`);
        item.setAttribute('tabindex', '0');
        item.setAttribute('role', 'button');

        const title = item.querySelector('h3');
        const content = item.querySelector('p');
        if (content) {
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'evidence-content accordion-content';
            contentWrapper.id = `evidence-content-${index}`;
            contentWrapper.setAttribute('role', 'region');
            content.parentNode.insertBefore(contentWrapper, content);
            contentWrapper.appendChild(content);
        }

        item.addEventListener('click', (e) => {
            e.preventDefault();
            toggleAccordion(item, item.parentElement);
        });

        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleAccordion(item, item.parentElement);
            }
        });
    });

    // Creator Profiles Accordions
    const creatorProfiles = document.querySelectorAll('.personnel-file');
    creatorProfiles.forEach((profile, index) => {
        profile.classList.add('accordion-trigger');
        profile.setAttribute('aria-expanded', 'false');
        profile.setAttribute('aria-controls', `creator-content-${index}`);
        profile.setAttribute('tabindex', '0');
        profile.setAttribute('role', 'button');

        const credentials = profile.querySelector('.credentials');
        if (credentials) {
            credentials.id = `creator-content-${index}`;
            credentials.setAttribute('role', 'region');
        }

        profile.addEventListener('click', (e) => {
            e.preventDefault();
            toggleAccordion(profile, profile.parentElement);
        });

        profile.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleAccordion(profile, profile.parentElement);
            }
        });
    });

    // FAQ Accordions
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach((item, index) => {
        item.classList.add('accordion-trigger');
        item.setAttribute('aria-expanded', 'false');
        item.setAttribute('aria-controls', `faq-content-${index}`);
        item.setAttribute('tabindex', '0');
        item.setAttribute('role', 'button');

        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');

        // Do NOT add accordion-trigger to question element to avoid duplicate indicators

        if (answer) {
            answer.id = `faq-content-${index}`;
            answer.setAttribute('role', 'region');
        }

        item.addEventListener('click', (e) => {
            e.preventDefault();
            toggleAccordion(item, item.parentElement);
        });

        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleAccordion(item, item.parentElement);
            }
        });
    });
}

// ═══════════════════════════════════════════════════════
// STICKY HEADER
// ═══════════════════════════════════════════════════════

function initStickyHeader() {
    const bookingBar = document.getElementById('booking-bar');
    const heroSection = document.querySelector('.hero');

    if (!bookingBar || !heroSection) return;

    let lastScrollTop = 0;
    let isSticky = false;
    let scrollTimer = null;

    // Debounce function for scroll performance
    function debounce(func, wait) {
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(scrollTimer);
                func(...args);
            };
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(later, wait);
        };
    }

    // Handle scroll event
    function handleScroll() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;

        if (scrollTop > heroBottom && !isSticky) {
            bookingBar.classList.add('sticky');
            isSticky = true;
        } else if (scrollTop <= heroBottom && isSticky) {
            bookingBar.classList.remove('sticky');
            isSticky = false;
        }

        lastScrollTop = scrollTop;
    }

    // Attach debounced scroll listener (16ms for 60fps)
    window.addEventListener('scroll', debounce(handleScroll, 16));
}

// ═══════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════

// Initialize all interactive behaviors on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Add no-js class removal for progressive enhancement
    document.documentElement.classList.remove('no-js');

    // Initialize all features
    initSmoothScrolling();
    setupParallax();
    initEvidenceHoverEffects();
    setupIntelligentAnimations();
    initScrollReveal();
    initAccordions();
    initStickyHeader();
});
