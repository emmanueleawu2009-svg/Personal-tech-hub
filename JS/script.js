const services = {
  powerpoint: { name: 'PowerPoint Design', price: 5000 },
  word: { name: 'Word Services', price: 3500 },
  graphic: { name: 'Graphic Design', price: 5000 },
  makeover: { name: 'Presentation Makeover', price: 6000 }
};

const header = document.getElementById('siteHeader');
const nav = document.getElementById('mainNav');
const navToggle = document.getElementById('navToggle');
const heroVideo = document.getElementById('heroVideo');
const soundToggle = document.getElementById('soundToggle');
const serviceId = document.getElementById('serviceId');
const selectedServiceLabel = document.getElementById('selectedServiceLabel');
const selectedPrice = document.getElementById('selectedPrice');
const projectForm = document.getElementById('projectForm');
const formStatus = document.getElementById('formStatus');
const payButton = document.getElementById('payButton');
const requestButton = document.getElementById('requestButton');

const naira = (amount) => `₦${amount.toLocaleString('en-NG')}`;

window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 30);
});

navToggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('.nav a').forEach((link) => link.addEventListener('click', () => nav.classList.remove('open')));

document.querySelectorAll('.service-action').forEach((button) => {
  button.addEventListener('click', () => {
    setService(button.dataset.service);
    document.getElementById('contact').scrollIntoView({ behavior: 'smooth' });
  });
});

document.querySelectorAll('[data-service]').forEach((card) => {
  if (card.classList.contains('service-card')) {
    card.addEventListener('dblclick', () => setService(card.dataset.service));
  }
});

function setService(id) {
  const service = services[id];
  if (!service) return;
  serviceId.value = id;
  selectedServiceLabel.textContent = service.name;
  selectedPrice.textContent = `From ${naira(service.price)}`;
  payButton.disabled = false;
  formStatus.textContent = `${service.name} selected.`;
}

soundToggle.addEventListener('click', async () => {
  heroVideo.muted = !heroVideo.muted;
  soundToggle.textContent = heroVideo.muted ? 'Sound off' : 'Sound on';
  if (!heroVideo.muted) {
    try { await heroVideo.play(); } catch {}
  }
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

document.getElementById('year').textContent = new Date().getFullYear();

const promoKey = 'pth_promo_start';
const promoDuration = 2 * 24 * 60 * 60 * 1000;
let promoStart = Number(localStorage.getItem(promoKey));
if (!promoStart) {
  promoStart = Date.now();
  localStorage.setItem(promoKey, String(promoStart));
}
function updatePromo() {
  const remaining = Math.max(0, promoDuration - (Date.now() - promoStart));
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  document.getElementById('promoTimer').textContent = remaining ? `${hours}h ${minutes}m ${seconds}s left` : 'Offer window ended';
}
updatePromo();
setInterval(updatePromo, 1000);

projectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(projectForm);
  const payload = Object.fromEntries(formData.entries());
  if (!payload.service) {
    formStatus.textContent = 'Choose a service first.';
    return;
  }
  requestButton.disabled = true;
  formStatus.textContent = 'Sending your project request…';
  try {
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Something went wrong.');
    formStatus.textContent = `${data.message} Your request ID is ${data.orderId}.`;
    projectForm.dataset.orderId = data.orderId;
  } catch (error) {
    formStatus.textContent = error.message;
  } finally {
    requestButton.disabled = false;
  }
});

payButton.addEventListener('click', async () => {
  const formData = new FormData(projectForm);
  const payload = Object.fromEntries(formData.entries());
  if (!payload.service) return;
  if (!projectForm.dataset.orderId) {
    formStatus.textContent = 'Send the project request first, then start payment.';
    return;
  }
  payButton.disabled = true;
  formStatus.textContent = 'Preparing secure payment…';
  try {
    payload.orderId = projectForm.dataset.orderId;
    const response = await fetch('/api/payments/initialize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Payment could not be started.');
    window.location.href = data.authorizationUrl;
  } catch (error) {
    formStatus.textContent = error.message;
    payButton.disabled = false;
  }
});

const observerNav = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      document.querySelectorAll('.nav a[href^="#"]').forEach((a) => a.classList.remove('active'));
      const active = document.querySelector(`.nav a[href="#${entry.target.id}"]`);
      active?.classList.add('active');
    }
  });
}, { rootMargin: '-25% 0px -65% 0px', threshold: 0 });

document.querySelectorAll('main section[id]').forEach((section) => observerNav.observe(section));