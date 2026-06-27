const routes = ['today', 'log', 'guide', 'settings'];

function getRoute() {
  const hash = window.location.hash.replace('#', '');
  return routes.includes(hash) ? hash : 'today';
}

function render(route = getRoute()) {
  const root = document.querySelector('#app');
  const title = document.querySelector('#screen-title');
  const labels = { today: 'Today', log: 'Log', guide: 'Guide', settings: 'Settings' };
  title.textContent = labels[route];
  root.innerHTML = `<section class="panel"><h2>${labels[route]}</h2><p>This view is ready for implementation.</p></section>`;
  for (const button of document.querySelectorAll('[data-route]')) {
    button.classList.toggle('is-active', button.dataset.route === route);
  }
}

document.addEventListener('click', (event) => {
  const routeButton = event.target.closest('[data-route]');
  if (!routeButton) return;
  window.location.hash = routeButton.dataset.route;
});

window.addEventListener('hashchange', () => render());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

render();
