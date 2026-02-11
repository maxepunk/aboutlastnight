/**
 * Detective Case Report Interactions
 *
 * Minimal JS for evidence item hover effects.
 * Detective reports are single-column with no sidebar,
 * financial tracker, or section navigation.
 */

(function() {
  'use strict';

  /**
   * Evidence items - enhance hover interaction
   */
  const EvidenceItems = {
    init() {
      const items = document.querySelectorAll('.evidence-item');
      if (!items.length) return;

      // CSS handles hover via transition, but add keyboard focus support
      items.forEach(item => {
        item.setAttribute('tabindex', '0');
        item.setAttribute('role', 'article');
      });
    }
  };

  function init() {
    EvidenceItems.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
