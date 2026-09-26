(function () {
  function readThemeColors() {
    var root = document.documentElement;
    var styles = getComputedStyle(root);
    return {
      text: styles.getPropertyValue('--color-text-muted').trim() || '#64748b',
      accent: styles.getPropertyValue('--color-accent').trim() || '#e85d04',
      grid: styles.getPropertyValue('--color-border-subtle').trim() || '#d8dee6',
      fill: styles.getPropertyValue('--color-accent-soft').trim() || 'rgba(232, 93, 4, 0.12)',
    };
  }

  function initRadar() {
    var canvas = document.getElementById('team-radar-chart');
    var dataEl = document.getElementById('team-radar-data');
    if (!canvas || !dataEl || typeof Chart === 'undefined') {
      return;
    }

    var radar;
    try {
      radar = JSON.parse(dataEl.textContent);
    } catch (e) {
      return;
    }

    var colors = readThemeColors();
    var ctx = canvas.getContext('2d');

    new Chart(ctx, {
      type: 'radar',
      data: {
        labels: radar.labels,
        datasets: [
          {
            label: '3324Z (normalized)',
            data: radar.values,
            backgroundColor: colors.fill,
            borderColor: colors.accent,
            borderWidth: 2,
            pointBackgroundColor: colors.accent,
            pointBorderColor: colors.accent,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 20,
              color: colors.text,
              backdropColor: 'transparent',
            },
            grid: { color: colors.grid },
            angleLines: { color: colors.grid },
            pointLabels: {
              color: colors.text,
              font: { size: 12, weight: '600' },
            },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRadar);
  } else {
    initRadar();
  }
})();
