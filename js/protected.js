// protected.js - IMPORTAR EN TODAS LAS PÁGINAS PRIVADAS
import { auth } from './firebase-config.js';
import { 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// 🔒 PROTECCIÓN AUTOMÁTICA
onAuthStateChanged(auth, (user) => {
    if (!user) {
        console.log('🚫 No autenticado → Redirigiendo a login');
        localStorage.removeItem('overtrack_user');
        localStorage.removeItem('user_logged');
        window.location.href = 'login.html';
        return;
    }
    
    // ✅ USUARIO AUTENTICADO
    console.log('🔒 Página protegida - Usuario:', user.email);
    
    // Cargar datos usuario
    const userData = {
        email: user.email,
        uid: user.uid,
        esJefe: !['usuario.taller@empresa.com', 'tecnico1@empresa.com'].includes(user.email.toLowerCase())
    };
    
    // 💾 Mantener sincronizado localStorage
    localStorage.setItem('overtrack_user', JSON.stringify(userData));
    
    // Crear botón logout si no existe
    createLogoutButton(userData);
});

// 🛡️ Crear botón logout
function createLogoutButton(userData) {
    // Solo crear si no existe
    if (document.getElementById('overtrack-logout')) return;
    
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'overtrack-logout';
    logoutBtn.innerHTML = `👋 Cerrar Sesión (${userData.email})`;
    logoutBtn.className = 'btn-logout';
    logoutBtn.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        padding: 10px 20px;
        background: #e53e3e;
        color: white;
        border: none;
        border-radius: 25px;
        cursor: pointer;
        font-weight: 600;
        box-shadow: 0 4px 15px rgba(229, 62, 62, 0.4);
        transition: all 0.3s;
    `;
    
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log('👋 Logout exitoso');
        } catch (error) {
            console.error('Error logout:', error);
        }
    });
    
    logoutBtn.addEventListener('mouseenter', () => {
        logoutBtn.style.transform = 'translateY(-2px)';
        logoutBtn.style.boxShadow = '0 6px 20px rgba(229, 62, 62, 0.6)';
    });
    
    logoutBtn.addEventListener('mouseleave', () => {
        logoutBtn.style.transform = 'translateY(0)';
        logoutBtn.style.boxShadow = '0 4px 15px rgba(229, 62, 62, 0.4)';
    });
    
    document.body.appendChild(logoutBtn);
}

// 🔄 Función helper para verificar auth en cualquier momento
window.isAuthenticated = () => {
    const user = JSON.parse(localStorage.getItem('overtrack_user') || 'null');
    return !!user && localStorage.getItem('user_logged') === 'true';
};

window.getCurrentUser = () => {
    return JSON.parse(localStorage.getItem('overtrack_user') || 'null');
};