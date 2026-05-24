const express  = require('express');
const router   = express.Router();
const authCtrl = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { authLimiter }       = require('../middleware/security');

// Public routes (rate limited)
router.post('/login',           authLimiter, authCtrl.login);
router.post('/refresh',         authLimiter, authCtrl.refreshToken);
router.post('/logout',                       authCtrl.logout);
router.post('/forgot-password', authLimiter, authCtrl.forgotPassword);
router.post('/reset-password/:token', authCtrl.resetPassword);

// Protected routes
router.get('/me',               authenticateToken, authCtrl.getMe);
router.put('/change-password',  authenticateToken, authCtrl.changePassword);

module.exports = router;
