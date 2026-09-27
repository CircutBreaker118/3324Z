(function () {
  var SELECTOR = '.btn, .member-card';
  var MAX_OFFSET = 4;

  function isEligible() {
    var reduceMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var hoverCapable = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    return !reduceMotion && !coarsePointer && hoverCapable;
  }

  function attach(el) {
    function onMove(event) {
      var rect = el.getBoundingClientRect();
      var relX = (event.clientX - rect.left) / rect.width - 0.5;
      var relY = (event.clientY - rect.top) / rect.height - 0.5;
      var offsetX = relX * MAX_OFFSET * 2;
      var offsetY = relY * MAX_OFFSET - 2;
      el.style.transform = 'translate3d(' + offsetX.toFixed(2) + 'px, ' + offsetY.toFixed(2) + 'px, 0)';
    }

    function onLeave() {
      el.style.transform = '';
    }

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointercancel', onLeave);
  }

  function init() {
    if (!isEligible()) return;
    var elements = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < elements.length; i++) {
      attach(elements[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
