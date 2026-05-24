const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/settingsController');
const { authenticateToken } = require('../middleware/auth');
const tenantGuard = require('../middleware/tenantGuard');

// All routes require auth + tenant
router.use(authenticateToken, tenantGuard);

router.get('/',            ctrl.getSettings);
router.post('/',           ctrl.saveSettings);
router.post('/test-smtp',  ctrl.testSMTP);
router.post('/test-wa',    ctrl.testUltraMsg);
router.get('/logs',        ctrl.getLogs);
router.delete('/logs',     ctrl.clearLogs);

module.exports = router;
