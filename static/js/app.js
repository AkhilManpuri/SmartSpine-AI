/**
 * app.js
 * SPA Hash Router & Authentication
 */

const $ = id => document.getElementById(id);

// Auth is now managed via Flask sessions and Jinja. No JS auth state needed.

// --- Routing ---
const routes = {
  'services': { title: 'AI Services' },
  'monitor': { title: 'Live Posture Monitor' },
  'analytics': { title: 'Analytics Dashboard' },
  'exercises': { title: 'Correction Exercises' },
  'resources': { title: 'Health Resources' },
  'health-score': { title: 'Composite Health Score' },
  'profile': { title: 'My Profile' }
};

function navigate() {
  let hash = window.location.hash.substring(1) || 'monitor';
  
  // Default to monitor if invalid route
  if (!routes[hash]) hash = 'monitor';
  
  // Update Topbar Title
  $('topbarTitle').textContent = routes[hash].title;

  // Toggle sections
  document.querySelectorAll('.spa-view').forEach(el => {
    el.classList.remove('active');
  });
  const view = $(`view-${hash}`);
  if (view) view.classList.add('active');

  // Highlight sidebar
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.view === hash) {
      btn.classList.add('active');
    }
  });

  // Execute view-specific logic
  if (hash === 'analytics' || hash === 'health-score' || hash === 'exercises') {
    if (window.loadDashboardData) window.loadDashboardData();
  }
}

// --- Boot ---
document.addEventListener('DOMContentLoaded', () => {
  // Clear any legacy e-commerce data as per requirements
  localStorage.removeItem('cart_items');
  localStorage.removeItem('order_history');
  localStorage.removeItem('cart_total');

  // Forms / handlers removed (handled by Flask now)

  // Listen for hash changes
  window.addEventListener('hashchange', navigate);
  
  // Initial route
  navigate();
});
