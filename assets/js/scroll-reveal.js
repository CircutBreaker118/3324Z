(function () {
  var SELECTOR = '[data-reveal]';
  var REVEALED_CLASS = 'is-revealed';

  function prefersReducedMotion() {
    return !!(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function revealAllInstantly(elements) {
    for (var i = 0; i < elements.length; i++) {
      elements[i].classList.add(REVEALED_CLASS);
    }
  }

  function init() {
    var elements = Array.prototype.slice.call(document.querySelectorAll(SELECTOR));
    if (!elements.length) return;

    elements.forEach(function (el) {
      var delay = el.getAttribute('data-reveal-delay');
      if (delay) {
        el.style.transitionDelay = delay + 'ms';
      }
    });

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      revealAllInstantly(elements);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add(REVEALED_CLASS);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    elements.forEach(function (el) {
      observer.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
