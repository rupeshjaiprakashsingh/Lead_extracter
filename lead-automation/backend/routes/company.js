const express = require('express');
const router  = express.Router();
const userCtrl = require('../controllers/userController');
const { authenticateToken, requireCompanyAdmin } = require('../middleware/auth');
const tenantGuard  = require('../middleware/tenantGuard');
const { checkUserLimit } = require('../middleware/planGuard');

// All routes need auth + tenant
router.use(authenticateToken, tenantGuard);

// Company profile (any authenticated company user can view)
router.get('/profile',  userCtrl.getCompanyProfile);
router.put('/profile',  requireCompanyAdmin, userCtrl.updateCompanyProfile);

// User management (company_admin only)
router.get('/users',                   requireCompanyAdmin, userCtrl.listUsers);
router.post('/users',                  requireCompanyAdmin, checkUserLimit, userCtrl.createUser);
router.get('/users/:id',               requireCompanyAdmin, userCtrl.getUser);
router.put('/users/:id',               requireCompanyAdmin, userCtrl.updateUser);
router.delete('/users/:id',            requireCompanyAdmin, userCtrl.deleteUser);
router.post('/users/:id/reset-password', requireCompanyAdmin, userCtrl.resetPassword);

module.exports = router;
