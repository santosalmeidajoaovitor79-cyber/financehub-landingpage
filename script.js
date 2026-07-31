/* ==========================================
   FINANCEHUB PRO - INTERACTIVITY & ANIMATIONS
========================================== */

// Inicializa Ícones Lucide
lucide.createIcons();

// Scroll Reveal Avançado (Animações de entrada na tela)
document.addEventListener('DOMContentLoaded', () => {
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal, .reveal-scale').forEach(el => observer.observe(el));
});

// Navbar & Sticky CTA Lógica de Scroll
window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    const stickyCta = document.getElementById('sticky-cta');
    
    // Navbar com blur e borda ao descer a página
    if (window.scrollY > 50) {
        nav.classList.add('border-b', 'border-white/5', 'shadow-2xl', 'bg-surface/80');
    } else {
        nav.classList.remove('border-b', 'border-white/5', 'shadow-2xl', 'bg-surface/80');
    }

    // Mostra o botão Flutuante "Comprar" ao passar da Hero Section (aprox 700px)
    if (window.scrollY > 700) {
        stickyCta.classList.remove('translate-y-32', 'opacity-0');
    } else {
        stickyCta.classList.add('translate-y-32', 'opacity-0');
    }
});

// 3D Parallax Effect Corrigido para ser SUAVE
const parallaxWrapper = document.getElementById('parallax-wrapper');
const notebookFrame = document.getElementById('notebook-frame');

document.addEventListener('mousemove', (e) => {
    if (!parallaxWrapper || !notebookFrame) return;
    
    // O Divisor 150 garante que a rotação seja um "suspiro" elegante de 2 a 3 graus
    const xAxis = (window.innerWidth / 2 - e.pageX) / 150;
    const yAxis = (window.innerHeight / 2 - e.pageY) / 150;

    if(window.innerWidth > 768) {
        notebookFrame.style.transform = `rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
    }
});

document.addEventListener('mouseleave', () => {
    if(window.innerWidth > 768 && notebookFrame) {
        notebookFrame.style.transform = `rotateY(0deg) rotateX(0deg)`;
    }
});
