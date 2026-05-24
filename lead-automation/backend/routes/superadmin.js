const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/companyController');
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');

// All routes require SuperAdmin
router.use(authenticateToken, requireSuperAdmin);

router.get('/dashboard',                  ctrl.getSuperAdminDashboard);
router.get('/companies',                  ctrl.listCompanies);
router.post('/companies',                 ctrl.createCompany);
router.get('/companies/:id',              ctrl.getCompany);
router.put('/companies/:id',              ctrl.updateCompany);
router.post('/companies/:id/activate',    ctrl.activateCompany);
router.post('/companies/:id/deactivate',  ctrl.deactivateCompany);
router.post('/companies/:id/assign-plan', ctrl.assignPlan);
router.get('/companies/:id/stats',        ctrl.getCompanyStats);
router.delete('/companies/:companyId/data', ctrl.resetCompanyData);

module.exports = router;
