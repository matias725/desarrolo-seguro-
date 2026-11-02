const express = require('express');
const rateLimit = require('express-rate-limit');
const aw = require('../utils/async');
const { requiereLogin } = require('../middlewares/auth');
const cartaController = require('../controllers/cartaController');
const carritoController = require('../controllers/carritoController');
const comentarioController = require('../controllers/comentarioController');
const authController = require('../controllers/authController');

const router = express.Router();

// Límite contra fuerza bruta en el login: 5 intentos fallidos cada 15 min por IP.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  // Un login fallido también responde con redirección (302), así que el éxito
  // se mide por si quedó un usuario en la sesión, no por el código HTTP.
  requestWasSuccessful: (req) => Boolean(req.session && req.session.usuario),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

// Límite contra spam de comentarios: 10 por hora por IP.
const limiteComentarios = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

router.get('/', aw(cartaController.inicio));
router.get('/restaurantes/:id', aw(cartaController.verCarta));

router.get('/restaurantes/:id/carrito', aw(carritoController.ver));
router.post('/restaurantes/:id/carrito', aw(carritoController.agregar));
router.post('/restaurantes/:id/carrito/eliminar', aw(carritoController.eliminar));
router.post('/restaurantes/:id/carrito/vaciar', aw(carritoController.vaciar));

router.post('/restaurantes/:id/comentarios', limiteComentarios, requiereLogin, aw(comentarioController.crear));

router.post('/login', limiteLogin, aw(authController.login));
router.post('/logout', authController.logout);

// Compatibilidad con la URL antigua: /index.php?id=1
router.get('/index.php', (req, res) => {
  const id = /^\d{1,10}$/.test(String(req.query.id || '')) ? req.query.id : '';
  res.redirect(301, id ? `/restaurantes/${id}` : '/');
});

module.exports = router;
