const express = require('express');
const aw = require('../utils/async');
const { requiereLogin } = require('../middlewares/auth');
const { limiteLogin, limiteComentarios } = require('../middlewares/limites');
const cartaController = require('../controllers/cartaController');
const carritoController = require('../controllers/carritoController');
const comentarioController = require('../controllers/comentarioController');
const authController = require('../controllers/authController');

const router = express.Router();

router.get('/', aw(cartaController.inicio));
router.get('/restaurantes/:id', aw(cartaController.verCarta));

router.get('/restaurantes/:id/carrito', aw(carritoController.ver));
router.post('/restaurantes/:id/carrito', aw(carritoController.agregar));
router.post('/restaurantes/:id/carrito/eliminar', aw(carritoController.eliminar));
router.post('/restaurantes/:id/carrito/vaciar', aw(carritoController.vaciar));

router.post('/restaurantes/:id/comentarios', limiteComentarios, requiereLogin, aw(comentarioController.crear));

router.post('/login', limiteLogin, aw(authController.login));
router.post('/logout', aw(authController.logout));

// Compatibilidad con la URL antigua: /index.php?id=1
router.get('/index.php', (req, res) => {
  const id = /^\d{1,10}$/.test(String(req.query.id || '')) ? req.query.id : '';
  res.redirect(301, id ? `/restaurantes/${id}` : '/');
});

module.exports = router;
