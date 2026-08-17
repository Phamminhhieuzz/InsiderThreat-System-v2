if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('PWA Service Worker registered'))
      .catch(err => console.log('PWA Service Worker failed', err));
  });
}
